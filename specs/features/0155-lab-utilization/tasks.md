# 0155 — Observação final dos labs — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** planned — execução local autorizada em etapas; não implementada.
- **Issue:** ARK-134; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [ ] Pré-requisitos do pacote no DAG e revisão das fontes/fixtures verificados.

## Implementação futura — não executada

- [ ] **T1 — Definir registro/precedência/denominadores e hook final com labs não alocados.** AC1,5. Verificação futura: `0155 final observation`.
- [ ] **T2 — Vincular execute/confirm à origem, quantidades reais e produto final entregue.** AC2,4. Verificação futura: `0155 origin and final quantity`.
- [ ] **T3 — Integrar coverage/regime da 0157 e recusar evidência insuficiente.** AC3,6–7. Verificação futura: `0155 representative coverage; 0157 output quality histories`.
- [ ] **T4 — Implementar relatório/top3/auto-report sem alterar decisão e medir scans.** AC5. Verificação futura: `0155 report observation only`.
- [ ] **T5 — Após autorização coletar 48h reais da cadeia/abastecimento/venda e overhead.** AC5–7. Verificação futura: `LIVE-0155: regime identificado, cobertura e gargalo marginal`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

Todos os checkboxes são de execução futura e continuam abertos. A revisão documental não conclui AC de runtime.
