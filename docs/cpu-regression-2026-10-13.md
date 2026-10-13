# Regressão de CPU — ARK-116

Meta: recuperar média abaixo de 9 CPU, validada no shard3.

## Evidência live fornecida

Janela de 20 ticks às 00:16:14: média 20,15 CPU, interrupções por bucket
vazio; `craft.chains` 5,679, hauler 5,149, `pickMineralJob` 2,570,
`chainFeed` 1,204 e terminalOps 1,851 CPU/tick. Spans são inclusivos: não
somar `chainFeed` a `pickMineralJob` nem os spans aos módulos. Sem scout
ou claimer executando nessa janela; busca local custa 0,046 CPU/tick.

Janela anterior de 40 ticks: média 15,28; `craft.scan` chegou a 86,05 CPU
em uma chamada. Essa varredura continua sendo um ponto a acompanhar após
as correções abaixo. Os subtotais legados de terminalOps mostram valores
incompatíveis com a média total; usar o módulo no medidor unificado para
comparação antes/depois, sem somar esses subtotais.

## Causas e correções demonstradas

- `labPolicy.widePlan` reconstruía e ordenava alternativas geométricas em
  cada tick do fallback. Cache limitado de planos e fases no heap, separado
  por slots, produtos e janela do lote; troca de receita invalida o cache.
  Estoque, confirmação de intents e abastecimento continuam por tick.
- `stockPolicy.used` reconstruía o mapa completo de alvos para verificar
  um recurso. Lookup direto preserva override por sala, validação e
  alterações de configuração no mesmo tick.
- `labReagentJob` consultava o mesmo reagente novamente em cada reação.
  Cache local à seleção, inclusive ausência de estoque; a próxima seleção
  consulta o estoque novamente.
- Previsão de combustível recalculava os compromissos para cada venda
  opcional em escassez. Limite calculado uma vez por previsão; chamadas
  futuras continuam observando alterações de estoque/operações.

## Medição offline

Node local; estes tempos não equivalem à CPU do engine Screeps.

| Trecho | Antes | Depois | Trabalho |
| --- | ---: | ---: | --- |
| Fallback XGH2O, 10 labs, 300 ticks | 1.221,26 ms | 18,49 ms | 299 planos reutilizados; ~98,5% menos tempo |
| 30.000 consultas em 40 alvos de estoque | 102,73 ms | 22,00 ms | mesmas 30.000 respostas positivas |

Regressões cobrem reuso, bounds, troca de receitas/slots/targets, ausência
de geometria na Memory, reserva opcional sem cache obsoleto e consulta de
reagentes por seleção. Suite de produção dos labs permanece verde.

## Validação pendente

Após sincronização: coletar `cpuTop(20)` e `Memory.stats.cpu.meter` com pelo
menos 300 ticks, abrangendo um ciclo de scan. Observar média, `craft.chains`,
hauler/`pickMineralJob`/`chainFeed`, `craft.scan` e recuperação do bucket.
A meta <9 permanece aberta; não atribuir ganho live ao benchmark offline.
