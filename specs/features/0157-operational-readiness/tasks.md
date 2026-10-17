# 0157 — Entrega, utilização e cobertura — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — núcleo puro de envelope/prefixos local; coleta/admissão compartilhada e demais métricas pendentes.
- **Issue:** ARK-140; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [ ] Pré-requisitos do pacote no DAG e revisão das fontes/fixtures verificados.

## Implementação futura — não executada

- [ ] **T1 — Normalizar fontes/unidades/identidades de claims e curvas entregáveis conservadoras.** AC1,3. Verificação futura: `0157 delivery envelope; 0157 prefix demand; 0157 affine continuous supply`.
- [ ] **T2 — Implementar admissão/bundle vivo e reconciliação por owner sem cache de saldo.** AC2. Verificação futura: `0157 concurrent admission; 0157 owner recovery`.
- [ ] **T3 — Implementar utilização por ação, ocupação e qualidade com denominadores census.** AC4. Verificação futura: `0157 action utilization`.
- [ ] **T4 — DEFERRED: infraestrutura persistente de metricSets/protocolo publish/replay/ack.** Exige necessidade demonstrada e revisão da solução mínima; não bloqueia a versão core em heap. AC5. Verificação futura: `0157 persistent coverage; 0157 output quality histories; 0157 durable publisher replay; 0157 late closed origin; 0157 contiguous checkpoint prefix`.
- [ ] **T5 — Integrar hook guardado e consumidores de contrato, preservando recuperação no off.** AC6. Verificação futura: `0157 collection budget`.
- [ ] **T6 — Após autorização medir overhead/calibrar evidência e obter dados reais onde exigidos.** AC5–6. Verificação futura: `LIVE-0157: qualidade, custo e duração reais`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

Todos os checkboxes são de execução futura e continuam abertos. A revisão documental não conclui AC de runtime.

## Entrega parcial para0149-B — 16/10/2026

`utils/operationalReadiness.evaluate` implementa somente o checker puro de oferta inferior/demanda superior, margens, fronteiras/saltos, identidade, idade e cobertura explícitas. Não observa renda/canais, não concede orçamento, não implementa cobertura persistente e não conclui os AC completos de delivery/admission. Fonte/canal/demanda líquida são fatos exigidos do chamador. Fixtures em `test/boostPolicyCases.js`; integração e limites em [pacote0149-B](../../../docs/pacote-boost-2026-10-16.md).
