# 0052 — `notifyWhenAttacked(false)` for routine-exposure roles

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

`old_1/prototype.creep.role.scout.js` chamava
`this.notifyWhenAttacked(false)` porque um scout leva dano toda vez que
cruza uma sala hostil — rotina do role, não uma emergência — e sem isso
o Screeps manda um email a cada vez. Hoje nenhum role do `src/` desliga
essa notificação, então qualquer role que rotineiramente entra em
território hostil/estrangeiro (`scout`, `raider`, `squadDismantler`,
`pioneer`, e o `reserver` em missão `"contest"`, ROADMAP 0046) gera esse
spam de email por comportamento esperado.

## Desired outcome

Um creep desses 5 casos nunca dispara o email padrão de "fui atacado" -
continua tomando dano normalmente (a notificação é só o email, não afeta
o combate), mas o jogador só é avisado pelos meios que já usa de propósito
(console, `pioneerStatus()`, etc.), não por um email por sala hostil
cruzada.

## In scope

- `src/utils/combat.js`: `silenceAttackAlerts(creep)` — chama
  `creep.notifyWhenAttacked(false)`. Compartilhado (constitution §5) em
  vez de duplicado em cada role.
- `src/roles/scout.js`, `raider.js`, `squadDismantler.js`, `pioneer.js`:
  chamam no topo do `run()`, todo tick (idempotente, sem custo além da
  própria intent nativa).
- `src/roles/reserver.js`: chama só quando `memory.mission === "contest"`
  — `"reserve"`/`"claim"` visam sala neutra ou já seguramente
  reivindicada, sem razão rotineira pra tomar dano lá.

## Out of scope

- `defender`/`defenderStriker`/`defenderMedic`/`bootstrap`/economia em
  geral — esses ficam em território próprio (ou, no caso da dupla de
  combate, tomar dano ali É a notícia que interessa).
- Desligar a notificação condicionalmente por localização atual (ex.: só
  quando de fato fora de sala própria) — os 5 roles listados já são
  "sempre exposto" por definição do próprio trabalho deles; simplicidade
  > precisão aqui, mesmo padrão do `old_1`.

## Acceptance criteria

1. `scout`/`raider`/`squadDismantler`/`pioneer` chamam
   `creep.notifyWhenAttacked(false)` incondicionalmente no `run()` —
   `test/smoke.js`: 4 casos.
2. `reserver` chama `notifyWhenAttacked(false)` em missão `"contest"`,
   mas **não** em `"reserve"`/`"claim"` — `test/smoke.js`: 3 casos.

## Constitution check

- **CPU:** uma intent nativa por creep por tick, mesma classe de custo de
  qualquer outra chamada de creep já feita — nenhuma varredura nova.
- **Roles thin, utils own cross-cutting concerns**: a função mora em
  `utils/combat.js`, cada role só chama.
