# 0013 — Stamp scoring fix

- **Status:** done
- **Analysis refs:** M5

## Problem

No `findStampLocation` do `architect.js`, o score de posicionamento acumula:

```js
value += floodFillMatrix.get(coordX, coordY);   // ORIGEM do stamp, toda célula
```

Ele soma a profundidade do flood-fill na **origem** do stamp uma vez por célula
do stamp, então `value ≈ depth(origin) × cellCount` — na prática só a
profundidade da origem. A intenção era claramente somar a profundidade de
**cada** tile coberto, premiando placements que ficam fundo dentro da base. Do
jeito que está, o tie-breaker de `value` mal discrimina, então os stamps caem
quase aleatoriamente entre os candidatos com `adjacentRoads` igual.

## Desired outcome

`value` soma `floodFillMatrix.get(tx, ty)` sobre as células não-espaço do
stamp, para que placements mais fundos (mais interiores, mais protegidos)
pontuem mais alto. Stamps se agrupam em direção ao interior da base em vez de
espalhar.

## In scope

- Mudar a única linha de acumulação para usar `tx, ty` (locais já computados).
- Re-ajustar a combinação de score se preciso (hoje prioriza `adjacentRoads`
  estritamente, depois `value`, depois `storageDistance`).

## Out of scope

- A métrica `** (1/16)` de `storageDistance` (uma esquisitice separada —
  sinalizar mas não mexer).
- O conjunto de stamps ou os passos do planejador.

## Acceptance criteria

1. `value` para um placement difere de `depth(origin) × cellCount` sempre que
   os tiles cobertos tenham profundidade não-uniforme.
2. Dadas duas posições candidatas iguais no resto, a que tem células em média
   mais fundas no flood fill é escolhida. *(smoke: matriz de flood sintética,
   assertar que a origem mais funda vence)*
3. Um run completo do planejador ainda completa e produz um plano plausível
   (assertions existentes do smoke verdes; contagem total de buildings dentro
   de ±10% da de hoje).

## Constitution check

- Determinístico; coberto por uma assertion de smoke direcionada.
- Sem impacto de CPU / Memory (mesmo loop, mesma contagem de ops).

## Risk

Muda onde cada stamp cai → pode regredir um layout ajustado a olho. Mitigação:
entregar cedo (antes de salas reais serem construídas com os novos planos), e
conferir um `replanRoom` in-game antes de dar como done.

## Outcome

Entregue. `value` agora soma `floodFillMatrix.get(tx, ty)` (o tile de cada
célula não-espaço do stamp) em vez de `floodFillMatrix.get(coordX, coordY)`
(a origem, repetida por célula). `findStampLocation` exportado do módulo só
para o smoke testar diretamente com uma matriz de flood sintética. Validado
por uma assertion dedicada (duas posições com a mesma profundidade de origem,
a com células vizinhas mais fundas vence) + as assertions de plano completo
existentes continuam verdes.

**Bugs relacionados encontrados ao validar in-game (`replanRoom`)**, todos na
mesma família — "torres e links mudam de lugar a cada replan":

1. `getContainerLocations` recalculava do zero "o melhor tile por
   flood-fill" pra cada source a cada replan, sem olhar se já existia um
   container **construído** ali — como `replanRoom` não demole estruturas,
   um flood-fill levemente diferente podia escolher outro tile e a source
   acabava com 2 containers. Estendido pra **link e torre também**
   (`existingBuiltNear`, e `unclaimedBuiltTowers` pras torres de
   perímetro do passo 12) — todos reaproveitam a estrutura já construída em
   range 1, só recalculando quando não existe nenhuma. `existingBuiltNear`/
   `unclaimedBuiltTowers` também olham `FIND_MY_CONSTRUCTION_SITES` — um
   canteiro **ainda não construído** de uma rodada anterior conta como
   "já posicionado" do mesmo jeito, então o replan não fica gerando um
   segundo canteiro do lado do primeiro. Não limpa duplicatas já
   existentes (isso é manual, via console).
2. `room.find(FIND_SOURCES)`/`find(FIND_MINERALS)` não garantem a mesma
   ordem entre ticks no Screeps real — e a ordem decidia qual source virava
   "índice 0" (RCL mais baixo de torre/link). Corrigido: ambos ordenados
   canonicamente por posição (`byPosition`) antes de processar.
3. **A causa raiz de verdade**: o mapa id→sala do `planStore` (0007) morava
   em `Memory.settings.planSegments`. Um `Memory.settings = {...}` no
   console (o padrão que o próprio comentário do `main.js` sugere pro
   profiler) substitui `Memory.settings` inteiro, apagando esse mapa —
   `RawMemory.segments` continua com o conteúdo antigo, e a próxima sala a
   pedir um id podia cair num slot já ocupado e herdar em silêncio o plano
   de outra sala/rodada. Corrigido em `planStore.js`: o mapa foi pra
   `Memory.planSegments` (fora de `Memory.settings`) e cada segment agora é
   marcado com o nome da sala — `getPlan` recusa um segment cuja marca não
   bate. Detalhe completo no Outcome da [0007](../0007-plan-storage-segments/spec.md).
