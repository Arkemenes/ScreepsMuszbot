# 0153 — Política de listagens — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0153-A1 físico implementado localmente; pixel automático e aceite live pendentes.
- **Issue:** ARK-138; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Entrega local 0153-A1 — 16/10/2026

[Pacote e validação](../../../docs/pacote-local-listagens-2026-10-16.md): política física e recuperação implementadas; flag listingPolicy.enabled off por padrão. Cálculo puro de pixel testado, sem executor conectado. Não concluir a feature inteira. Metadados na operação canônica de terminalOps; desaparecimento/edição externa põem a geração em quarentena, sem refund/venda inventados.

## Approach / Modules

listingPolicy contém competitive/descentStep/pixelPlan puros. Quotes incluem preço/volume/validade e procedência; custo desconhecido não vira zero. swingTrade e terminalOps.listResidual verificam antes de staging e de create/extend/reprice. Livro reusado/filtrado; não presumir que byResource evite fetch completo.
terminalOps permanece dono de intents/taxas/claims/recibos e timestamps. ordersAudit observa os mesmos eventos, sem executar política paralela.

## Data flow e falhas

proposed → staging → submitPending → listed → amendPending/cancelPending → settled.
Persistir owner, geração, IDs e idade original. Extensão não renova createdAt; legado desconhecido inicia observação conservadora. Revalidar livro, piso, quantidade livre e crédito antes da taxa; reserva de staging sem quote não autoriza efeito.
Cancelamento gerido aos sete dias só alcança ordens automáticas elegíveis. Limpeza usa remainingAmount=0 confirmado, não inactive/amount=0. Manual/pixel/IDs pendentes permanecem protegidos.
Off bloqueia decisão nova e conserva reconciliação. Reset compara pending com ordens/transações/saldos antes de reenviar. Edição manual revoga geração automática. Ausência inexplicada fica unknown; cancelamento não restaura ID/taxa.

## Validation / Rollout

Fixtures diretas por custo incremental create/extend/alta/baixa; ask próprio excluído, profundidade/livro ausentes, staging não competitivo, piso/procedência desconhecidos, timestamp/legado/reset, extensão com mesma idade e cleanup protegido.
Mercado: distinguir cancelamento sem refund de expiração natural com restituição potencial; simular off entre cada submissão e confirmação. Pixel: bids primeiro, saldo livre distinto do listado, extensão única competitiva com margem3%, senão estoque.
0153-A é independente do oráculo/ledger; ativação futura é por flag autorizada. Medir fees novas efetivas e comportamento de listagens; não alegar recuperar taxa histórica ou receita garantida por ask competitivo.

## Risks & mitigations

Desativação perder pendência: manter reconciliador vivo. Cronômetro indevido: timestamps reais persistidos. Cancelar manual: ownership/geração. Dupla exposição pixel: saldo livre e pending descontados. Prazo sete dias renuncia refund futuro potencial, explicitado no audit sem alterar a decisão do dono.
