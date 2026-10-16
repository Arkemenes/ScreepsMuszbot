# CPU da coordenação econômica (ARK-128)

## Evidências

Em 83652067: limite20, bucket3932, 464 operações/27 ativas/2 cadeias.
cpuTop59ticks: total27,86; craft6,622 (phasePlan4,073), terminal3,762.
A janela inclui reset e busca geométrica fria (pico111,44); gráficos mostram
também gasto contínuo. Não atribuir toda a média ao regime aquecido.
physicalFree/commitments repetem varreduras do histórico por consumidor;
busca geométrica explora novamente estados equivalentes de atribuição.

## Resultado e critérios

- Compartilhar índice de operações ativas no heap. Histórico é enumerado
  no máximo uma vez por tick entre consultas de reservas; novas operações,
  finalização, substituição de Memory e reset não deixam claims obsoletos.
- Reduzir trabalho repetido de busca geométrica, conservando validade,
  ordem determinística de seleção, menor custo e estratégias configuradas.
  Falha por orçamento não pode ser memorizada como impossibilidade provada.
- Medir trabalho e tempo offline com árvores frias/aquecidas e escala live;
  asserts de trabalho determinístico, sem thresholds de tempo de máquina.
- Preservar limites econômicos, lotes, fretes pendentes, recebimentos,
  intents, cooldown e transporte. Não desligar features nem mudar cadências.
- Check, smoke, grunt com cópia ao cliente, diff e graphify. Ganho de CPU
  do servidor depende de nova janela aquecida comparável de cpuTop.
- Política de labs por tick não acelera manutenção/recuperação e cadeias
  convencionais. Preservar cadência configurada e execução fina das políticas.
- `labPolicy.poll` mantém candidatos vivos numa lista local da chamada;
  mesma ordem/quotas/resultados, sem filtrar todos a cada avanço do generator.
- Após hidratação do histórico, reavaliar imediatamente recusa provisória de
  warming, uma vez. Não reduzir minSamples nem liberar receita sem evidência.

Janela aquecida83652193:20,91CPU/tick; craft4,273 (chains4,192,
startItem1,368,poll1,031,partialSales0,737), terminal2,860; E1N47 sem cadeia,
último scan83652009/sell-warming69. A política E1N45 elevava chains de0,2
para1chamada/tick, incluindo releaseRecovered de todas as salas.

## Review

## Follow-up15/10: resumo do histórico de referência

Reprodução100consultas idênticas no mesmo Game.time/100amostras:
200chamadas a samples e20000inspeções de preços. Cachear somente contagem
válida por lado e tick da última amostra válida, no heap do proprietário
market. Preço corrente/histórico de referência, energia, configuração,
prontidão e idade continuam lidos/calculados a cada reference.

Critérios: resumo compartilhado entre salas/lados/consumidores e ticks
enquanto histórico canônico não muda. Nova coleta, poda (inclusive mantendo
mesmo tamanho), hidratação e reset invalidam antes da próxima leitura.
`samples()` é consulta read-only; todos os consumidores do repo apenas leem.
Provider substituído em testes/integrações não possui esse contrato: analisar
seus dados a cada consulta, sem reuso opaco. Testar valores e motivos antes/
depois, com mutações intratick de snapshot/config/prontidão e vencimento da
idade. Não mover gate de reprice nem mudar seleção, custos ou cadências.

Review: a versão está no ponto de mutação do histórico, sem TTL de preço.
Resumo tem somente escalares derivados; sem Memory adicional ou amostras
duplicadas. Alterações externas arbitrárias nos arrays read-only não são
um mecanismo de atualização de mercado.

## Follow-up 15/10: consulta física por decisão

Hipótese a reproduzir: somar `physicalFree(storage)` e `physicalFree(terminal)`
repete as mesmas enumerações de operações, listings, cadeias e ledger. Expor
`physicalPool` que calcula ambas as disponibilidades numa única decisão;
sem cache entre chamadas, ticks ou mutações. Manter clamp individual por fonte,
exclusão de owner, frete/carga de intents e retiradas pendentes. Fonte vazia
continua evitando análise. Medir 3/5/10 salas, 3/7/10 consumidores e ordens
0/20/100; variar histórico independentemente. Contadores não equivalem a CPU
Screeps nem a quantidade de negócios/recibos criados.

Review: reuso estritamente local não exige versionar estoque ou Memory;
leituras seguintes reavaliam os campos vivos. Comparar com duas consultas
independentes sob reservas, listings, recebimentos, cargo e mutações intratick.

Escopo revisado contra constituição: dado derivado só no heap; nenhum cache
de estoque, preço, quantidade ou saldo. Índice retém identidade de operações
e lê campos mutáveis a cada consulta. Memo de busca vive apenas na busca.
Aceitar evolução de planos antes limitados pelo stall guard somente com
atribuição válida e custo mínimo comprovado pela mesma ordem de budgets.
