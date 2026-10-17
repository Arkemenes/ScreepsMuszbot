# 0145 — Régua de CPU e harness de equivalência

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15

## Problem

O plano de `docs/cpu-optimization-plan-2026-10-15.md` (seções 12 e 13) precisa
medir ganhos pequenos (0,1–1 CPU) sem perder funcionalidade. Hoje:

- `profiler.output` divide a sessão de 100 ticks por 98 (`startTick = enabledTick + 1`).
- `cpuMeter.record.max` é o máximo de **uma chamada**, não do tick agregado.
- Os resultados não registram reset nem versão do bundle, então janelas com
  reset e partida a frio se misturam ao regime estacionário.
- Não existe um oráculo reutilizável que compare a implementação de referência
  com a candidata nos mesmos cenários.

## Desired outcome

Toda medição informa janela efetiva, reset e versão. O baseline estacionário
(3 janelas × 600 intervalos, sem profile, sem reset) é reproduzível. Existe um
harness offline que roda referência e candidata sobre os mesmos mundos e falha
em qualquer divergência observável. Nenhum comportamento do jogo muda.

## In scope

- Contagem efetiva de ticks no `profiler.output` (inclui sessões interrompidas).
- Publicar em `cpuTop`/`cpuBalance`: `lastGlobalReset`, tick de início da janela
  e hash/versão do bundle; marcar a janela como "inclui reset" quando houver.
- Máximo por tick agregado, opcional, no heap, sem JSON por tick em Memory.
- `test/equivalence/` com helper `compareImplementations(reference, candidate,
  worlds, projection)` que compara intents, alvos, quantidades, ordem, taxas,
  estoques, custo médio e claims.
- Orçamento do modo sombra live (opcional, por flag): no máximo 1 decisão pura
  por frente por tick, bucket > 9.000, teto de CPU e auto-desligamento.

## Out of scope

- Qualquer otimização de lógica de jogo (0146 em diante).
- Mudar cadências, políticas, população ou formato de Memory.stats lido pelo exporter.
- Sombra live para decisões que mutam estado (claims, ledger, ordens).

## Acceptance criteria

### Reparo de isolamento cpuReport — ARK-145, 2026-10-16

cpuReport(n) inicia uma janela nova no tick seguinte ao comando, encerrando n ticks de origem completos depois disso. Não reseta a telemetria existente. n é limitado à capacidade válida do ring de cpuAccounting. O balanço do último tick é conhecido no tick seguinte; somente então imprimir. Repetir o comando substitui a solicitação anterior; reload global cancela a solicitação manual e permite o auto-report identificado como tal.

O balanço impresso é recortado aos endpoints solicitados, sem amostras anteriores ou posteriores. Falta de cobertura (gap, saturação de bucket, falta de endTick ou ring descartado) aparece como incomplete, nunca se completa com dados anteriores. A configuração reuseOrderBook/listingPolicy é registrada na abertura e comparada ao fechamento; diferenças invalidam comparação. Alterações intermediárias revertidas não são detectadas, portanto manter configuração fixa durante a janela.

O auto-report usa a janela warm após o boot. cpuTop manual e publicação de stats conservam seus acumuladores/janelas. A tabela de módulos/roles/spans continua sendo a janela recente própria, explicitamente identificada; não alegar atribuição exata dos n ticks. O recorte percorre o ring somente ao fechar; espera é O(1), sem novo scan Game/Memory ou ring por tick.

AC adicionais: comando após 74 ticks de histórico não imprime 77 ticks depois; 150 amostras novas substituem baseline antigo; rearm, rollover, auto/off/reload, capacidade inválida, bucket cheio, gap, falta de endTick, máximo/resíduo/pareamento e troca de flag preservam a separação. Comparar duas janelas150 estáveis em jogo somente depois do reparo.

1. The smoke test asserts `profiler.output` reports 100 for a 100-tick session.
2. The smoke test asserts a window containing a global reset is flagged `includesReset`.
3. The smoke test asserts the aggregate per-tick max is kept in heap and absent from Memory.
4. `test/equivalence/` exports `compareImplementations`; a deliberately divergent
   candidate fixture fails it and an identical one passes.
5. The shadow mode is off by default; with it on it never exceeds its CPU cap and
   disables itself past it (asserted with a fake `Game.cpu`).
6. Overhead of the new counters measured and recorded (heap only, no extra
   `Room.find`, no extra pass over `Game.creeps`).

## Constitution check

Heap para contadores, nada de objeto de jogo em Memory, `guard()` mantido, sem
loops sem guarda de parada.

## Open questions

- Fonte do hash/versão do bundle (build-time vs. `Game.time` do primeiro tick).
