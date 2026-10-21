# 0154 — Eventos de energia, relatórios e experimentos — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — etapa 2/T1–T2 implementada localmente; coleta ampliada, relatórios/experimentos e aceite live pendentes.
- **Issue:** ARK-133; pacote T1/T2 em ARK-143; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [x] Pré-requisitos de T1/T2 e regras mecânicas fixadas no commit público 80977824199a596d174d392fd0cf8c458c21fcbd; fontes/limites na entrega.

## Implementação por pacote

- [x] **T1 — Registrar/substituir/cancelar slots, resolver prioridades e movimentos cobertos.** AC1,8–9 offline; demais movimentos ficam unknown. Verificação: `0154 builder slots; 0154 work intent order`.
- [x] **T2 — Limitar controller/tick e testar dois creeps/boost/efeito/tick seguinte.** AC1,9 offline. Verificação: `0154 shared RCL8 next tick`.
- [ ] **T3 — Completar fluxos/waits/atribuição e qualidade necessários aos consumidores futuros.** Parcial: eventos WORK e qualidade mínima no heap entregues em T1/T2; persistência sofisticada adiada. AC2,4,7. Verificação futura: `0154 event attribution; 0154 bounded hooks`.
- [ ] **T4 — Consumir 0157 em energyReport com utilização/ocupação/RCL/ETA/break-even.** AC3–5. Parcial 2026-10-20 (0154-B, publicado): `utils/energyReport.js` com gasto/categoria, utilização de WORK por role, renda proxy, ETA de RCL, cobertura e `context()`; smoke `0154 report denominators` + 7 assertions `0154 report:`. 2026-10-21: utilização conta harvest aceito (miners deixam de ler 0%) e lê `energyLedger.actedIds()` em vez de copiar eventos (custo live ~0,25 CPU/tick); smoke `0154 acted ids`. Faltam consumo de 0157 e break-even de compostos. Verificação futura: `0154 report denominators`.
- [ ] **T5 — Adicionar overlay/registry serializável e acesso central dos settings permitidos.** AC6. Verificação futura: `0154 experiment overlay`.
- [ ] **T6 — Integrar recuperação antes de spawn, off/reset/manual/ABA e invalidação needs.** AC6. Verificação futura: `0154 experiment recovery`.
- [ ] **T7 — Medir overhead real e qualidade de atribuição após autorização.** AC5,7. Verificação futura: `LIVE-0154: coleta e relatório antes de endTick`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

T1/T2 implementados em ARK-143, sem concluir a feature inteira. Registro/validação: [entrega da etapa 2](../../../docs/entrega-0154-a-2026-10-16.md). T3 completo, T4–T7 e aceite live permanecem abertos.

## Aceite local da etapa 2/T1–T2 — ARK-143

- [x] Reproduções de duplicação/prioridade/RCL8 falharam antes e passaram depois; drop não positivo também tem regressão específica.
- [x] 44 assertions novas; smoke11660 verde; node --check em13 JS; grunt117 módulos com destino isolado.
- [x] Diff/documentação/grafo atualizados; cliente real/dashboard/exporter e arquivos fora do escopo preservados por hash.
- [x] Sem deploy, experimento, população/boost/power ou persistência sofisticada. Custo live/T7 permanece aberto.
