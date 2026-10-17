# 0149 — Boosts com retorno realizável — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0149-A/B locais: previsão, retorno, preparação/transporte e cleanup; aplicação automática ainda pendente.
- **Issue:** ARK-136; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [ ] Pré-requisitos do pacote no DAG e revisão das fontes/fixtures verificados.

## Implementação incremental — itens completos ainda pendentes

- [x] **T1 — Implementar cálculo puro de benefício/custo por ação, corpo e TTL.** AC1–3,7. Verificação futura: `0149 realizable benefit`.
- [ ] **T2 — Adicionar adaptador canônico e bundle de claims/entregas/energia por owner.** AC4,8. Verificação futura: `0149 canonical reservations; 0149 missing delivery`.
- [ ] **T3 — Integrar todos os leitores: refining, runtime, modelo, executor, transientStock, hauler e claims.** AC4,8. Verificação futura: `0149 all reservation readers`.
- [ ] **T4 — Integrar spawn sem espera, seleção real por bodyPartsCount, parcial e confirmação do corpo inteiro.** AC3,5. Verificação futura: `0149 spawn never waits; 0149 partial confirmation; 0149 engine part selection`.
- [ ] **T5 — Encerrar reset/morte/prazo/off/pin e drenar antes de retornar ao pool.** AC5,8. Verificação futura: `0149 reservation lifecycle; 0149 forced cleanup off idle drain; 0149 manual takeover and quarantine`.
- [ ] **T6 — Testar fallback e helper futuro de compra por asks existentes sem listing.** AC6,9. Verificação futura: `0149 fallback; 0149 executable acquisition`.
- [ ] **T7 — Medir piloto autorizado com composto próprio e atribuição de benefício.** AC7. Verificação futura: `LIVE-0149: custo total, trabalho útil e oportunidade do lab`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

T1 tem implementação pura local; T2–T7 continuam abertos porque as entregas parciais não concluem seus contratos completos. A entrega local não conclui AC live.

## Entrega parcial 0149-A — 16/10/2026

Seleção pura, `boostPreview` e adaptador/leitores implementados localmente. Ver [escopo, limites e sequência](../../../docs/entrega-0149-a-2026-10-16.md). T1 econômico, bundle de T2, spawn/confirmação de T4 e lifecycle de T5 continuam pendentes. Não há writer, abastecimento de composto nem aplicação automática. Fixtures semânticas não substituem pin do engine ou validação live.

- [x] Seleção por prefixo e custos de aplicação, sem economia/ROI presumidos.
- [x] Prévia somente leitura e contagem opcional no helper manual.
- [x] Adaptador canônico de leitura e proteção no runtime/executor/transporte/claims; cleanup respeita holds.
- [ ] Bundle canônico de origem/cargo/lab e writer com lifecycle completo.

- [x] Validação da etapa parcial: sintaxe em 12 JS, smoke 11.779 assertions, build isolado 122 módulos, diff check; cliente preservado. Não conclui o DoD da feature automática.

## Entrega parcial 0149-B — 16/10/2026

Política pura de retorno fixed/capacity, checker de entrega por prefixos e preparação controlada de XLH2O próprio implementados localmente. Bundle físico de origem/cargo/lab no registro canônico, confirmação deferida de transporte e recuperação de off/reset/morte/deadline/pin/quarentena. Claims continuam valendo com stockPolicy desligado; coleta normal de energia pode revogar preparação opcional. Defaults desligados, uma sala/builder, sem compras.

Núcleo puro de confirmação do boost testado por corpo inteiro/estoques, ainda não ligado a um intent nativo. Falta coletor/admissão comum de combustível futuro, candidato/approach/executor e confirmação no runtime, pin/servidor e validação live. Não tratar o contexto manual de teste como evidência em produção. [Pacote e limites](../../../docs/pacote-boost-2026-10-16.md).

- [x] Checker puro de oferta/demanda por prefixos (dependência parcial0157), com margem/idade/cobertura.
- [x] Bundle físico de energia de aplicação/composto na origem, cargo e lab, sem duplo desconto.
- [x] Haulers existentes confirmam retirada/entrega no tick seguinte; dedup por recurso e owner.
- [x] Recuperação da preparação: off, reset, morte, prazo, takeover e cleanup/quarentena.
- [x] Núcleo puro de recibo/conciliação de boost; externo ao executor de runtime.
- [ ] Observar e admitir combustível/canais futuros comuns; integrar candidato e aplicação/confirmação no runtime.
