# 0100 — Preço direto para ciclos de commodities — Plan

## Approach

Antes da derivação, `market.js` identifica se o próprio recurso alcança a si
mesmo pelo grafo de `COMMODITIES`. Esses nós são folhas de preço de mercado:
não têm seus campos sobrescritos e, quando aparecem como insumo de uma receita
acíclica, devolvem sua cotação temporal direta. A derivação dos demais nós
mantém o contrato atual, inclusive `null` quando faltar um insumo necessário.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/utils/market.js` | Distingue nós cíclicos de commodities deriváveis. |
| `test/smoke.js` | Reproduz `energy`/`O` reversíveis e protege a commodity acíclica. |
| `specs/ARCHITECTURE.md` | Documenta o fallback de cotação direta. |

## How it satisfies the constitution

- **CPU:** busca no grafo só ocorre dentro do scan já throttled.
- **Memory:** usa memo efêmero por scan.
- **Fail-soft:** constantes ausentes ou receitas incompletas retornam o
  fallback existente, sem exceção.
- **Offline test:** dados de receita e book são todos mockados no smoke.

## Rollback

Reverter o commit restaura a substituição derivada anterior; não há migração
ou dado persistente.
