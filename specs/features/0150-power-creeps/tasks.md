# 0150 — Power, GPL e operador — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** planned — execução local autorizada em etapas; não implementada.
- **Issue:** ARK-137; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [ ] Pré-requisitos do pacote no DAG e revisão das fontes/fixtures verificados.

## Implementação futura — não executada

- [ ] **T1 — Calcular target dinâmico, investimento total/restante, quotes/readiness e banda econômica.** AC1–3,8. Verificação futura: `0150 dynamic target; 0150 hysteresis`.
- [ ] **T2 — Implementar powerPlan dry-run e seleção mínima comprovada pelo poolAfterCancel, livre primeiro.** AC4,10. Verificação futura: `0150 dry run; 0150 minimal cancellation; 0150 overlapping physical backing`.
- [ ] **T3 — Integrar owner/logística/reconciliação e gates de feed/processPower inclusive saldo existente.** AC1,4–5,10. Verificação futura: `0150 pending cancellation; 0150 off stocked spawn`.
- [ ] **T4 — Medir fase 0 somente com autorização própria, preservando trabalho útil.** AC3,8. Verificação futura: `LIVE-0150-0: energia/GPL/custos reais`.
- [ ] **T5 — Integrar reactionAmount no modelo/runtime/executor/reservas/ledger e confirmação.** AC6,9. Verificação futura: `0150 operated levels and shared inputs`.
- [ ] **T6 — Implementar quota strict/boundedSurplus, custo propagado, término e stall guard.** AC6,9. Verificação futura: `0150 quota 10 amount 7; 0150 chain termination; 0150 shared quota key`.
- [ ] **T7 — Validar cobertura/gargalo/ops/logística/venda antes de decisão de operador.** AC7–8. Verificação futura: `0150 coverage rejects; LIVE-0150-base: 48h reais`.
- [ ] **T8 — Implementar lifecycle/managed/safe, reset/morte/cooldown/target manual.** AC5,7–8. Verificação futura: `0150 operator safe lifecycle`.
- [ ] **T9 — Após autorização separada medir operador e revalidar regime antes de expansão.** AC7–9. Verificação futura: `LIVE-0150-2: contribuição final, vendas e CPU`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

Todos os checkboxes são de execução futura e continuam abertos. A revisão documental não conclui AC de runtime.
