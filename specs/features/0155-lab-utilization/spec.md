# 0155 — Utilização dos labs (`labReport`)

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15
- **Habilita:** 0150 (decide se `OPERATE_LAB` tem retorno)

## Problem

`OPERATE_LAB` só aumenta a produção se os labs de saída estiverem **limitados pela taxa de reação**,
não por falta de reagente ou de transporte. O `labPolicyRuntime` já classifica cada lab por tick em
`state.wait` (`cooldown`, `input`, `ready`, `capacity`, `switch`, `unavailable`), mas nada agrega isso: sem
essa medição, o ganho de ~1.400 XLH2O/dia do power creep (0150) é uma suposição.

## Desired outcome

`labReport` imprime sozinho, por sala industrial, a fração de ticks de cada lab de saída em cada estado,
a utilização produtiva e uma conclusão objetiva: **limitada pela taxa de reação** ou **limitada por
reagente/transporte**.

## In scope

- Contadores heap por sala e por lab de saída, incrementados onde `state.wait` é gravado
  (`labPolicyRuntime.assignments`); nada novo por tick fora disso.
- Utilização produtiva = `(cooldown + ready) / ticks` do lab de saída (estar em cooldown = reação em andamento;
  `ready` = reação emitida neste tick).
- Indicador **`reactionLimited`** = utilização produtiva >= `labs.reactionLimitedThreshold` (padrão 0,85) na
  janela, e **`inputLimited`** = parcela de `input` + `switch` + `unavailable` >= 0,15.
- Unidades produzidas por dia estimadas = `lab-ticks produtivos x LAB_REACTION_AMOUNT / REACTION_TIME[produto]`
  (conferir `REACTION_TIME` real) e comparação com a produção confirmada da cadeia.
- `labReport(n=1200)` manual e auto-relatório pós-boot (`stats.autoLabReportTicks`).

## Out of scope

- Mudar política de labs; otimizar `labPolicy` (isso é 0156/L3).

## Acceptance criteria

1. The smoke test asserts the counters reproduce the `state.wait` states of a scripted lab sequence, per lab.
2. The smoke test asserts `reactionLimited` is true for a fixture with ~95% productive ticks and false (with `inputLimited` true) for one with ~50%.
3. The smoke test asserts the report prints by itself after the window and does not alter any lab decision.
4. The smoke test asserts the report prints the **top 3 idle reasons** (`input`, `switch`, `unavailable`, `capacity`) per room with their share of ticks and a one-line suggestion (e.g. "limited by reagent/transport: improve hauler supply before considering OPERATE_LAB").
5. O custo de CPU do contador é O(labs) por chamada de `assignments` (medir pelos spans do `cpuReport`).

## Constitution check

Heap só; relatório sob `guard()`; nenhuma Memory nova.

## Open questions

- Janela mínima para confiar (sugestão: 1 dia real, ~21.000 ticks, por causa dos ciclos de 60 ticks e das trocas de fase).
