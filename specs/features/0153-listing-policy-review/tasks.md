# 0153 — Política de listagens — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0153-A1 físico implementado localmente; pixel automático e aceite live pendentes.
- **Issue:** ARK-138; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Entrega local 0153-A1 — 16/10/2026

[Pacote e validação](../../../docs/pacote-local-listagens-2026-10-16.md): política física e recuperação implementadas; flag listingPolicy.enabled off por padrão. Cálculo puro de pixel testado, sem executor conectado. Não concluir a feature inteira. Metadados na operação canônica de terminalOps; desaparecimento/edição externa põem a geração em quarentena, sem refund/venda inventados.

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [x] Fontes/fixtures do pacote físico 0153-A1 verificadas; executor pixel e aceite live continuam pendentes.

## Implementação por pacote

- [x] **T1 — Modelar política pura/quotes competitivas e piso/procedência.** AC1–2. Verificação offline do escopo físico: `0153 competitive create and extend`.
- [x] **T2 — Integrar taxas incrementais, staging e reconciliação em terminalOps.** AC1–3. Verificação offline do escopo físico: `0153 incremental fees`.
- [x] **T3 — Persistir idade real, legado conservador e cancelamento gerido protegido.** AC4–6. Verificação offline do escopo físico: `0153 timestamps; 0153 protected cleanup`.
- [ ] **T4 — Integrar executor pixel bids→extensão única competitiva→estoque.** Cálculo puro preparado/testado; integração de ownership/pendências ainda não entregue. AC7. Verificação offline do escopo físico: `0153 pixel exposure`.
- [x] **T5 — Audit de taxa histórica/incremental, cancelamento versus expiração e refund potencial.** AC8. Verificação offline do escopo físico: `0153 cancellation versus expiry`.
- [x] **T6 — Testar off/reset/manual com create/extend/cancel pendentes sem duplicar efeito.** AC9. Verificação offline do escopo físico: `0153 off pending`.
- [ ] **T7 — Após autorização medir fees/listagens com referências atuais.** AC8. Verificação offline do escopo físico: `LIVE-0153: taxas novas e execução observada`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

T1/T2/T3/T5/T6 concluídos somente para recursos físicos no pacote A1. T4/AC7 e aplicação live permanecem abertos. node --check, smoke11717 e build119 isolado passaram; atualização do grafo e rastreio acompanham o fechamento do pacote. O DoD acima permanece da feature inteira, não do subconjunto físico.
