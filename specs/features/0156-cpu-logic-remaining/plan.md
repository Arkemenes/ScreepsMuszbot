# 0156 — CPU: lógica restante — Plan

## Approach

Um item por vez, cada um com **referência intocada** em `test/`, oráculo com fuzz, flag e validação em produção pelo `cpuReport`.
Ordem de menor para maior risco: L4, L2, L3, depois L6/L7/O3. Todos seguem o padrão já usado em 0147/0152:
assinatura de entradas (comparação por laço, sem strings) -> reusa a decisão anterior só se **nada** que a
decisão lê mudou; qualquer divergência recalcula.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/decisionCache.js` | `get(name, key, signatureFn)` / `store`: cache por assinatura com tamanho limitado e invalidação por reset; contadores de hit/miss no heap |
| `test/cpuLogicCases.js` | referência x candidata com fuzz para L2/L3/L4 |

### Changed

| Path | Change |
|------|--------|
| `src/utils/terminalOps.js` | `listResidual`: caminho ocioso pela assinatura (L2) |
| `src/utils/labPolicyRuntime.js` | `assignments`/`resolve`/`profile` pela assinatura (L3); `confirm` por tick |
| `src/rooms/intel.js`, `src/utils/transitSafety.js` | por (sala, tick de visão) e hostilidade (L4) |
| `src/utils/config.js` | flags `cpu.cache.listings`, `cpu.cache.labPolicy`, `cpu.cache.intel` (padrão off até validar) |

## Data shapes

Heap: entradas `{signature, decision}` por sala/op, no máximo `cpu.cache.entries`. Sem Memory nova.

## How it satisfies the constitution

- **CPU:** a assinatura custa menos que a decisão (medido pelos probes). **Memory:** nada. **Fail-soft:** divergência = recalcula.
- **Offline test:** fuzz de mutação por entrada + oráculo de equivalência.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Esquecer uma entrada na assinatura | fuzz: cada entrada é mutada isoladamente e o resultado deve invalidar |
| Cache congela decisão por TTL escondido | proibido; só assinatura; teste de relógio avançando sem mudança de entrada |
| Estado de ordens/ledger divergir | oráculo compara a decisão **e** os efeitos (intents, campos gravados em `op`) |
