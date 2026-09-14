# 0070 — Torre não deixa mais dano trivial vencer rampart crítico

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Revisão geral da lógica de reparo (pedida pelo usuário depois dos ROADMAP
0067-0069) achou um bug real em `structures/tower.js`'s `findRepairTarget`:
a função checava **todas** as estruturas normais (qualquer dano, mesmo
trivial) numa lista, e só olhava pra `defensiveStructures` (rampart/wall)
se essa primeira lista estivesse **totalmente vazia**:

```js
if (normalStructures.length) {
    return _.sortBy(normalStructures, s => s.hits)[0];
}
// só chega aqui se normalStructures.length === 0
const defensiveStructures = ...
```

Numa sala ativa, quase sempre existe ALGUMA estrada com decay abaixo do
piso de tráfego — ou seja, `normalStructures.length` raramente é zero. Isso
significa que um rampart a 0.05% de hits, prestes a ser destruído, perdia
incondicionalmente pra uma estrada com 1 hit de dano trivial, TODA vez que
a lista de estruturas normais não estivesse vazia. `roles/builder.js` não
tem esse bug — ele já junta rampart/wall crítico e estrutura normal no
mesmo pool, ordenado por ratio, então o crítico naturalmente sobe ao topo.

Segundo bug no mesmo bloco: a ordenação de `normalStructures` era por
**hits absolutos** (`s.hits`), não por ratio (`s.hits/s.hitsMax`). Como
`CONTAINER_HITS_MAX` (250k) é 50-250x maior que spawn/extension/road
(1k-5k), isso enviesava a torre a preferir consertar um arranhão trivial
numa extension a um container seriamente danificado — o container, mesmo
proporcionalmente muito pior, quase sempre tem MAIS hits absolutos
restantes que uma extension quase intacta.

Combinados, os dois bugs significam: a torre podia estar sistematicamente
ignorando containers/ramparts críticos por causa de decay trivial em
road/extension — uma explicação plausível pra estruturas destruídas por
falta de reparo, mais provável que qualquer threshold ajustado nos specs
0067-0069.

## Desired outcome

`findRepairTarget` passa a usar **um único pool ratio-ordenado** pra tudo
que é urgente: qualquer dano em estrutura normal, OU um rampart/wall
crítico (`rampartRepair.isCritical`) — mesmo princípio que
`roles/builder.js` já usa. Um rampart crítico, com ratio típico bem abaixo
de qualquer dano trivial, sobe ao topo naturalmente, sem precisar de uma
lista separada checada primeiro. Só cai pro pool "saudável"
(`worthHardeningByTower`, reserve-gated, ROADMAP 0069) quando não existe
NADA urgente.

## In scope

- `src/structures/tower.js`: `findRepairTarget` reescrito — pool `urgent`
  (normal qualquer + rampart/wall crítico) ratio-ordenado, checado
  primeiro; pool `eligible` (rampart/wall não-crítico, `aboveReserve`
  gated) só como fallback.
- `test/smoke.js`: duas assertions novas — rampart crítico vence extension
  quase intacta; container proporcionalmente pior vence extension com
  menos hits absolutos.

## Out of scope

- `roles/builder.js` — já correto, não tocado.
- O piso de tráfego de estrada (`traffic.worthRepairing`) — inalterado,
  continua decidindo se uma estrada específica sequer entra no pool.

## Acceptance criteria

1. Um rampart crítico (<0.1%) é escolhido pela torre em vez de uma
   estrutura normal com dano trivial (99.9% de vida). *(smoke)*
2. Entre duas estruturas normais, a proporcionalmente mais danificada
   vence, mesmo tendo mais hits absolutos restantes que a outra. *(smoke)*
3. `node test/smoke.js "$(pwd)"` verde.
4. `npx grunt` builda sem erro.

## Constitution check

- Mesmo `room.find` único por tick, só a filtragem/ordenação interna
  mudou.
- Nenhum objeto de jogo em Memory.
- Fail-soft preservado.
- Testável offline via smoke.

## Outcome

Entregue. `findRepairTarget` usa um pool único ratio-ordenado (urgente:
normal qualquer + rampart/wall crítico) antes de cair pro pool saudável
gated por reserva. `node test/smoke.js` verde (744 assertions nesse ponto),
`npx grunt` gerou `dist/main.js` sem erro.
