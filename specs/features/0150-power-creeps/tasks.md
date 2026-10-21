# 0150 — Power, GPL e operador — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — compatibilidade de deals/sends/labs e quotas strict implementada localmente; piloto/ops/lifecycle e aceite live pendentes.
- **Issue:** ARK-137; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [ ] Pré-requisitos do pacote no DAG e revisão das fontes/fixtures verificados.

## Execução incremental — parcial local

Prioridade de 17/10: compatibilidade T5/T6 e T10 antes de habilitar operador; T11/T12 precedem piloto T9. [Análise e limites](../../../docs/prioridade-labs-terminal-2026-10-17.md). A lista é um backlog com dependências, não ordem numérica rígida.

- [ ] **T1 — Calcular target dinâmico, investimento total/restante, quotes/readiness e banda econômica.** AC1–3,8. Verificação futura: `0150 dynamic target; 0150 hysteresis`.
- [ ] **T2 — Implementar powerPlan dry-run e seleção mínima comprovada pelo poolAfterCancel, livre primeiro.** AC4,10. Verificação futura: `0150 dry run; 0150 minimal cancellation; 0150 overlapping physical backing`.
- [ ] **T3 — Integrar owner/logística/reconciliação e gates de feed/processPower inclusive saldo existente.** AC1,4–5,10. Verificação futura: `0150 pending cancellation; 0150 off stocked spawn`.
- [ ] **T4 — Medir fase 0 somente com autorização própria, preservando trabalho útil.** AC3,8. Verificação futura: `LIVE-0150-0: energia/GPL/custos reais`.
- [x] **T5 — Integrar reactionAmount no modelo/runtime/executor/reservas/ledger e confirmação.** AC6,9. Verificação futura: `0150 operated levels and shared inputs`.
- [ ] **T6 — Implementar quota strict/boundedSurplus, custo propagado, término e stall guard.** AC6,9. Verificação futura: `0150 quota 10 amount 7; 0150 chain termination; 0150 shared quota key`.
- [ ] **T7 — Validar cobertura/ops/logística e retorno por poder antes da decisão de operador: reação/reagentes/venda quando aplicável ao lab; frete próprio evitado/fluxo útil/cooldown no terminal.** AC7–8. Verificação futura: `0150 coverage rejects; LIVE-0150-base: 48h reais`. Medição: lab = [0155 labReport](../0155-lab-utilization/spec.md); terminal = [0163 terminalReport](../0163-terminal-utilization/spec.md) (cooldown, espera por cooldown, frete próprio e economia estimada por nível), publicado em 2026-10-21.
- [ ] **T8 — Implementar lifecycle/managed/safe, reset/morte/cooldown/target manual.** AC5,7–8. Verificação futura: `0150 operator safe lifecycle`.
- [ ] **T9 — Após autorização separada medir operador e revalidar regime antes de expansão.** AC7–9. Verificação futura: `LIVE-0150-2: contribuição final, vendas e CPU`.

- [x] **T10 — Compatibilidade de terminal operado sem operador.** AC11. Mapear envios/deals próprios, custo/combustível/reservas/relay e confirmação; fixtures pinadas de níveis, expiração, arredondamento, energia como carga, reset e efeito externo. Sem efeito mantém referência. Cobrir API+processor: frete bruto100/efetivo90 com saldo90 rejeita; buffer bruto aceita, consumo real90 e sobra liberada após confirmação, inclusive carga de energia.
- [ ] **T11 — Diagnóstico sob demanda e orçamento comum de ops.** AC12. Saldo livre/geração real/custo de oportunidade, pendências e renew/trânsito; sem compras automáticas, dupla reserva, scans globais ou nova persistência preventiva.
- [ ] **T12 — Agendamento limitado e aceite de CPU dos dois poderes.** AC13. Preservar poll global; despertar só destinos afetados quando necessário. Pilotos separados/combinado com mesma carga, CPU total warm/cold, picos/bucket e contribuição útil; aumento sustentado bloqueia expansão.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

T5/T10 têm aceite offline do pacote mecânico; T6 strict está implementada, boundedSurplus segue adiado. AC de ativação/live continuam abertos.

## Pacote T10-A concluído localmente

- [x] Fator comum para deals/swing/relay, custo econômico separado do buffer bruto, claims/fuel, pending persistível e liquidação parcial/reset/expiração. [Entrega e limites](../../../docs/entrega-0150-terminal-a-2026-10-17.md).
- [x] T10-B: sends deferidos, parcial/saldo/cancelamento e custo operado; mudanças de efeito sem prova suspendem economia. Aceite offline, sem piloto/live.

## Pacote de compatibilidade B — teste live pendente

[Entrega e roteiro de validação](../../../docs/pacote-power-compatibilidade-2026-10-17.md).

- [x] T6-A: strict quantitativo/quotaKey, viabilidade limitada por expiração e stall guard; não exceder meta nem esconder cauda.
- [ ] T6-B: boundedSurplus, somente se necessidade demonstrada e opt-in; adiado.
- [x] T11-A: powerStatus somente sob demanda, fatos e unknown explícitos; nenhuma autorização de gasto.
- [ ] T11-B/T8: orçamento compartilhado e lifecycle, após fatos da conta e validação do pacote.
- [ ] LIVE: baseline/post CPU150 sob carga comparável, transferências reais e progresso dos labs. Antes de operador/investimento, evidência48h válida e gates econômicos próprios.
