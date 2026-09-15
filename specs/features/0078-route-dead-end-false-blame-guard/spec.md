# 0078 — route-dead-end-false-blame-guard

- **Status:** done
- **Owner:** usuário (bug reportado ao vivo, produção)
- **Created:** 2026-09-14

## Problem

Usuário reportou ao vivo: um pioneer ficou parado na divisa entre E1N47
(sala própria, com spawn) e a sala bloqueada. Investigação do
`Memory.rooms['E1N47']` confirmou a suspeita do próprio usuário —
`routeDeadEndUntil` estava setado na sala-mãe, **própria**, com spawn.
`retreatFrom()` (ROADMAP 0063/0076) tinha culpado E1N47 como beco-sem-saída
e compartilhado isso via `markDeadEnd()` (ROADMAP 0076) — bloqueando o
roteamento de/para a própria base pra todo creep do império.

Causa raiz rastreada: quando `retreatWithoutBlame()` (ROADMAP 0064) recua
mais um passo e não sobra sala anterior nenhuma (`_routeRetreatTo` não é
setado), `moveToRoom()` cai no fallback "tenta de novo pelo fluxo normal, a
partir da mesma sala" (comentário original: "fail-soft, fall through to the
normal findRoute()-based flow below as an absolute last resort"). Se ESSE
fluxo normal também falhar (`ERR_NO_PATH` por `routing.noPathTicks` ticks
seguidos) enquanto o creep ainda está na MESMA sala, `retreatFrom()` dispara
de novo — dessa vez culpando `creep.room.name`, que já não é mais o beco
original, e sim a sala pra onde ele tinha acabado de recuar (nesse caso,
E1N47). Isso é exatamente o padrão "search-space acumulado ficou
constrangido demais" que `retreatWithoutBlame()` existe pra não culpar — só
que um nível abaixo, fora do alcance daquela proteção.

## Desired outcome

`retreatFrom()` nunca mais culpa (nem no `_routeAvoid` por-creep, nem no
cache compartilhado `markDeadEnd`) uma sala que é, na verdade, o ponto de
recuo de um ciclo anterior sem histórico mais antigo pra trás — delega pra
`retreatWithoutBlame()` nesse caso específico. Continua culpando
normalmente o primeiro travamento genuíno de uma viagem (creep que nunca
saiu da própria sala de origem e não acha caminho nenhum — esse sinal
continua confiável, é o próprio ROADMAP 0063). Adicionalmente, nenhuma sala
**própria** (`Memory.rooms[x].my`) é jamais marcada como beco-sem-saída —
nem no cache compartilhado nem no `_routeAvoid` do creep — porque
`architect.js` sempre planeja estrada até toda saída da sala; uma falha de
roteamento numa sala própria nunca é um fato permanente sobre a sala.

## In scope

- `utils/routing.js`: `hasEarlierRoom(creep)` novo; `retreatFrom()` delega
  pra `retreatWithoutBlame()` quando `_routeAvoid` já não está vazio **e**
  não há sala anterior — nunca no primeiro travamento de uma viagem.
- `utils/routing.js`: `markDeadEnd()` recusa marcar sala própria
  (`remotes.isMine`); `retreatFrom()` também pula o push no `_routeAvoid`
  por-creep pra sala própria.

## Out of scope

- Investigar a fundo POR QUE o `ERR_NO_PATH` aconteceu de novo em E1N47
  especificamente (se foi o `knownStructureMatrix` do ROADMAP 0077, o
  próprio acúmulo de `_routeAvoid`, ou outra causa transitória) — os dois
  guards aqui tornam a CONSEQUÊNCIA seguro independentemente da causa exata,
  sem precisar fechar esse diagnóstico primeiro.
- Limpar retroativamente marcas já gravadas em produção antes do deploy —
  `clearRouteDeadEnd("E1N47")` no console resolve isso manualmente.

## Acceptance criteria

1. Um creep cujo `_routeAvoid` já tem uma entrada e que trava de novo numa
   sala sem histórico anterior (`_routeStack` só com a sala atual) NÃO
   ganha essa sala em `_routeAvoid` nem em `isKnownDeadEnd`.
2. Um creep no seu PRIMEIRO travamento da viagem (mesma condição de sala
   sem histórico, mas `_routeAvoid` ainda vazio) continua sendo culpado
   normalmente — comportamento pré-0078 preservado (testes mazeCreep/
   parkedCreep já existentes continuam verdes).
3. `markDeadEnd(roomName)` nunca marca uma sala com `Memory.rooms[x].my
   === true`, seja chamada direta ou via `retreatFrom()`.
4. `retreatFrom()` nunca adiciona uma sala própria ao `_routeAvoid`
   por-creep.
5. `node test/smoke.js "$(pwd)"` verde, `node --check` limpo, `npx grunt`
   builda.

## Constitution check

- **Fail-soft (§3):** os dois guards são puramente defensivos — nunca
  lançam, só deixam de marcar/culpar em mais casos que antes.
- **Testável offline (§4):** `test/smoke.js` cobre AC1-AC4 com cenários
  dedicados, sem tocar os testes pré-existentes que AC2 exige preservar.

## Open questions

Nenhuma pra fechar esta task — a causa exata do `ERR_NO_PATH` repetido em
E1N47 fica como investigação futura (ver "Out of scope"), sem bloquear o
guard defensivo.
