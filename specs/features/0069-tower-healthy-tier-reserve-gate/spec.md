# 0069 — Faixa "sadia" da torre também exige reserva do storage

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Depois do ROADMAP 0068 (torre nunca passa de 1% de `hitsMax` num
rampart/wall), o usuário reportou ao vivo: uma torre com apenas 505 de
energia (pouco acima de `tower.repairEnergyRatio`, 0.5 desde o ROADMAP
0067) continuava gastando essa energia reparando um rampart/wall com 500k
de hits, mesmo com a economia da sala longe de estável.

Causa: `worthHardeningByTower` (0068) tratava a faixa "sadia" (< 1% de
`hitsMax`, `isHealthy`) como sempre válida, sem nenhum gate de recurso —
só a faixa "ótima" (>= 1%) nunca era tocada pela torre. Mas uma torre gasta
a própria energia no instante em que tem QUALQUER excedente acima do gate
de reparo, sem custo de população pra se auto-limitar (diferente do
builder). Ou seja: o mesmo problema que o 0068 resolveu pra faixa ótima
(torre sem teto de gasto) também se aplicava, s em menor escala, à faixa
saudável — bastava a torre cruzar `repairEnergyRatio` pra ela gastar em
hardening não-urgente, mesmo com a sala inteira sem reserva de storage.

Pedido do usuário: tratar walls/ramparts com três faixas — crítico (<0.1%,
sempre urgente, nunca espera reserva), sadio (<1%, o alvo) e ótimo (>=1%,
opcional). As faixas em si (0.1%/1%) já estavam certas; o que faltava era
condicionar a faixa sadia, pra torre, à mesma reserva de storage que já
gate a faixa ótima do builder.

## Desired outcome

`utils/rampartRepair.js`'s `worthHardeningByTower(structure, room)` passa a:
- sempre reparar se `isCritical(structure)` — nunca espera reserva, uma
  estrutura prestes a quebrar não pode depender do storage da sala.
- reparar a faixa sadia (`isHealthy`, não-crítica) só quando
  `utils/resourceTiers.aboveReserve(room)` — mesmo piso de 1% do storage já
  usado pela extensão opcional do builder (ROADMAP 0054/0068).
- nunca reparar a faixa ótima (>= 1%) — inalterado desde o 0068.

`roles/builder.js` **não muda** — sua faixa sadia continua sempre válida,
sem gate de reserva. Justificativa: um builder é limitado pela própria
população de creeps da sala (autolimitado), e o pedido do usuário foi
especificamente sobre a torre ("AS torres com 505 de energia continuam
gastando...").

## In scope

- `src/utils/rampartRepair.js`: `worthHardeningByTower` ganha o parâmetro
  `room` e o gate de reserva pra faixa sadia; comentários atualizados.
- `src/structures/tower.js`: passa `tower.room` na chamada.
- `test/smoke.js`: fixture D4 (`H`, healthy-not-critical) reescrita —
  sem reserva não é mais reparada pela torre; com reserva volta a ser;
  crítico continua ganhando de tudo mesmo sem reserva nenhuma.

## Out of scope

- Mudar `roles/builder.js`'s faixa sadia (continua sempre válida, sem
  gate) — fora do pedido do usuário.
- Mudar os valores de `rampartCriticalRatio`/`rampartHealthyRatio` — o
  usuário confirmou que as faixas 0.1%/1% já estão certas, só faltava o
  gate de recurso na faixa do meio pra torre.

## Acceptance criteria

1. Um rampart/wall crítico (< 0.1%) é reparado pela torre mesmo com
   `room.storage` nulo (sem reserva nenhuma). *(smoke)*
2. Um rampart/wall sadio-mas-não-crítico (entre 0.1% e 1%) NÃO é reparado
   pela torre quando a sala não tem reserva de storage (sem storage, ou
   storage abaixo de `logistics.reserveRatio`). *(smoke)*
3. O mesmo rampart/wall sadio É reparado pela torre quando a sala tem
   reserva de storage acima do piso. *(smoke)*
4. Comportamento do builder (`worthHardening`) inalterado nas duas faixas.
   *(smoke, cobertura já existente sem mudança)*
5. `node test/smoke.js "$(pwd)"` verde.
6. `npx grunt` builda sem erro.

## Constitution check

- Nenhuma varredura nova de `Game.creeps`/`room.find` — `aboveReserve` já
  é O(1) sobre `room.storage.store`.
- Nenhum objeto de jogo em Memory — inalterado.
- Fail-soft preservado — `aboveReserve` já é null-safe sem storage
  (devolve `false`, nunca lança); `worthHardeningByTower` propaga esse
  mesmo comportamento.
- Testável offline — coberto pelo smoke existente + fixture ajustada.

## Open questions

Nenhuma — usuário confirmou as faixas (0.1%/1%) e apontou o caso ao vivo
que motivou o gate na faixa sadia especificamente pra torre.

## Outcome

Entregue. `worthHardeningByTower(structure, room)` — crítico sempre repara,
sadio só com `resourceTiers.aboveReserve(room)`, ótimo nunca (0068
inalterado). `roles/builder.js` sem mudança. `node test/smoke.js` verde
(742 assertions, `EXIT:0`), `npx grunt` gerou `dist/main.js` sem erro.
