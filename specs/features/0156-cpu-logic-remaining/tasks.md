# 0156 — Oráculo e otimizações por item — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0156-A e L2-book concluídos localmente; ganho live e demais itens pendentes.
- **Issue:** ARK-139; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate por pacote

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026.
- [x] Pré-requisitos/fixtures do pacote isolado 0156-A verificados. Pré-requisitos de L2/L3 e demais itens continuam pendentes.

## Implementação por pacote

- [x] **T1 — Reparar clone/projeção, erros parciais e snapshots suportados.** AC1,7. Verificação: `0156 oracle divergent worlds`; claims10/999 falhou antes do reparo.
- [x] **T2 — Implementar sequências/factory/globais/módulos isolados com cache entre passos.** AC1,7. Verificação: `0156 oracle warm isolation`; 28 autotestes no total, integrados ao smoke.
- [ ] **T3 — Inventariar entradas e separar L2 após referência0153 revisada.** AC2–3. Verificação futura: `0156 listing live maintenance`.
- [ ] **T4 — Separar L3 preservando observação0155 e reserva0149, efeitos/desired/pending.** AC2–3. Verificação futura: `0156 lab live observation`.
- [ ] **T5 — Validar L4 sem atraso de evento/vítima/controller/prazo e sem dedupe duplicado.** AC4. Verificação futura: `0156 intel live events`.
- [ ] **T6 — Tratar L7/O3 com recuperação de segmentos/owners; manter L6 bloqueado sem contrato próprio.** AC6. Verificação futura: `0156 recovery before lazy cleanup`.
- [ ] **T7 — Testar off/reset/provider/hash/intratick em cada cache e medir custo completo.** AC2,5–6. Verificação futura: `0156 cache off pending; LIVE-0156: spans comparáveis`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

## Aceite do pacote 0156-A — ARK-142

- [x] T1/T2 e AC1/7: 28 autotestes diretos e integrados ao smoke.
- [x] node --check nos cinco JS tocados; smoke final 11616 assertions OK, zero falhas; diff check limpo.
- [x] Build isolado, graphify atualizado, cliente/src/dashboard preservados.
- [x] Usuário confirmou remoção intencional do painel; teste de layout obsoleto ajustado, sem alteração do dashboard.

Pacote 0156-A concluído localmente. Demais pacotes e aceite live da 0156 continuam pendentes; o DoD futuro acima é da feature inteira. Ver [registro da entrega](../../../docs/entrega-0156-a-2026-10-16.md).

## Entrega L2-book — 16/10/2026

[Pacote local](../../../docs/pacote-local-listagens-2026-10-16.md): reutilização por tick/lado/recurso no orderBook existente, sem cache de decisões ou saldos. Ramo de consultas diretas versus ramo compartilhado iguais no oráculo em 3/5/10 salas, com manutenção/off/reidratação/recarga do módulo/provedor/manual/estoques vivos. Consultas nativas41/67/132→13/13/13, sem inferir CPU Screeps. Flag terminalOps.reuseOrderBook default true, desligável para comparação. L2 geral/T3/T7 permanecem parciais; pixel automático e demais caches não entram neste aceite.
