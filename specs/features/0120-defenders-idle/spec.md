# 0120 — Defensores criados mas parados

- **Status:** spec
- **Owner:** Arkemenes
- **Created:** 2026-10-03
- **Relacionadas:** 0032 (combat overhaul), 0036, 0123 (ofensiva); bug, não feature

## Problem

Relato do usuário: defenders são spawnados, mas **ficam parados** em vez de
defender. Ainda não há log nem dump de `Memory` do caso; o que o código permite
afirmar:

- Todo role de defesa só combate se `Memory.rooms[room].defenseActive` for
  verdadeiro (`defender.js:40`, `defenderStriker.js:72`, `defenderMedic.js:50`).
  Quem seta é `rooms/intel.js:53` — **só** para sala com `controller.my` e **só**
  contando hostis de `isHostile` (`ATTACK`/`RANGED_ATTACK`/`WORK` em sala
  própria).
- O spawn é decidido por `rooms/needs.js` a partir de `mem.enemies` (a mesma
  contagem), então os dois critérios *deveriam* concordar. Mas o spawn é
  **reativo**.

Hipóteses para o "parado", em ordem de probabilidade (nenhuma confirmada):

- **H1 — Chegou tarde.** Defender nasce depois do hostil ter saído/morrido
  (spawn leva 3 ticks/parte; invasor pequeno some rápido). `defenseActive` volta
  a `false` e o ramo "nada pra lutar" só anda até 5 tiles do spawn e fica.
  Comportamento *por design*, mas parece "parado" e o creep ainda custa upkeep
  até morrer de velhice.
- **H2 — Ameaça fora da sala-mãe.** Defender é amarrado a `memory.room`;
  `defenseActive` nunca é setado em sala remota/reservada. Hostil em remote =
  defender ocioso em casa.
- **H3 — Trava no rampart.** `defenderStriker` com `meleeClosing` faz
  `moveTo(nearestOwnRampart, {range: 0})` e `return` se o status for
  `OK`/`ERR_TIRED`. Se a rampart escolhida já está **ocupada** por outro
  defender, `moveTo` segue devolvendo `OK` e o creep nunca chega — parado até o
  hostil sair. `nearestOwnRampart` escolhe por alcance, sem excluir tile
  ocupada.
- **H4 — Sem alvo.** `combat.pickTarget()` devolve `null` (ex.: hostil fora do
  alcance/na borda) e o striker dá `return` sem reposicionar.
- **H5 — Par esperando.** Striker/medic em modo par (`partnerId`) onde um dos
  dois nunca nasce por falta de energia; o outro "ajuda" mas não avança.

## Desired outcome

Primeiro **diagnóstico confiável** (qual das hipóteses ocorre em produção),
depois correção do(s) caso(s) real(is), mais um estado observável: um defender
nunca fica "mudo" — ele registra por que está ocioso.

## In scope

- Estado de diagnóstico leve: `creep.memory.idleReason` (`noHostile`,
  `noTarget`, `rampartBlocked`, `partnerWait`, `outOfRoom`) + contagem por sala
  em `Memory.stats` / log com rate-limit.
- Reproduzir cada hipótese no smoke (fixtures de defesa já existem:
  `mkDefenseRoom`).
- Corrigir os casos confirmados; para H1, decidir política (reciclar defender
  ocioso? reduzir `needs` sob ameaça curta?).

## Out of scope

- Defesa de remotes (se H2 se confirmar, vira spec própria).
- Ofensiva (0123).

## Acceptance criteria

1. Smoke: para cada hipótese reproduzível (H3, H4, H5), um cenário que antes
   deixava o creep sem mover agora o move ou registra `idleReason`.
2. Smoke: `defenseActive=true` + hostil à vista → todo defender vivo da sala
   tem ação (`shoot`/`move`/`heal`) no tick, ou `idleReason` explícito.
3. `idleReason` aparece no dashboard/log; após 1 incidente real, a causa
   raiz está registrada nesta spec (seção "Findings") e a correção fecha esse
   caso.
4. `node --check`, smoke verde, `npx grunt`.

## Constitution check

- §3 fail soft (diagnóstico não pode quebrar o role). §1 o registro de motivo
  é escrita em `creep.memory`, não varredura nova. §4 cada hipótese vira
  fixture.

## Open questions

- O defender parado estava numa sala **própria** com hostil visível, ou depois
  que o hostil sumiu, ou numa sala remota? (decide H1 × H2 × H3)
- Modo solo (`defender`) ou par (`defenderStriker`/`Medic`)? Qual RCL/energia?
- Dá para o usuário colar `Memory.creeps[x]` + `Memory.rooms[sala]` de um defender
  parado? É o dado mais valioso.
