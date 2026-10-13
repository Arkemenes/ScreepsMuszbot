# 0124 — Estoque de uso e mercado oportunista

**Issue:** ARK-32 · **Estado:** implementado, mercado em simulação por padrão.

## Objetivo

### Correção de consultas de CPU — ARK-116 (2026-10-13)

Verificar o alvo de um único recurso não deve reconstruir o mapa completo
de alvos. Ler override por sala e padrão global diretamente, mantendo
precedência, validação e mudanças no mesmo tick. Na seleção de reagentes,
consultar cada recurso no máximo uma vez por seleção (inclusive falta de
estoque), sem reutilizar respostas em seleções futuras. Calcular o limite
de frete opcional uma vez por previsão de combustível, mantendo reservas
e alterações de operações/estoques visíveis no mesmo tick.


Separar estoque de consumo, materiais comprometidos e saldo vendável. A logística aplica a política compartilhada mesmo em simulação; somente o novo mercado depende de `swing.test`. Flip, craft e operações manuais existentes continuam operando com suas regras, acrescidos das proteções compartilhadas.

## Estoque e logística

- `stockPolicy.targets` define recursos de uso; `stockPolicy.rooms.<room>.targets` sobrescreve alvos por sala. Inicialmente energia: 100000 no storage, sem venda automática de excedentes.
- A energia operacional do terminal fica separada: `logistics.terminalReserveRatio`, padrão 10% da capacidade (30000 no terminal normal).
- Demais recursos ficam no terminal. `stockPolicy.terminalFreeRatio=0.15` reserva espaço livre, descontando recebimentos pendentes e staging. Storage aceita overflow temporário.
- Coleta, loot, receipts de compras e produtos de processamento usam os mesmos destinos. Material sem operação deixa de circular de volta ao storage.
- Balanceamento entre salas precede reposição no mercado. Estoque inclui carga de haulers e recebimentos pendentes para impedir compras duplicadas.
- As reservas quantitativas cobrem flip, cadeias completas, processamento manual, transferências, vendas/ordens abertas e retenção após cancelamento. Carga já atribuída a haulers permanece protegida.

## Negócios e orçamento

Referência válida exige pelo menos 30 amostras durante a validação (retornar a 48 após validar) e última observação com idade máxima de 7200 ticks. A referência de energia usada para frete também deve ser válida. Sem referência, bloquear e registrar o motivo.

Compra imediata apenas quando há déficit e custo efetivo estritamente menor que `sellPrice * 0.99`. Energia: créditos pagos / unidades líquidas recebidas após frete. Outros recursos: preço nominal + valor da energia de transporte / quantidade. Nunca comprar caro para garantir o alvo e nunca criar ordens próprias de compra nesta versão.

Preservar `stockPolicy.creditReserve=100000` créditos livres após compromissos e gasto proposto. O orçamento é compartilhado com compras automáticas de flip/craft, operações pendentes e ordens de compra legadas. Custos de intents aceitos no mesmo tick são contabilizados sem desconto duplicado quando já refletidos nos créditos.

Vender somente recursos não configurados para uso e quantidades sem compromissos. Priorizar venda imediata quando preço nominal menos frete por unidade for estritamente maior que `buyPrice * 1.01`. Sem candidato imediato, permitir ordem própria cujo preço líquido após taxa antecipada de 5% supere o mesmo piso.

Ordens swing preservam o preço aprovado na criação, sem repricing. Expiram em 1209600 ticks: cancelar e reter uma quantidade equivalente ao saldo em `Memory.swing.noRelist`, sem relistagem automática. Venda imediata futura continua permitida e reduz essa retenção. A identificação é por sala/recurso/quantidade, pois unidades do mesmo recurso são fungíveis.

## Execução e observabilidade

`terminalOps.buy/sell` aceitam options no sétimo argumento, incluindo `effectiveLimit`, sem mudar a semântica dos chamadores antigos. Operações swing revalidam referência, preço efetivo, frete, créditos, reservas e capacidade antes do negócio; compras que perderam elegibilidade são encerradas. Confirmar transações observáveis e tratar receipts parciais sem duplicar créditos do pai.

`swing.enabled=true` e `swing.test=true` por padrão. Simulação grava candidatos em `Memory.swing.observations`; `swingStatus(roomName?)` expõe preços efetivos, referências, quantidades e bloqueios. Não enfileirar negócios ou balanceamento swing em simulação. Logística de estoque continua ativa.

## Critérios de aceitação

1. Storage mantém consumo, terminal mantém os demais materiais; overflow retorna ao terminal quando há espaço permitido, sem circulação repetitiva.
2. Frete líquido de energia, margens estritas de 1%, piso financeiro, histórico e reposições pendentes são verificados no smoke.
3. Reservas impedem venda de cadeias completas, produção manual, materiais retidos, haulers e ordens existentes; fills parciais liberam apenas saldo efetivamente consumido.
4. Compras não usadas concluem no terminal; energia repõe storage preservando combustível; receipts parciais não encerram o pai prematuramente.
5. Ordens próprias têm taxa antecipada, preço fixo, expiração e bloqueio quantitativo de relistagem, preservando venda imediata.
6. `node --check`, smoke, `npx grunt` e `graphify update .` executados. Sem deploy ou validação em servidor nesta etapa.

## Correção de persistência do histórico (2026-10-11)

No servidor, O e energia apresentaram sampleCount=31 apesar de semanas de coleta. A reprodução com 90 recursos × 168 amostras mostrou que o formato anterior cortava o payload para 95 KB e recuperava somente 31 linhas por recurso após reset. O gerador de pixel zera o bucket e o shedding pode atrasar scans, mas não justifica descartar amostras já coletadas.

A persistência version 2 usa a raiz no segmento 9 e páginas nos segmentos 0..8, preservando preços, volumes e ticks sem perda de precisão. O formato version 1 migra sem descartar as linhas existentes. A carga ocorre em vários ticks, validando gerações; nenhuma gravação substitui o histórico antes da hidratação completa. Capacidade total excedida reporta erro, preservando a geração anterior.

O mínimo é temporariamente 30 amostras válidas durante a validação; o alvo após validar é 48. O shedding permanece. Não preencher lacunas com preços repetidos nem recuperar dados já descartados. A janela de sete dias é 604800 ticks; a densidade depende dos scans efetivamente executados. `marketHistoryStatus()` permite acompanhar carregamento e persistência.

`marketHistoryFlush()` força a persistência/migração dos dados já hidratados, sem novo scan, sem amostra extra e sem mudar a cadência. Retorna `ok:false` com `history-not-hydrated` antes da carga completa, preservando os segmentos existentes.

## Bucket e cadência da coleta

`market.minBucket=500`: scans/coletas automáticos não consultam o book, acrescentam amostras ou gravam histórico abaixo desse piso. Main chama o coletor via guard, independentemente do shedding geral de 2000. Ao recuperar para 500, uma coleta pendente roda sem esperar a grade de currentInterval. A grade histórica permanece ancorada no horário originalmente previsto: atraso em 3600 até 3700 mantém a próxima em 7200. Cada amostra guarda `tick` real e `scheduledTick`; a persistência aceita tuplas antigas de cinco campos e novas com sexto campo opcional. Após reset a grade é recuperada do scheduledTick (fallback tick para dados antigos). Atrasos que atravessam vários slots produzem uma única observação real no slot vencido mais recente, sem backfill fictício.

### Diagnóstico das referências

`Swing` conta apenas amostras com preço positivo no lado relevante, enquanto `marketPrice().sampleCount` conta todas as observações. `swingReference(resourceType, kind = "buy")` consulta a referência atual sem esperar o próximo scan; informa lado, amostras totais/válidas, mínimo configurado, idade e motivo de bloqueio, incluindo a contagem independente de energia quando aplicável. Bloqueios de referência em `swingStatus()` incluem os mesmos dados do scan registrado.

### Prontidão após reset do heap

O scan de mercado precede `terminalOps`, flip, craft e swing no tick. Até terminar a hidratação das páginas, referências ficam bloqueadas com `history-loading`; esse estado não consome a cadência do swing. A primeira avaliação com histórico completo ocorre no tick em que ele fica disponível. O resumo temporal é recalculado nesse tick, mesmo antes da cadência normal do book, sem criar amostras fora do horário previsto.

### Reposição concorrente a operações de consumo

Compras de reposição `policy: swing` podem coexistir com operações do mesmo recurso (craft, compra manual, venda ou transferência). Quantidades de entradas pendentes continuam descontadas do déficit e da capacidade; créditos e estoque comprometido continuam protegidos. As demais travas mantêm a semântica existente, incluindo exclusividade entre saídas do mesmo recurso. A concorrência é entre operações lógicas: o executor aceita no máximo um intent físico de deal/send por terminal e tick, além do cooldown do jogo. Energia já carregada para outra operação não pode pagar o frete da reposição. Recebimentos precisam ser associados pelo pedido/transferência, e a confirmação de deal usa a transação correspondente quando disponível.

### Reserva dinâmica de combustível

Substituir o piso padrão de 30k por frete das próximas duas transações elegíveis +20% de margem, configuráveis. Quotes recentes e transferências ainda não enviadas alimentam a previsão; ordens próprias aguardando comprador não geram frete. Energia já carregada para operações fica protegida separadamente, sem dupla contagem. Sem previsão, a reserva preventiva vai a zero. Storage abaixo de 10% do alvo de uso remove margem preventiva e adia vendas swing cujo frete exceda 10% da energia local disponível. Compra de energia ganha prioridade. Histerese de devolução (25% da reserva prevista) evita oscilações; excesso ocioso retorna ao storage mesmo com outras operações pendentes, preservando cargas/haulers.
