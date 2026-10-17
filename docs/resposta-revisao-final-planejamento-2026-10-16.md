# Resposta à revisão independente — candidata r2

Data:2026-10-16. ARK-141. [Parecer r1](revisao-final-planejamento-2026-10-16.md).
Somente documentos alterados. Todos os AC de implementação/live permanecem abertos. Reavaliação independente concluída favoravelmente; R1–R6 fechados no desenho. A candidata r2 recebeu ainda uma correção de protocolo durante essa reavaliação, descrita abaixo.

| Achado | Endereçamento incorporado | Tarefas/assertions futuras |
|---|---|---|
| R1 — seleção de boost | 0149 passa a modelar bodyPartsCount/ordem real; índices são previsão. Piloto rejeita prefixo com parte destruída, não salta índices; count0 não chama API. Confirma corpo inteiro/custos e recalcula após parcial. | T1/T4; 0149 engine part selection |
| R2 — qualidade insuficiente | 0157 define metricSets versionados e contadores disjuntos por população/métrica/classe de qualidade, motivos associados e numeradores separados. Gate exige qualidade da população usada, não labTicks agregado. MetricSet work-role é necessário para duty persistido; ausente dá unknown. | T3/T4; 0157 output quality histories e pior caso serializado |
| R3 — publicação/replay | Produtor tem nextSeq persistente, logicalId/seq estáveis no recibo existente, recuperação ordenada e replay com mesmo payload. Cursor staged e checkpoint atômico agregados+cursores fazem ack; fonte limpa depois. Fonte fecha origem antes de watermark; timeout5ticks fecha unknown e tardio posterior é diagnóstico. Origem perdida em gap não aumenta gate. | 0154 T3;0157 T4; durable publisher replay/late closed origin |
| R4 — drenagem sem fim | Cleanup do owner automático é obrigação da transientStock independente de idle drain; holds alheios/pin são preservados. Custódia pode ser transferida a manual; prazo300ticks leva a quarentena explícita, bloqueada fisicamente e sem abastecimento de boost; reavaliação25ticks recupera quando logística voltar. Não prometer lab livre sem disposição física. | 0149 T5; forced cleanup off idle drain/manual takeover and quarantine |
| R5 — mínimo nominal | poolAfterCancel simula compromissos físicos entregáveis, preservando outros owners. Prefixo só com premissas verificadas; busca pura limitada1000nós precisa provar mínimo/suficiência. Sobrecompromisso/lastro incerto/busca incompleta dão unknown sem cancelar. Revalidar após cada confirmação continua. | 0150 T2/T3; overlapping physical backing |
| R6 — intervalos conservadores | Segmentos afins com limites inferior/superior e verificação dos extremos/saltos. Antecipação integral só fallback; resolução insuficiente é unknown. Caso local12/oferta1.2/demanda1/H600 passa; atraso que esgote folga reprova. | 0157 T1; affine continuous supply |

A explicitação de quotaKey(owner,item,product,generation) também evita reinício de quota por output; confirmou-se que o contrato anterior de pending já apontava agregação, agora sem depender de interpretação.
O operador começa managed=false até adoção explícita; managed=true em economia off mantém modo safe.
O limite de coverage foi recalculado para estatísticas completas: até4 escopos/3 buckets/6 métricas,2048unidades UTF-16/bucket e32768coverage; recibos de recuperação até32/8192, combinado40960. São tetos e não meta de ocupação, com rejeição/unknown se não couber. Pendência física não é descartada para respeitar orçamento telemétrico.

Limites preservados: previsão de renda/retorno é modelo conservador revalidado; adequação de defaults e benefícios precisam de dados reais. Revisão favorável do planejamento não concede autorização de código ou investimento.

## Complemento R3 — ordem de origem e prefixo de commit

O revisor encontrou na reavaliação um contraexemplo entre o corte por originTick e ACK escalar por eventSeq. Corrigido o contrato: produtor publica frames fechados em ordem de origem; closedThroughTick é prefixo contíguo; checkpoint agrega/acknowledges apenas prefixo contíguo de seq até o corte global, sem pular frame ou dar ACK por scope que descarte outro. Origem104 não pode ser publicada antes de origem100 ainda aberta; timeout fecha100 como unknown e tardio posterior fica diagnóstico. Reset tombstoneia a cauda não checkpointada sem duração/numerador e conserva nextSeq/agregados, sem apagar pending físico.

Fixture específica: seq10/origem104 seguida de seq11/origem100 deve ser rejeitada na publicação; nenhum evento posterior a uma lacuna de commit entra no agregado ou ACK. Casos de publicação parcial de múltiplos escopos na mesma origem também não avançam o prefixo.

Precisões finais: origem com frames parcialmente publicados não avança closedThroughTick/ACK; inclusão de todos os escopos dessa origem é atômica. Escopo usa chainRecipeId estável entre lotes equivalentes, e reservas automáticas temporárias são estado sob política estável, não nova coorte por owner. Mudança de política/pool/pin persistente continua invalidando evidência; cache continua invalidando a cada mutação viva. Essas regras evitam tanto perda de replay quanto um gate48h impossível sob ciclos normais.

## Encerramento

O [veredito vigente do revisor](revisao-final-planejamento-2026-10-16.md#reavaliação-da-candidata-r2) é favorável à versão documental final. Nenhum bloqueador material remanescente identificado. Implementação/live/ativação continuam pendentes de tarefas/evidência/autorização próprias; ARK-141 encerra apenas documentação.
