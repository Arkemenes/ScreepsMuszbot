# 0149 — Boosts com retorno realizável — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0149-A/B locais: previsão, retorno, preparação/transporte e cleanup; aplicação automática ainda pendente.
- **Issue:** ARK-136; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

boostPolicy.worth é pura: corpo/ações afetadas, demanda finita, custo alternativo executável do composto, energia de aplicação, preparo/viagem/TTL, custo do lab e readiness. boostMarket fornece quotes filtradas, sem criação de listing. Piloto usa XLH2O próprio; compras e upgrader/CARRY ficam posteriores.

labReservations normaliza labBoostReservations, incluindo legado booleano. boostLogistics é dono do registro estruturado e de seus compromissos. transientStock é autoridade de retenção/drenagem; consumidores usam o mesmo adaptador para exclusão.

## Data flow e falhas

Spawn normal apenas registra candidato, sem espera. Após spawn, vincular creepId e prever seleção real por bodyPartsCount/ordem do motor, calcular deadline e admitir bundle de energia/composto/lab pelo owner. Se qualquer parcela falhar, liberar parcelas ainda não submetidas.
reserved/loading mantém worker em trabalho normal e hauler entrega somente missing, descontadas entregas em trânsito. Antes de applying, revalidar corpo/prazo/owner/pin/readiness e benefício. confirming compara corpo inteiro e custos atribuíveis no tick seguinte; o piloto rejeita prefixo que inclua parte destruída.
Boost parcial reduz partes restantes; a segunda aplicação recalcula count/prefixo realmente atingível, sem saltar índices arbitrários. Resultado incerto não reaplica.
Reset/morte/deadline/off cancela após conciliar pending; draining impõe cleanup em transientStock mesmo com drainIdleLabs=false, sem ignorar owner/pin alheio. TransferToManual preserva custódia externa e encerra boost; sem logística até300ticks, quarantined encerra abastecimento de boost e preserva bloqueio/claim físico, com reavaliação a cada25ticks. Somente disposição segura retorna ao pool. Pin manual posterior é preservado. released encerra claims idempotentemente; não desfaz boost consumado.

## Validation / Rollout

Fixtures da seleção real (WORK vivo seguido de WORK destruído, inversão, TOUGH, count zero), corpo misto/parcial, saturação de demanda, E=20/31.6/70 e vida produtiva, cada leitor da reserva, déficit com entrega pendente, disputa com cadeia/listing/segundo creep, reset entre intent e confirmação, morte, prazo, off, pin manual, drainIdleLabs=false, hold encerrado, destino indisponível e recuperação da quarentena.
Acrescentar testes de fallback (normal/boostado) e lab de volta ao pool somente após drenagem segura.
Futuro piloto em uma sala, sem compras: comparar previsão/benefício atendível/observado, gastos estimados e confirmados atribuíveis, espera e produção final perdida do lab. Coleta de baseline precede aplicação; nenhuma promessa de ganho só por duas chamadas OK.

## Risks & mitigations

Reserva paralela: chave/adaptador únicos. Duplo boost: índices/corpo e confirmação. Logística cara: deadline e benefício líquido. Reservas órfãs: cancelamento por sessão e owner/geração, preservando legado manual. Dado econômico insuficiente: creep segue sem boost, spawn preservado.

## Entrega parcial 0149-A — 16/10/2026

Seleção pura, `boostPreview` e adaptador/leitores implementados localmente. Ver [escopo, limites e sequência](../../../docs/entrega-0149-a-2026-10-16.md). T1 econômico, bundle de T2, spawn/confirmação de T4 e lifecycle de T5 continuam pendentes. Não há writer, abastecimento de composto nem aplicação automática. Fixtures semânticas não substituem pin do engine ou validação live.

## Próxima entrega local 0149-B — contrato executável

Antes da automação: `operationalReadiness.evaluate` puro valida oferta inferior e demanda superior acumuladas em todas as fronteiras/saltos (até16), margem20%, idade e cobertura explícitas. Sem quote virar reserva. Recursos já comprometidos e capacidade de canais precisam vir excluídos do contexto; o núcleo não inventa entrega a partir de storage/renda bruta.

`boostPolicy.worth` recebe corpo, TTL, atraso, seleção, constantes, ações build/repair com demanda atribuída finita, fração de ticks, energia disponível por ação e modo fixed/capacity, mais oportunidade executável do composto, valor do trabalho, custos de logística/lab e envelope de entrega. Não há duty implícito. Projeção usa a semântica do motor e arredondamento, limitada a duas ações afetadas; frações somam no máximo1. Fixed só credita energia evitada se ambos os cenários concluem a mesma demanda. Capacity só credita unidades adicionais úteis, descontando energia adicional; não soma a economia fixed. Taxa de energia fracionária é cenário conservador discretizado, não medida de tick específico.

Preparação de estoque/cargo fica separada do cálculo; qualquer writer deve reconsultar a disponibilidade física/owners ao admitir, manter generation/session e não antecipar confirmação. Custo desconhecido/velho ou demanda sem evidência bloqueia a concessão. Fonte do motor consultada em master em16/10; pin/versionamento do servidor continua gate antes do executor automático.

## Entrega parcial 0149-B — 16/10/2026

Política pura de retorno fixed/capacity, checker de entrega por prefixos e preparação controlada de XLH2O próprio implementados localmente. Bundle físico de origem/cargo/lab no registro canônico, confirmação deferida de transporte e recuperação de off/reset/morte/deadline/pin/quarentena. Claims continuam valendo com stockPolicy desligado; coleta normal de energia pode revogar preparação opcional. Defaults desligados, uma sala/builder, sem compras.

Núcleo puro de confirmação do boost testado por corpo inteiro/estoques, ainda não ligado a um intent nativo. Falta coletor/admissão comum de combustível futuro, candidato/approach/executor e confirmação no runtime, pin/servidor e validação live. Não tratar o contexto manual de teste como evidência em produção. [Pacote e limites](../../../docs/pacote-boost-2026-10-16.md).
