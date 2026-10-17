# 0157 — Entrega, utilização e cobertura — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — núcleo puro de envelope/prefixos local; coleta/admissão compartilhada e demais métricas pendentes.
- **Issue:** ARK-140; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

readiness.js é puro: deliveryEnvelope(ctx), sustains(ctx), utilization(samples). Recebe dados, não importa Game/mercado/relatórios.
readinessContext combina roomCache/census/eventos0154 com autoridades de claims/entregas. Cacheia só base estável e estatística histórica; consulta saldos vivos em toda admissão.
readinessAdmission normaliza commitmentId/owner/localização e bundle de recursos/canais; é o único dono da concessão opcional. Fontes sem identidade conciliável retornam unknown, sem supor reservas independentes.
Na versão inicial, coverage é resumo limitado no heap, reiniciado/incompleto no reset; não criar Memory.coverage nem protocolo durável. Os detalhes persistentes abaixo são desenho condicional adiado, não dependência da 0157-core.

## Data flow e falhas

Eventos0154-A → contexto/curvas puras → quote → admissão viva/bundle → validateAndSpend → intent → confirmação pelo executor → conciliação/liberação.
Bundle falho desfaz só reservas não submetidas. Repetição do owner usa delta. Essencial pode revogar opcional não submetido; pendência submetida é conciliada e não reutilizada.
Cada curva usa até16 segmentos afins com extremos/saltos verificados; oferta inferior e demanda superior preservam o caso contínuo local12/oferta1.2/demanda1/H600. Antecipação integral é fallback explícito para resolução insuficiente, com unknown. Dados insuficientes dão unknown; insuficiência demonstrada dá blocked. Quote expira por tick e revalidação, não por revisão econômica longa.
Reset reconcilia submitted e expira reserved não submetidos. Off da coleta abre gap, bloqueia nova admissão por dado inválido, mas recovery segue.

**Desenho persistente condicional, adiado:** coverage usa metricSetId/version e estatísticas suficientes por população, classe de qualidade e métrica. Fonte fecha origem após conciliação ou timeout5ticks como unknown; ring no heap e closedThroughTick impedem checkpoint antecipado. Evento fechado é imutável; tardio após fechamento fica diagnóstico.
Produtor mantém nextSeq persistente e IDs estáveis de recibo; frames fechados são publicados em ordem de origem, e closedThroughTick é prefixo contíguo. Fonte sem operação fecha zero somente se coletou; ausente é unknown. Checkpoint usa prefixo contíguo de seq antes do corte global, sem ACK por scope que pule frame. Cursor de staging evita duplicar no heap; checkpoint substitui agregados+cursores+marcos juntos; ack persistido permite cleanup. Reset antes/depois de publish/ack descarta cauda alocada não checkpointada em tombstone/gap sem numerador/duração, preserva agregados e mantém nextSeq; não descarta pending físico. Origem sem frame coberto não aumenta numerador do gate.
Tetos:4escopos/3buckets/6métricas,2048unidades por bucket,32768coverage; até32recibos/8192unidades no executor, combinado40960. Falta de capacidade telemétrica dá unknown, nunca trava recuperação física ou inventa dado. Descritor atual é comparado antes do gate; hash só indexa.

## Validation / Rollout

Core: fixtures AC1–4/6; AC5 de persistência adiado. Fixtures com relógio/ticks injetados, zero storage alimentado, estoque remoto, recorrência, atraso e concorrência de canal/estoque, own reservation, falha de bundle/pending, população e ações simultâneas.
Cobertura: meia-noite, dois dias parciais, 48h observadas, velocidade variável, clock regressivo, gap longo, replay, reset entre flushes, off/on, regime alterado, histórias iguais no agregado antigo com unknown em saídas versus entradas, publicação/exceção/ack/seq no reset, tardio antes/depois de fechar, tamanho completo no pior caso e overflow.
Guard antes de endTick, usar census/roomCache sem scan duplicado. Offline verifica contagens; live mede overhead e calibra thresholds. Gate real de48h não pode ser satisfeito por relógio simulado no aceite operacional.

## Risks & mitigations

Histórico não garante futuro: limite inferior conservador, revalidação e unknown quando horizonte não suportado. Duplo desconto: commitmentId e views do owner. Dupla concessão: admissão única. Memória: tetos exatos/unidade explícita e poda. Cobertura antiga: coorte por descritor, cauda perdida não é retomada.

## Entrega parcial para0149-B — 16/10/2026

`utils/operationalReadiness.evaluate` implementa somente o checker puro de oferta inferior/demanda superior, margens, fronteiras/saltos, identidade, idade e cobertura explícitas. Não observa renda/canais, não concede orçamento, não implementa cobertura persistente e não conclui os AC completos de delivery/admission. Fonte/canal/demanda líquida são fatos exigidos do chamador. Fixtures em `test/boostPolicyCases.js`; integração e limites em [pacote0149-B](../../../docs/pacote-boost-2026-10-16.md).
