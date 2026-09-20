# 0105 — Paridade de entrega entre miner e hauler

- **Status:** done
- **Created:** 2026-09-19

## Problem

`src/roles/miner.js` escolhe a torre local usando uma cascata própria, que
prioriza a torre mesmo quando spawn/extensions precisam de energia e usa
thresholds diferentes dos de `src/roles/hauler.js`.

## Desired outcome

O miner toma a mesma decisão econômica do hauler: quando spawn/extensions
precisam de energia, o output segue para o link; quando uma torre é um destino
válido segundo os thresholds do hauler, o output segue para a torre; nos demais
casos, segue para o link.

## In scope

- Reusar `tower.criticalRatio`, `tower.criticalRatioUnderAttack` e
  `hauler.toppingOffThreshold`.
- Manter o fallback seguro para container quando não houver link utilizável.
- Atualizar o smoke test para spawn/extension, torre crítica, torre opcional e
  fallback para link.

## Out of scope

- Alterar `pickDeliver` do hauler ou a política de source-defense.

## Acceptance criteria

1. Com spawn/extension vazios, o miner transfere para o link, mesmo que a torre
   esteja abaixo do threshold crítico.
2. Uma torre abaixo do threshold crítico do hauler é escolhida pelo miner
   quando não há spawn/extension pendente.
3. Uma torre não crítica só é escolhida quando a economia está acima da reserva
   e ela tem mais que `hauler.toppingOffThreshold` de capacidade livre.
4. Sem torre elegível, o miner usa o link antes do container.
5. `node test/smoke.js` e `npx grunt` permanecem verdes.

## Constitution check

Usa `roomCache` para respeitar a regra de uma busca de estruturas por tick,
mantém a decisão em heap e adiciona assertions determinísticas ao smoke.

## Open questions

- Nenhuma.
