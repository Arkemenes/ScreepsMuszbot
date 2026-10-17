# 0157 — Operational readiness: entrega, utilização e cobertura

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — núcleo puro de envelope/prefixos local; coleta/admissão compartilhada e demais métricas pendentes.
- **Issue:** ARK-140. Consolidação: ARK-141.
- **Created:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Sequência e aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Problem

Saldo agregado, renda bruta, chamadas OK e duas datas de calendário não demonstram combustível entregável, trabalho realizado ou 48h representativas. O contrato comum deve impedir dupla alocação sob mutações intratick.

## Desired outcome / In scope

Autoridade de readiness, utilização e cobertura para 0148/0149/0150/0154/0155. Cálculos puros não executam intents; um adaptador separado é dono dos compromissos.

### 1. Contexto e unidades

Entrada: `{room,consumerId,ownerId,resource,observedTick,regimeId,horizonTicks,startDelayTicks,localFree,supply[],demand[],transport[],evidence,reasons[]}`.
Recurso em unidades; taxas em recurso/tick; horizonte em ticks; cobertura em ms UTC. IDs/strings, nunca objetos persistidos.
Saída: `{status:ready|blocked|unknown,observedTick,validUntilTick,regimeId,allocation,reasons[]}`. Insuficiência demonstrada é blocked; evidência ausente/vencida/contraditória é unknown. Ambos impedem compromisso opcional novo, sem interromper defesa/recuperação.

- Fontes físicas: roomCache, terminalClaims.physicalFree, reservations, reservas de entrega e owners. claimDiagnostics trata conquista, não estoque físico.
- Deduplicar por commitmentId/ownerId/localização/recurso. Estoque, trânsito e operação podem ser views do mesmo compromisso.
- Estoque livre = físico menos pisos, retiradas aceitas e compromissos lastreados ali. Estoque local do consumidor não reaparece como oferta remota.
- Renda futura líquida = entrada observada menos consumo recorrente protegido e alocações anteriores. Transferência interna não é renda nova. Capacidade teórica de source ou Δstock+gasto sem discriminação não aprova.
- Terminal excluído do orçamento opcional inicial por escolha conservadora; isso não afirma que toda sua energia esteja comprometida com frete.
- Limitar estoque remoto e renda por fonte/destino/canal, fila, transporte disponível e chegada. Hauler/link compartilhado tem orçamento único.
- Previsão inicial usa o menor ritmo líquido das seis subjanelas completas da janela observada, no mesmo regime. É limite conservador de planejamento, não garantia física; revalidar cada ação. Sem atribuição suficiente de origem/entrega, usar só estoque já entregue ou retornar unknown.
- Defaults configuráveis: readiness.margin=0.20, incomeWindowTicks=600, subwindowTicks=100, minCoverageFraction=0.95, maxAgeTicks=1. As seis subjanelas precisam da cobertura mínima; saldo vivo não é cacheado.
- H corresponde ao compromisso: TTL produtivo do worker ou lote de processamento. Preparo, viagem e espera reduzem o benefício. Se evidência não sustenta H, reduzir lote reversível ou retornar unknown; boost precisa cobrir o horizonte usado no retorno.

### 2. Sustentação e admissão

Para todo prazo t até H:
`localFree + entregaLíquidaAlocadaAté(t) >= demandaAcumuladaAté(t) × (1 + margin)`.

Custos iniciais têm prazo próprio. Estoque remoto também precisa chegar. Saldo apenas no fim não satisfaz falta anterior.
Curvas acumuladas admitem até16 segmentos afins conservadores: oferta é limite inferior de entrega, demanda é limite superior. Verificar início/fim de cada segmento, limites esquerdo/direito de saltos e primeira chegada. A diferença é afim entre fronteiras, então os extremos provam os prefixos do modelo; não é preciso enumerar cada tick. Lotes discretos usam envelope inferior com latência/rajada conservadora, nunca renda média tratada como fluxo instantâneo.
Sem limite intrassegmento confiável, antecipar demanda no início e oferta incerta no fim como fallback declarado; essa reprovação conservadora é unknown por resolução insuficiente, não prova de inviabilidade física. Mais de16 fronteiras sem compressão por limites válidos dá unknown, sem truncar.
Fixture contínua: local12, oferta inferior1.2/tick, demanda superior1/tick, H600, margem0.20 passa com folga12 em todos os extremos. A versão com atraso que consuma essa folga reprova. Storage zero pode passar quando o consumidor tem buffer local/primeira entrega suficiente; não confundir storage com todo combustível local.

Quote não é reserva. readinessAdmission.reserve(ownerId, quote) reconsulta fontes vivas e aloca saldo/canais atomicamente no modelo do bot. Repetição do mesmo owner substitui compromisso por delta, sem duplo desconto. Crítico → saudável → ótimo; necessidade protegida pode revogar reserva opcional antes do intent.

A reserva de múltiplos recursos/canais é um bundle por owner: conferir todas as parcelas antes da concessão; falha desfaz somente parcelas ainda não submetidas. Sem identidade conciliável de claim, retornar unknown.

Estados: proposed → reserved → submitted → reconciled → released. Antes do intent, falha libera; depois, conserva pendência até conciliação. Persistir só owner, quantidade, localização/canal, prazo, geração e recibo indispensáveis; reconstruir curvas no heap.
O consumidor chama validateAndSpend imediatamente antes de boost/compra/transferência/processamento: revalidar, reservar consumo, submeter; erro síncrono libera delta, OK mantém pendência. Reset reconcilia submetidos e expira reservas opcionais não submetidas. Aprovação histórica não autoriza gasto novo.

### 3. Utilização, ocupação e produção

População por sala de trabalho/role observado: não spawning, WORK com hits>0 via census, integrado por tick. Conversão muda o grupo naquele tick. Dano posterior ao script permanece limite da estimativa.

`U_a = Σ(E_a/e_a) / Σ(WORK_elegível)`.
e_build=BUILD_POWER=5; e_repair=REPAIR_POWER×REPAIR_COST=1; e_upgrade=UPGRADE_CONTROLLER_POWER=1 nas constantes-base. Unidade: energia/WORK/tick, não hits. Boost altera efeito; arredondamento e alvo parcial ficam explícitos.

Ocupação ponderada: Σ(WORK_do_creep × indicador_de_alguma_ação_produtiva)/Σ(WORK_elegível).
É união por trabalhador/tick, sem reconstruir quais partes individuais atuaram. Build+upgrade podem ter U=1 cada e ocupação=1, conservando ambos os gastos/efeitos. Não somar U de ações distintas.

Gasto, produção e qualidade são agregados separados. Ledger 0154 é estimado; desconhecido não vira zero/confirmado. Denominador zero dá null. Publicar denominador total, conhecido e fração unknown; não apagar desconhecidos para aumentar utilização. Benefício usa ações afetadas, demanda finita e limite inferior demonstrado; ocupação não mede retorno.

### 4. Cobertura persistente e estatísticas suficientes — DEFERRED

Componente condicional: não implementar nesta execução inicial. As regras abaixo preservam os requisitos estudados, sem obrigar este protocolo como solução futura. Os AC de persistência e os limites associados ficam adiados; a 0157-core pode ser entregue com observação limitada no heap. O gate de operator exige evidência auditável conforme o plano incremental.

Memory.coverage={version:2,producers,scopes}. Cada escopo identifica sala+chainRecipeId/produto+metricSetId+população/role+descritor canônico do regime, não apenas hash. chainRecipeId é a assinatura canônica do grafo de receitas e versão da política de planejamento, não ID efêmero de lote/owner; lotes equivalentes contribuem para o mesmo escopo.
Regime contém versão/configuração da política, topologia/pool estrutural de slots, pins/reservas persistentes que alterem esse pool, targets de população, templates de corpo e política de boost/power. Mudança cria coorte nova; anterior é diagnóstico. Fases/lotes e ocupação temporária por reserva automática sob a mesma política entram nos estados/denominadores, sem criar coorte por creep/owner. Alterar política/pool/pin persistente cria nova coorte. Assinaturas de cache continuam vivas e invalidam a cada reserva/efeito, mesmo sem troca de coorte. Envelhecimento/reposição normal entra nos denominadores; perda de entrega invalida readiness.

Scope guarda descritor, first/lastObservedTick/At, checkpoint, resets/gaps e até3 buckets UTC.
Bucket: {day,startAt,endAt,observedMs,observedTicks,unknownMs,metrics[],reasonsByPopulation[],lastEventBySource}.
O registry estático no heap, identificado por metricSetId/version, define até6 métricas por escopo: unidade, população/denominador, significado do numerador e qualidade mínima para o gate. Não persistir dicionário derivado de labels nem misturar populações para economizar espaço.
Cada metric preserva [dTotal,dObservedOnly,dEstimatedOnly,dConfirmed,dUnknown,nObserved,nEstimated,nConfirmed]. As quatro parcelas de denominador somam dTotal e são disjuntas. Zero denominador dá null. nEstimated nunca vira confirmado; gate seleciona somente numerador e classe de qualidade permitidos para aquela métrica.

MetricSet lab-chain:
- disponibilidade física: população todos os lab-ticks; numerador lab-ticks fisicamente disponíveis; qualidade observada.
- estado/utilização de saída: população eligibleOutputTicks; numeradores ready/cooldown/intent são proxies observados, separados da produção. reasonsByPopulation guarda enum15 para físico, saída elegível e entrega, até3 populações.
- produção final: população output-intent-ticks da cadeia; numerador quantidade final confirmada, sem intermediários; qualidade confirmada.
- entrega final: população final-delivery-attempts; numerador quantidade final entregue confirmada; qualidade confirmada.
- energia líquida atribuída: população supply-observation-ticks; numerador energia líquida observada com origem/consumo discriminados; qualidade observada, sem proxy agregado.
- transporte entregue: população delivery-observation-ticks; numerador entrega atribuível ao consumidor/canal; qualidade observada/confirmada conforme evento.

MetricSet work-role: até4 métricas (build,repair,upgrade,ocupação), cada uma com seu WORK-ticks elegível e qualidade própria; numerador por ação é energia e normalização e_a da seção3, ocupação tem WORK ocupado. Estimativa conhecida é permitida somente como estimativa/modelo, não como ganho realizado. Não reconstruir duty48h de energySpentEstimated agregado. Se não houver esse metricSet/qualidade, duty persistido é unknown.
O gate exige >=0.95 na qualidade e população da CADA métrica realmente usada, nunca knownLabTicks/labTicks substituindo qualidade das saídas. Para qualidade confirmada, usar dConfirmed/dTotal; para observação suficiente, usar classes observada/confirmada; para modelo estimado explícito, admitir classe estimada, preservando o rótulo.

Contraprova obrigatória:100 labTicks,10 saídas e95 labTicks conhecidos podem conter cinco unknown nas saídas ou nas entradas. Os dois buckets novos precisam ser diferentes: qualidade de saída50% versus100%. Motivos/denominadores mantêm essa associação. Produção igual não torna equivalentes as histórias.

### 5. Publicação, checkpoint e reset

Quatro produtores fixos: energy,lab,transport,market. Memory.coverage.producers[sourceId].nextSeq é monotônico persistente e pertence ao produtor; reset de heap não o reinicia. Schema/identidade mudada inicia versão/coorte nova explicitamente e gap, nunca reutiliza sequência antiga como dado novo.
Evento lógico fechado tem {sourceId,eventSeq,logicalId,originTick,scopeId,payload}. logicalId identifica a observação/recibo imutável; republicar o mesmo recibo reusa eventSeq/logicalId/payload. Antes de publicar confirmação irreversível, o executor registra esses IDs no pending/recibo persistente que já lhe pertence. Não criar novo ID para o mesmo resultado após exceção/reset; se a identidade/payload não for recuperável, marcar unknown e não publicar como produção nova.

Produtor publica somente frames fechados em ordem não decrescente de originTick; scopeId desempata frames da mesma origem. Atribuir eventSeq na entrada dessa ordem. closedThroughTick é prefixo CONTÍGUO de origens fechadas de todas as populações/escopos exigidos, não o maior tick já fechado. Uma origem só integra closedThroughTick após TODOS os frames dos escopos exigidos estarem fechados e publicados. Publicação parcial da mesma origem não avança closedThroughTick nem ACK. No checkpoint, incluir esses frames atomicamente; a fixture de publicação parcial precisa provar que não há avanço parcial. Frames posteriores aguardam no ring a confirmação/timeout da origem anterior. Não publicar origem104 antes de fechar/publicar origem100.
Consumidor tem stagedSeq no heap e ackedSeq persistente por produtor em Memory.coverage.producers. Replay do mesmo frame não soma. No checkpoint, agregar exclusivamente o prefixo CONTÍGUO de eventSeq cujas origens estejam até o corte global mínimo de closedThroughTick; nunca agregar seq11 e avançar cursor11 pulando seq10 de origem posterior. Frame que não pode entrar retém também todos os seguintes. Origem antiga só recebe seq novo antes de publicar qualquer origem posterior, respeitando a ordem. Fonte exigida sem operação fecha observação zero quando coleta foi válida; falta de coleta fecha unknown, não zero.
Checkpoint prepara objeto novo no heap e substitui Memory.coverage com agregados+cursores+marcos de cobertura juntos, sem atualização parcial campo a campo. O ack é esse prefixo persistido; todos os payloads de escopos rastreados do prefixo entram no mesmo checkpoint. Cursor no bucket é apenas proveniência; não permite ack independente que pule frame de outro escopo. Só depois produtor apaga recibo telemétrico cuja limpeza dependia do consumo. Exceção depois de publish e antes de ack/cleanup reusa identidade anterior. Observações puramente efêmeras sem recibo podem ser perdidas com a cauda; não são fabricadas no reset.
Recibos ficam no subsistema executor, não journal por tick em coverage; limitar a32 recibos de recuperação e8192 unidades UTF-16 no total. Overflow fecha qualidade unknown e conserva pendência física necessária no executor; não inventa publicação/ack nem bloqueia execução por observador desligado. Recuperação física prevalece sobre telemetria.

Separar observação aberta de evento fechado: fonte fecha cada origem quando resultado é atribuível ou settleTimeoutTicks=5 expira como unknown. Agregar métricas de origem uma vez; estado estimado não é somado de novo como confirmação. Até fechar, observação fica em ring no heap; checkpoint só avança até o menor closedThroughTick das fontes exigidas pelo metricSet. Confirmação tardia antes do fechamento vai ao bucket original. Depois de fechar unknown, evento tardio é diagnóstico, não promoção retroativa ou produção em novo dia. Isso evita exigir um journal ilimitado para substituir contribuição já agregada.
Reset registra explicitamente como gap/tombstone a cauda alocada mas não checkpointada até nextSeq-1, sem numerador nem duração: por ordem de publicação, suas origens são posteriores ao corte salvo. Ack de descarte é distinto de consumo observado. Isso permite continuar nextSeq sem reiniciar contador ou apagar agregados anteriores; não cria nova coorte só por perda da cauda. Descarte telemétrico não apaga pending físico nem confirma efeito: executores ainda reconciliam estado real, e resultados antigos do gap são diagnósticos. A primeira observação nova não completa o intervalo anterior. Replay cuja origem pertence ao gap sem frame coberto é conciliado para recuperação, mas não aumenta numerador do gate. Flag off/erro abre segmento desconhecido; manutenção de pending continua.

### 6. Tempo, limites e gate

- Somar duração só entre observações finais bem-sucedidas de ticks consecutivos, mesma sessão/regime, com0<Δwall<=maxObservedGapMs (default30000ms). Relógio regressivo, tick ausente, falha ou intervalo excessivo abre gap; sem tick-rate fixo.
- Repartir duração na meia-noite; denominadores conservam origem. Sem produção interpolada em gap. Flush no máximo a cada100 ticks observados e no desligamento normal, respeitando closedThroughTick.
- Até4 escopos explicitamente acompanhados,3 buckets/escopo,6 métricas/escopo. Descritor serializado<=1024 e bucket<=2048; JSON.stringify(Memory.coverage).length<=32768 unidades de código UTF-16 (não bytes). Recibos de recuperação têm teto8192 separado; teto combinado coverage+recibos<=40960. Alocação sob demanda, piloto uma sala. Pior caso testa todas as estatísticas e overhead; podar vencidos/refusar escopo ou invalidar bucket com motivo se exceder, sem cortar números ou elevar limites.
- Gate:observedMs>=172800000, mesmo regime, observedMs/(endAt-startAt)>=0.95 e qualidade>=0.95 por métrica/população/classe exigida. Métrica ausente/denominador zero ou não reconstruível é unknown. Valores unknown não geram benefício.
- Incluir buckets íntegros; sem dados intrabucket, descartar bordas inteiras, sem inventar janela móvel exata. Usar só checkpoint persistido/conciliado, não cauda. Reset preserva agregados válidos sem inventar continuidade.
- 48h são requisito de investimento no operador, não bloqueio universal dos diagnósticos/pilotos0148/0149, que usam suas janelas específicas e readiness.

## Acceptance criteria

1. `0157 delivery envelope`: storage zero com entrega líquida passa; estoque remoto sem transporte, recorrência essencial e chegada tardia bloqueiam; fonte ausente/velha dá unknown.
2. `0157 concurrent admission`: dois owners dividem saldo/canais; quote não concede orçamento; substituir/liberar/reconciliar o próprio compromisso é idempotente.
3. `0157 prefix demand`: margens 0/0.20/0.50, caso afim local12/oferta1.2/demanda1/H600 e versão atrasada, demanda inicial/contínua, vida curta/longa, E=20/31.6/70 e limite de intervalos nunca aprovam apenas pelo saldo final.
4. `0157 action utilization`: repair dimensionalmente correto; um ativo entre cinco; build+upgrade com dois U/uma ocupação; spawn/dano/morte/role/zero/unknown explícitos.
5. **DEFERRED — componente persistente:** `0157 persistent coverage`: dias parciais<48h reprovam; histórias com unknown em saídas versus entradas diferem; reset antes/depois de checkpoint, publish/ack/exceção/replay, contraexemplo seq10/origem104 versus seq11/origem100 e origem parcialmente publicada impedidos por prefixo atômico; lotes equivalentes/boost periódico mantêm escopo, mudança da política/pool/pin cria coorte, confirmação antes/depois do fechamento, relógio/regime/meia-noite/poda e pior caso serializado funcionam sem duplicação/crédito do gap.
6. `0157 collection budget`: sem scan redundante de Game.creeps/room.find; guard antes de endTick. Offline verifica contagens/ordem; overhead exige live separado.

## Constitution check

Census/roomCache; heap limitado para curvas/amostras; Memory só compromissos/resumos indispensáveis. Guard/stall guard; config em Memory.settings. Não alterar prioridades de trabalho nem promover estimativa a confirmação.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.

## Entrega parcial para0149-B — 16/10/2026

`utils/operationalReadiness.evaluate` implementa somente o checker puro de oferta inferior/demanda superior, margens, fronteiras/saltos, identidade, idade e cobertura explícitas. Não observa renda/canais, não concede orçamento, não implementa cobertura persistente e não conclui os AC completos de delivery/admission. Fonte/canal/demanda líquida são fatos exigidos do chamador. Fixtures em `test/boostPolicyCases.js`; integração e limites em [pacote0149-B](../../../docs/pacote-boost-2026-10-16.md).
