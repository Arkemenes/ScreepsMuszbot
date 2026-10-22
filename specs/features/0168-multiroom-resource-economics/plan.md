# 0168 — Aquisição e distribuição econômica de recursos entre salas — Plan

Derivado de spec.md; trabalho planejado na ARK-205.

## Approach

Construir uma cotação pura sobre demandas já registradas por boost/labs/consumidores. Para cada par demanda-sala, gerar alternativas com quantidade líquida e custo efetivo entregue, reutilizando resourcePolicy, readinessContext, boostLogistics, terminalRouting, terminalReport e labReport. A fase inicial apenas descreve a escolha. Depois de fixtures e revisão, integrar uma rota aprovada ao executor existente apropriado, mantendo um único local para intents de mercado/terminal e os recibos atuais.

O modo read-only não reservará recursos nem criará operação. Durante execução, a máquina existente revalida reservas, saldo, cooldown, capacidade e idempotência imediatamente antes do intent. O piloto começa por composto de boost, onde a hipótese de comprar barato e transferir é mensurável, e inclui o cenário original de labs ociosos.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| src/utils/resourceRouteQuote.js | Cotar estoque, compra, frete e processamento remoto sem executar intents. |

### Changed

| Path | Change |
|------|--------|
| src/utils/terminalOps.js | Consumir uma alternativa aprovada sem duplicar deals/sends nem protocolo de receipts. |
| src/utils/boostLogistics.js | Fornecer demanda e avaliar economia entregue para compostos de boost. |
| src/utils/terminalRouting.js | Expor candidatos de frete e custo já calculados. |
| src/utils/resourcePolicy.js | Consultar excesso disponível após pisos e compromissos. |
| src/structures/lab.js | Considerar processamento em sala remota sob a cotação comum. |
| test/smoke.js | Cobrir rotas concorrentes, ausência de preço, frete, reservas e cooldown. |

## Data shapes

- Cotação em heap por tick: { resource, amount, destination, options[], selected, reason }.
- Opção armazena origem/destino por nome de sala e números de custo/tempo.
- Estado de execução continua no formato de terminalOps; a nova rota não guarda objetos.
- Config em Memory.settings.resourceRouting: mode=readOnly por padrão e allowlist de consumidores/recursos.

## How it satisfies the constitution

- **CPU:** usa dados já preparados de terminal/labs/readiness; sem nova passagem em Game.creeps ou scans duplicados.
- **Memory:** nenhuma estrutura/terminal é serializada; operação real usa o protocolo existente.
- **Fail-soft:** incerteza ou custo de transporte não mensurável rejeita a alternativa e preserva a política atual.
- **Offline test:** fixtures controlam preços, saldo, transação de energia e capacidade de terminal.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Preço de crédito esconde custo de energia/frete. | Avaliar tudo em unidade de custo entregue e expor parcelas individuais. |
| Cotação consome estoque necessário à sala doadora. | Aplicar floors, claims, readiness e compromissos antes de gerar opção. |
| Execução duplica intents de mercado ou terminal. | Manter terminalOps como executor exclusivo e idempotente. |
| Preços ausentes favorecem arbitragem falsa. | Marcar rota como desconhecida e manter a estratégia existente. |

## Rollback

Desligar resourceRouting.mode e remover consumidores do piloto; a cotação read-only não altera o runtime econômico.
