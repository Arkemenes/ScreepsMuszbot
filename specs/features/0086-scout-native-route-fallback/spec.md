# 0086 — Scout native-route fallback

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

O diagnóstico publicado por 0085 confirmou que, numa missão `signRoom` de
`E1N47` para `E1N45` via `E1N46`, o ramo `nativeRoute` chama `moveTo()` para
`E1N46:24,0` e recebe `ERR_NO_PATH` repetidamente. Esse ramo retorna o erro
direto, sem o tratamento de no-path do roteador padrão, mantendo o scout
parado na mesma posição.

## Desired outcome

O scout de `signRoom` usa o fluxo padrão de `moveToRoom()`, que preserva o
pré-cálculo de rota e o hop único, mas também tem recuperação de falha e
orçamento de busca multi-sala adequado.

## In scope

- Remover `nativeRoute: true` da chamada de `signRoom`.
- Cobrir no smoke que o scout não seleciona esse ramo especial.

## Out of scope

- Alterar o algoritmo de rota padrão.
- Remover ou modificar `nativeRoute` para futuros callers.

## Acceptance criteria

1. O smoke test assert que `scout.run()` para `signRoom` não passa `nativeRoute` a `moveToRoom()`.
2. O comando `scoutTrace(true)` mostra o fluxo `route-before`/`route-after`, não `native-before`/`native-after`, durante a missão.
3. `node test/smoke.js` e `npx grunt` permanecem verdes.

## Constitution check

- **CPU:** usa o orçamento de busca e cache já existentes no caminho padrão.
- **Memory:** nenhum campo novo.
- **Fail-soft:** `ERR_NO_PATH` volta ao fluxo que conta falhas e recupera/recalcula.
- **Offline test:** smoke observa as opções passadas pelo scout ao roteador.

## Open questions

- O teste ao vivo confirma se o teto/recuperação do caminho padrão resolve a rota em `E1N47`.