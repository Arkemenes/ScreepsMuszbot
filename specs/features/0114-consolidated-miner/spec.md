# 0114 — Miner estático gordo + gate/corpo do mineralMiner

**Status:** done

> A pasta mantém o nome original (`consolidated-miner`) porque as pastas nunca
> são renumeradas/renomeadas. O miner **consolidado** (1 creep andando entre
> sources + mineral) foi descartado nesta rodada: ver "Fora de escopo".

## Problema

Cada intent bem-sucedido (`harvest`, `transfer`) custa ~0.2 CPU (profile
2026-10-02, **premissa não re-medida**). Um miner de 5 WORK faz 300 harvests por
ciclo de source (300 ticks) e, com 1 CARRY, ~60 transfers. Mais WORK por
miner = menos harvests por ciclo; mais CARRY = menos transfers. O custo é
energia de spawn extra. O `mineralMiner` tinha corpo fixo `[MOVE, WORK×8]`
(1 MOVE para 8 WORK = 8 ticks por tile) e spawnava para qualquer quantidade
restante, ficando ocioso quase a vida toda em depósitos quase vazios.

## Decisões (usuário, 2026-10-03)

- Miner estático de **W15/M3/C4** quando a sala paga; regride degrau a degrau
  conforme `energyCapacityAvailable` (a curva segue a capacidade real —
  spawns + extensions já construídas —, não o RCL).
- Sem flag: vai direto (economia estável). Config só para os parâmetros do
  mineral.
- `mineralMiner` **sempre sem CARRY**.
- Prioridade continua sendo a energia: nada aqui atrasa o spawn do 1º miner
  (0112 intacto).

## Evidência

`simulate-grid.js` / `notes.md` (grid W×M×C × 3 distâncias × 2 políticas de
transfer). Pontos relevantes (por miner, D=25):

| corpo | custo | CPU/tick | energia/tick |
| --- | --- | --- | --- |
| W5/M1/C1 (antes) | 600 | 0.240 | 0.44 |
| W12/M3/C3 | 1500 | 0.095 | 1.07 |
| W15/M3/C4 | 1850 | 0.076 | 1.35 |

Ganho por sala de 2 sources ≈ 0.33 CPU/tick por ≈ 1.8 energia/tick extra
(~9% da renda). O joelho da curva fica entre W12 e W16: acima de W20 o preço
passa de 24 energia por CPU poupado.

## Resultado

### `roles/miner.js`

`BODY_LADDER` (do maior para o menor): `W15/M3/C4` (1850) · `W12/M3/C3` (1500) ·
`W10/M2/C3` (1250) · `W8/M2/C2` (1000) · `W6/M1/C2` (750) · `W5/M1/C1` (600).

- `bodyForBudget(budget, withCarry)`: maior degrau cujo custo cabe em `budget`
  (ou `null`). Sem nada para alimentar (sem link network e RCL < 3) o CARRY é
  0, mesmo WORK/MOVE.
- `minerBody(room)`: sala instável (`isRoomStable`) ou < 5 extensions →
  corpo mini `[MOVE, WORK, WORK(, CARRY)]` (como antes). Senão `budget` =
  `energyCapacityAvailable`, **ou `energyAvailable` quando não há nenhum miner
  vivo** (anti-deadlock do 0112: o 1º miner usa o maior degrau que o spawn
  paga agora). `null` → corpo mini.
- Extensions contadas via `roomCache.myStructures` (princípio 1).

### `roles/mineralMiner.js`

- **Gate de spawn:** `wanted()` = 0 abaixo de `mineralMiner.minAmount`
  (2000). Um creep já no depósito termina o trabalho; o gate só impede
  *novo* spawn (200 restantes = 9% da vida ocupada, 4.5 energia/unidade;
  2000 = 89%, 0.45).
- **Corpo sob medida:** `W = clamp(ceil(5·amount / 1400), minWork 4, maxWork
  12)`, reduzido até caber em `energyCapacityAvailable`; `MOVE = ceil(W/5)`;
  CARRY 0. Energia por unidade ≈ 0.4 independe de W; W maior só acelera.
- `body` exportado para teste.

### `utils/config.js`

`mineralMiner: { minAmount: 2000, minWork: 4, maxWork: 12, lifeBudget: 1400 }`.

## Fora de escopo

- **Miner consolidado** (1 creep revezando 2 sources + mineral): `harvest` total
  é o mesmo, só elimina a lógica por creep (~0.06/tick) e traz ponto único de
  falha, torre de source-defense sem alimentação e conflito com o §7. Reavaliar
  só se a medição do estático mostrar que ainda falta CPU.
- **Gate por estoque do mineral** (não spawnar se storage+terminal já passam de
  X): adiado para a feature de venda e compra automática (decisão do usuário,
  2026-10-03). Hoje o excedente é vendido à mão e acumular é intencional; um
  teto pararia a mineração no meio disso. Quando a venda automática existir, o
  gate deve reaproveitar o piso de venda dela (não spawnar se o estoque já
  passa do que será vendido no ciclo) e, se couber, um limite de espaço livre
  do storage (~5%). Exceção a manter: insumo de reação de lab / cadeia do
  `craftPlanner` abaixo do consumo libera o spawn (princípio 9).
- **Transferir só com store cheio** (política B da simulação): ganho de
  0.002 CPU/tick por source com C4 — não compensa mexer em `distribute()`.

## Riscos

- **Espera por energia:** o corpo cheio custa 1850; a reposição de um miner com
  outro vivo bloqueia (tier crítico) até o spawn juntar 1850. O
  `replacementLeadTime` cobre spawn + viagem, não a espera por energia. Observar
  ao vivo se alguma source fica sem WORK entre o miner antigo e o novo.
- **Viagem longa:** W15 com M3 anda 5 ticks/tile em plain (~125 ticks para 25
  tiles); o `replacementLeadTime` já considera pelo `pathTravelTicks`.
- **Ganho de CPU é modelo:** conferir antes/depois com `cpuMeter` (princípio
  1) — `Memory.stats.cpu.meter` por role `miner` / `mineralMiner`.

## Critérios de aceitação (smoke)

- `0114: capacity 1850 -> miner W15/M3/C4`
- `0114: capacity just below 1850 -> regresses to W12/M3/C3`
- `0114: bigger capacity does not buy more than W15`
- `0114: nothing to feed -> no CARRY, same WORK`
- `0114: below the smallest rung -> null (caller falls back to the mini body)`
- `0114: every rung is affordable, <= 50 parts, and WORK never grows as capacity shrinks`
- `0114: mineral below minAmount -> no mineralMiner spawn`
- `0114: mineral at minAmount -> mineralMiner wanted`
- `0114: mineral container full -> no mineralMiner spawn`
- `0114: tiny deposit -> mineralMiner floor of 4 WORK`
- `0114: 2000 left -> 8 WORK`
- `0114: huge deposit -> capped at 12 WORK`
- `0114: mineralMiner body shrinks to the room's capacity`
- `0114: mineralMiner never has CARRY, MOVE ~ WORK/5`
