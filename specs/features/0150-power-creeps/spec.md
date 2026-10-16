# 0150 — Power: processar até GPL 3 e power creeps (decisão dinâmica)

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15
- **Depende de:** 0155 (utilização dos labs) para a fase de power creep; regra de mercado em
  `docs/roadmap-otimizacao-e-capacidades-2026-10-15.md` §3b

## Problem

Não existe lógica de `PowerCreep`. O `powerSpawn` já processa power quando há no store
(`structures/powerSpawn.js`) e o hauler já o alimenta (`powerFeedJob`, energia por
`optionalConsumer`), mas o power (11.197 unidades à venda em 2026-10-15: E1N45 8.692, E1N47 2.505)
**está listado no mercado**. Estado: `Game.gpl` nível 1, 400/3000. Preço do power 2.332
créditos; energia 31,6; XLH2O 1.644 (todos flutuam).

Mecânica (docs.screeps.com/power.html): processar 1 power custa **50 energia** e soma 1 ponto de GPL;
custo cumulativo do nível N = `1000 x N²` (confirmado por 400/3000). 1 GPL livre cria um power creep
Operator nível 0 ou sobe um nível. Vida 5000 ticks; renova de graça num power spawn. Poderes úteis a
este bot, com nível de creep exigido para o tier 1 igual a 0: `GENERATE_OPS`, `OPERATE_LAB` (+2 de
reação por ciclo, base 5), `OPERATE_EXTENSION`, `OPERATE_TERMINAL`, `OPERATE_FACTORY`. Poderes de nível
10+ (`REGEN_SOURCE`, `OPERATE_POWER`) exigem 100 mil+ de power: fora de alcance.

## Decisão do dono

**Processar até GPL 3 (7.600 power) e reavaliar.** A decisão é **dinâmica** (preços flutuam):

`custo_restante = power_faltante x preço_do_power + power_faltante x 50 x preço_da_energia`
`payback_dias = custo_restante / ganho_diário`; processa enquanto `payback_dias <= power.maxPaybackDays`
(config; sugestão 30), **pausa** acima, com histerese 20%. Tabela de sensibilidade (energia 20/31,6/70:
custo de GPL 3 = 25,3 / 29,7 / 44,3 M; retorno 18–28 / 21–33 / 32–49 dias) no roadmap §2.4.
`ganho_diário` do creep = `OPERATE_LAB` em 2 labs (~1.400 XLH2O/dia) x margem de XLH2O (preço - X - LH2O,
**preços executáveis**), medida por `labReport` (0155); **se os labs não estiverem limitados pela taxa
de reação, o ganho é ~0**.
**Demanda também é um gate** (observado em 2026-10-15 22:56: "`sell XLH2O em W7N49`: nenhuma ordem no mercado,
aguardando nova ordem elegível", com 905 unidades prontas e piso 870): o bid de XLH2O (20.859 unidades a 1.200
às 18:26) **pode sumir**. O `ganho_diário` só conta o que o mercado absorve: exige bid executável acima do piso com
profundidade >= `power.creep.minBidDays` dias da produção extra; sem isso o payback é infinito e o creep não é criado.

## Desired outcome

1. **P1:** o power que vai ser processado sai do mercado, vai para o power spawn de W7N49 e é
   processado no ritmo do excedente de energia, até GPL 3 ou até a decisão dinâmica pausar.
2. **PC1** (só se `labReport` confirmar e o payback fechar): um power creep Operator com
   `GENERATE_OPS` + `OPERATE_LAB`, renovado e protegido, sob orçamento de CPU.

## In scope

- Fase 0 (P1): política `power.sellOrProcess` dinâmica; cancelar as listagens de power a processar
  (**a taxa já paga é afundada e não volta**; a decisão não a considera como custo futuro); mover o power
  com `terminalOps.transfer` para a sala do power spawn; reuso de `powerFeedJob`; métricas
  (power restante, GPL, energia gasta, payback atual); pausa/retomada.
- Excedente de power (acima de GPL 3): vender **só em bids existentes** (`deal`, sem taxa de
  listagem) ou manter; listar só com prazo e teto (§3b item 5–6).
- Fase 1: depende de `labReport` (utilização >= limiar configurado).
- Fase 2 (PC1): `src/roles/powerOperator.js` (lógica de `PowerCreep`), criação/upgrade manual por
  console (`createPowerCreep`, `upgradePowerCreep`) com `power.creep.enabled = false` por padrão,
  spawn no power spawn, `enableRoom`, renovação (`renew` quando `ticksToLive < 300`), `GENERATE_OPS`
  a cada cooldown, `OPERATE_LAB` nos labs de saída com mais reagente (10 ops por 1000 ticks por lab),
  reserva de ops, venda de ops excedentes só por `deal`.

## Out of scope

- Power banks e combate por power; comprar power (se algum dia: só ask existente, §3b);
  poderes de nível >= 10; mudar a política de CPU de outras frentes.

## Acceptance criteria

1. The smoke test asserts `power.sellOrProcess` processes while `payback_dias <= maxPaybackDays`, pauses above it, and applies 20% hysteresis, at energy 20, 31.6 and 70 and for power at 2332 +/- 30%.
2. The smoke test asserts that, when processing is chosen, the power listings are cancelled, the power is transferred to the power-spawn room and the hauler feeds it (`powerFeedJob`), with no new market order created.
3. The smoke test asserts surplus power is sold only through existing bids (no listing fee) and that a listing is never created without an expiry and a price cap.
4. The smoke test asserts the decision keeps the previous state when the price has insufficient confidence or is missing.
5. The smoke test asserts the power creep renews before expiring, re-spawns after death, never casts without ops, and is wrapped in `guard()` with a CPU cap that disables it past the cap.
6. Live: `powerStatus()` (GPL, power faltante, energia gasta, payback, decisão e os preços usados).
7. Nenhuma queda de produção/upgrade por energia desviada (o consumo de energia do power spawn só usa excedente: `optionalConsumer`).

## Constitution check

Config em `Memory.settings.power.*`; nenhum objeto de jogo em Memory (ids); stall guard na renovação e
na transferência; `guard()` por subsistema; CPU do power creep medido e limitado.

## Open questions

- `power.maxPaybackDays` (sugestão 30) e o destino dos 3.597 power que sobram (vender em bids ou guardar).
- Confirmar `REACTION_TIME.XLH2O` e o efeito de `OPERATE_LAB` no consumo de reagente (assumido: consome
  na mesma proporção; o ganho líquido é a margem, não a receita bruta).
