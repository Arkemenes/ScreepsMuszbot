# 0157 — Entrega, utilização e cobertura — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** done (core) — T1–T3, T5–T6 publicados em 2026-10-20/21; T4 adiada pela própria spec (ARK-206).
- **Issue:** ARK-140; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [ ] Pré-requisitos do pacote no DAG e revisão das fontes/fixtures verificados.

## Implementação futura — não executada

- [x] **T1 — Normalizar fontes/unidades/identidades de claims e curvas entregáveis conservadoras.** AC1,3. Parcial 2026-10-20 (0157-A, publicado): `utils/readinessContext` monta o contexto vivo — livre = `terminalClaims.physicalPool` − `reserveFloor` − compromissos de outros owners; oferta futura = taxa líquida observada (energyReport, nunca negativa); cobertura/horizonte/regime (sala+RCL). Smoke `0157 delivery envelope` (4) e `0157 prefix demand`. 2026-10-21: oferta = menor ritmo líquido das 6 subjanelas de 100 ticks (`energyReport.subwindowRates`), cada uma com cobertura ≥ 0,95, senão `unknown`; smoke `0157 affine continuous supply` (3). Curvas multi-recurso/canais ficam para o consumidor que precisar (ARK-206).
- [x] **T2 — Implementar admissão/bundle vivo e reconciliação por owner sem cache de saldo.** AC2. Parcial 2026-10-20: `commit/release` por owner em `Memory.readiness[sala][owner]` (idempotente, expira por `untilTick`); outros owners veem saldo/taxa descontados. Smoke `0157 concurrent admission` (2) e `0157 owner recovery` (2). 2026-10-21: `validateAndSpend` (revalida o contexto vivo → commit → submit; erro síncrono/exceção restaura o compromisso anterior; OK grava `submittedTick`); smoke `0157 concurrent admission` (+2) e `0157 owner recovery` (+2). Canais/transporte e bundle multi-recurso: ARK-206.
- [x] **T3 — Implementar utilização por ação, ocupação e qualidade com denominadores census.** AC4. 2026-10-20: utilização de WORK por role em `utils/energyReport` (0154-B). 2026-10-21: `actions` por sala — U_build = E/5, U_repair = E/1, U_upgrade = E/1 sobre os WORK-ticks dos roles trabalhadores, ocupação como união por trabalhador, null sem amostras, rótulo estimated; stats `rooms[sala].energyReport.actions` + painel Grafana. Smoke `0157 action utilization` (2).
- [ ] **T4 — DEFERRED: infraestrutura persistente de metricSets/protocolo publish/replay/ack.** Exige necessidade demonstrada e revisão da solução mínima; não bloqueia a versão core em heap. AC5. Verificação futura: `0157 persistent coverage; 0157 output quality histories; 0157 durable publisher replay; 0157 late closed origin; 0157 contiguous checkpoint prefix`.
- [x] **T5 — Integrar hook guardado e consumidores de contrato, preservando recuperação no off.** AC6. `boostEvaluate` usa `readinessContext.delivery`; `validateAndSpend` é o ponto de admissão para os executores (0149/0150). Orçamento de coleta: a única coleta por tick é o energyReport (guard, desligável por `energyReport.enabled`); readiness só calcula sob demanda.
- [x] **T6 — Após autorização medir overhead/calibrar evidência e obter dados reais onde exigidos.** AC5–6. Live 2026-10-21: energyReport 0,058–0,078 CPU/tick em regime; readiness não tem custo por tick. Ver comentário na ARK-140.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

Todos os checkboxes são de execução futura e continuam abertos. A revisão documental não conclui AC de runtime.

## Entrega parcial para0149-B — 16/10/2026

`utils/operationalReadiness.evaluate` implementa somente o checker puro de oferta inferior/demanda superior, margens, fronteiras/saltos, identidade, idade e cobertura explícitas. Não observa renda/canais, não concede orçamento, não implementa cobertura persistente e não conclui os AC completos de delivery/admission. Fonte/canal/demanda líquida são fatos exigidos do chamador. Fixtures em `test/boostPolicyCases.js`; integração e limites em [pacote0149-B](../../../docs/pacote-boost-2026-10-16.md).
