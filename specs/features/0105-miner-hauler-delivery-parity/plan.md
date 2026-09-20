# 0105 — Paridade de entrega entre miner e hauler — Plan

## Approach

Adicionar ao `hauler` uma API pequena de política que expõe se uma torre local
é um destino válido na mesma cascata de `pickDeliver`. O `miner` usa essa API
depois de verificar a fome de spawn/extensions; assim os thresholds permanecem
em um único lugar e o restante do output cai no link.

## Modules

| Path | Change |
|------|--------|
| `src/roles/hauler.js` | Expor predicado de torre elegível com os thresholds existentes. |
| `src/roles/miner.js` | Selecionar link/torre pela política compartilhada. |
| `test/smoke.js` | Atualizar e ampliar assertions do miner. |

**CPU:** reutiliza `roomCache` e o cache derivado do hauler.

**Fail-soft:** sem estruturas elegíveis, mantém o fallback existente.
