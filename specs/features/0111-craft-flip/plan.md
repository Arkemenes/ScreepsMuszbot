# 0111 — Plan

Spec: [spec.md](spec.md). Ordem pensada para que cada fase deixe o smoke
verde e entregue valor sozinha (a fase 3 corrige um bug que já existe hoje).

## Módulos

| Módulo | Papel |
|---|---|
| `src/utils/marketPricing.js` (novo) | Puro, sem `Game` além de ler `market.js`: estatística do histórico (mediana, σ_rel, presença, profundidade, spread), preço duplo conservador, margem `piso + zConf·σ·√(T/3600)`, guardrails de liquidez, modelo de custo recursivo por nó (fabricar vs comprar), índice reverso de receitas, decisão vender-ou-processar. |
| `src/utils/labSlots.js` (novo) | Tabela fixa dos 10 slots do stamp (offsets), resolução única para ids no heap, alcances, plano de fases por faixa de RCL (árvore / reutilização / estacionamento). |
| `src/rooms/architect.js` | Só o grid `rcl` do stamp de labs (`structures`/`ramparts` intactos). |
| `src/roles/hauler.js` + `src/utils/nonEnergyLogistics.js` | Transitório: energia de lab/factory só com cadeia ativa e no tamanho do lote; dreno ao storage; jobs de abastecimento por fase. |
| `src/utils/marketFlip.js` | Passa a usar `marketPricing` (outlier só na venda, margem com `T` curto, liquidez, compra barata livre). |
| `src/utils/craftPlanner.js` (novo) | Por sala: gate de viabilidade, pré-voo, máquina de estados da cadeia (stall guard), ledger, disjuntores, modo `test`, comando de status. Chamado por `guard("craftPlanner")` em `main.js`. |
| `src/utils/config.js` | Bloco `craft.*` e `marketFlip.*` novos. |
| `test/smoke.js` | Asserts por AC. |

## Fases

1. **marketPricing** (puro, mais fácil de testar). Sem integração.
2. **labSlots + reorder do `rcl`**.
3. **Transitório no hauler** (bug existente: energia parada em lab/factory).
4. **Flip** usando `marketPricing`.
5. **craftPlanner em modo `test`** (gate, pré-voo, candidatos, descartes, status, ledger vazio).
6. **Execução**: máquina de estados da cadeia, compras via `terminalOps.buy`, abastecimento por fase, dreno, venda, fallback de retenção, `committedCredits` compartilhado, disjuntores.

## Decisões de implementação

- Preço: lê `temporalSnapshots` via uma função nova exportada por
  `market.js` (`samples(resourceType)`), sem duplicar o histórico.
- `T` é função pura de (receita, lotes, plano de fases, nº de saídas).
- Estado da cadeia em `Memory.craft` (só ids/strings/números); índice reverso,
  tabela de slots e ids resolvidos no heap.
- Nenhum literal: tudo via `config.get("craft.*")`.

## Riscos

- Fases 3 e 6 alteram o hauler (arquivo de 1300 linhas, cascata de jobs):
  mudanças pequenas e cobertas por smoke.
- Fase 6 só liga com `craft.test = false`; default permanece `true`.
