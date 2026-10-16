# 0149 — Boosts de lab automáticos (decisão dinâmica por preço)

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15
- **Depende de:** 0154 (`energyReport`, duty por ação), 0155 só para o CARRY; regra de mercado em
  `docs/roadmap-otimizacao-e-capacidades-2026-10-15.md` §3b

## Problem

O bot produz XLH2O e o vende; não existe fluxo automático de boost (há só `boostCreep()` manual
no console e `labBoostReservations`, que tira labs da política de produção). Pesquisa no código
do motor (`screeps/engine`, `repair.js`, `build.js`, `upgrade-controller.js`, lido em 2026-10-15):
**a energia descontada é a do esforço base; o boost soma só progresso/hits.** Um creep boostado faz
mais trabalho com a mesma energia, o que é economia de energia e, indiretamente, de CPU (menos
creeps, menos viagens). O `energyLedger` assumia o contrário e já foi corrigido.

Preços flutuam (energia 20–70 créditos no horizonte do dono; compostos também), então **nenhuma
conclusão é fixa**: cada boost é uma decisão dinâmica `E >= E*`.

## Modelo (referência para a implementação)

Por parte WORK com multiplicador `m` (T1 1,5; T2 1,8; T3 2,0) e `L = 1500` ticks de vida:

| Ação | Energia/parte/tick | Progresso extra por parte-vida | Por unidade de composto (30 por parte) |
|---|---:|---:|---|
| upgrade | 1 | `L x (m-1)` | 25 / 40 / 50 |
| repair (hits = 100 x progresso) | 1 | `L x (m-1)` | 25 / 40 / 50 |
| build | 5 | `5 x L x (m-1)` | 125 / 200 / 250 |

Regra: `E >= E* x (1 + h)`, com `E` = preço da energia agora, `h` = histerese (`boost.hysteresis`, 0,2)
e `E* = custo líquido do composto por unidade / (progresso extra por unidade x duty)`. `duty` =
fração de ticks em que a parte age (medida por `energyReport`, 0154). Custo do composto:
estoque próprio = **bid líquido de taxa** (o que se ganharia vendendo); compra = **ask executável na
quantidade** + frete em energia x `E` + taxas (regra de mercado §3b: só `deal`, nunca criar ordem).
Soma-se a energia do boost (20 por parte). Aos preços de 21:52 (energia 31,6): `E*` build 4–7,
repair 22–33, upgrade 18 (XGH2O) a 43 (GH).

## Desired outcome

Creeps relevantes saem do spawn, passam por um lab com o composto e trabalham boostados **somente
quando a conta fecha com os preços do momento**; sem liquidez ou sem composto, saem sem boost, sem
travar spawn nem produção de labs.

## In scope

- Fase 1: **XLH2O (estoque próprio) em builders** (build `E*` ~6,6, robusto) e, se `energyReport`
  mostrar hardening relevante, em creeps de reparo.
- Fase 2: GH/GH2O/XGH2O em upgraders das salas com lab abaixo do RCL8.
- Fase 3 (condicional a medição de viagens): KH/KH2O/XKH2O em haulers (CARRY).
- `boostPolicy.worth(role, compound, context)`: pura, O(1), usa `market.snapshot()` em cache.
- Reserva de lab, abastecimento do composto, aplicação no spawn, fallback sem composto.
- Registro de cada decisão com os preços usados.

## Out of scope

- Boosts de combate (já lidos em `combat.js`), harvest boost (sem ganho de CPU), criar ordens de
  compra ou venda de qualquer tipo (§3b), salas sem lab (o cálculo fica dinâmico; sem lab = não boosta).

## Acceptance criteria

1. The smoke test asserts `boostPolicy.worth` flips from false to true as the energy price crosses `E*`, with hysteresis, for build, repair and upgrade, at energy 20, 31.6 and 70.
2. The smoke test asserts a purchase of compound uses only existing sell orders (`createListing = false`), prices the executable ask for the needed quantity plus freight and fees, and aborts without a listing when depth is missing.
3. The smoke test asserts the creep is spawned **unboosted** when the compound or the market depth is missing, and that no spawn waits for a boost.
4. The smoke test asserts a boosted creep never costs more energy than an unboosted one in `energyLedger` (progress is boosted, energy is not).
5. The smoke test asserts a lab reserved for boosting leaves the production policy (`labBoostReservations`) and returns when the boost is done or after the stall guard.
6. Live (Grafana/log): per decision, the prices used and the realized extra progress (compared with `energyReport`).
7. No active chain stalls because of a boost reservation (invariant checked after deploy).

## Constitution check

Config em `Memory.settings.boost.*` (`enabled` **false** por padrão); stall guard em todo laço de
abastecimento/aplicação; cada subsistema sob `guard()`; nenhum objeto de jogo em Memory (ids).

## Open questions

- `energyReport` (0154) precisa do duty real por ação antes de ligar a fase 1.
- Quantas partes WORK por builder e quanto estoque mínimo de XLH2O manter para vender (política de reserva).
