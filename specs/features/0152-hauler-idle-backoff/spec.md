# 0152 — Buscas repetidas: hauler ocioso, builder seco e entrega em trânsito

- **Status:** in-progress
- **Owner:** ARK-128
- **Created:** 2026-10-15

## Problem

Haulers vazios, sem nada para carregar e sem job de mineral/cadeia repetiam a
busca inteira (`pickLoad` + `pickPressuredJob` + `pickMineralJob`, ~0,5 CPU por
hauler-tick) **todo tick**. cpuTop 2026-10-15: `pickLoad` 0,96 (5,2 chamadas/tick),
`pickMineralJob` 0,95 (2,7), `chainFeed` 0,36. Ideia do dono: avaliar no tick em
que fica ocioso e depois a cada 5 ticks.

## Desired outcome

Mesma lógica de decisão, com menos buscas vazias. O hauler que fica ocioso busca
imediatamente; enquanto ocioso, busca de novo a cada `hauler.idleRecheckTicks`
(5) e fica em espera entre as buscas.

## In scope

- Marca de ociosidade no heap por creep (nenhuma Memory nova).
- Exceções que mantêm a busca por tick: spawn/extension com fome, qualquer
  carga no tanque, mudança de sala, reset/relógio voltando.
- `hauler.idleRecheckTicks` (1 = comportamento antigo), contador `hauler.idleSkip`.

## Out of scope

- Mudar as decisões em si (`pickLoad`, `pickMineralJob`), prioridades ou o cache
  `repickTicks` de quem já tem alvo.

## Acceptance criteria

1. The smoke test asserts the skip pattern is `true x4, false` after going idle, and that carrying, a hungry spawn, another room, a clock rewind and `idleRecheckTicks = 1` all keep the per-tick search.
2. `hauler.idleSkip` aparece no `cpuTop` (chamadas/tick = buscas evitadas) e `pickLoad`/`pickMineralJob` caem em chamadas/tick.
3. Entrega de energia, produção e fluxo de lab inalterados (invariantes pós-deploy).

## Constitution check

Heap; sem varredura nova; config em `hauler.idleRecheckTicks`; GC da tabela a cada 300 ticks.

## Notes

Latência máxima adicionada: 4 ticks na logística de mineral/cadeia de um hauler já
ocioso. Trabalho urgente (spawn/extension com fome) nunca é atrasado.

## Medição e validação

Decisão do dono (2026-10-15): **o A/B intercalado foi abandonado e removido** (lento e frágil) e os três ajustes
são tratados como **validados**; ficam **ligados** e são acompanhados direto em produção. Spans-alvo (cpuTop):
`pickLoad` 0,96 -> 0,12, `pickMineralJob` 0,95 -> 0,08, `stockPolicy` 0,52 -> 0,04, `chainFeed` 0,36 -> 0,15 (o total do hauler
varia com a carga). Contadores: `hauler.idleSkip`, `builder.idleSkip`, `hauler.deliverKept`. Reverter sem deploy:
`Memory.settings.hauler.idleRecheckTicks = 1`, `...hauler.deliverRepickTicks = 1`, `...builder.idleRecheckTicks = 1`.
