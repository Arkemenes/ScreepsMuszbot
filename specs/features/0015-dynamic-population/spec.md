# 0015 — Dynamic population

- **Status:** done
- **Depends on:** 0014

## Problem

Cada `wanted(room)` é constante ou heurística solta, espalhada:
`builder` fixo em 2, `upgrader` 0/1, `hauler` `min(4, containers+1)`, etc. Não
reagem à demanda real (backlog de construção, excedente de energia, tamanho da
sala).

## Desired outcome

Um único `roomNeeds(room)` calcula a contagem-alvo de **todos** os roles a
partir do estado da sala (RCL, sources, containers, link network, storage,
backlog de canteiros, hostis). Cada role lê a sua fatia. A fila de spawn e
`idealPopulation` consomem a mesma fonte. Cacheado por tick por sala.

## In scope

- Novo `src/rooms/needs.js` → `roomNeeds(room)` retornando
  `{ miner, hauler, bootstrap, upgrader, builder, defender, scout }`.
- Fórmulas iniciais:
  - **miner** = nº de sources (timing fino continua em `miner.spawn`)
  - **hauler** = 0 pré-container · `1 + (containers de source sem link coletor)`
    com link network · `min(5, containers+1)` senão
  - **bootstrap** = 0 se `miner>0 && (hauler>0 || linkNet)`, senão 1
  - **upgrader** = 0 se não é dono · a RCL 8 `ticksToDowngrade<1e5 ? 1 : 0` ·
    senão escala com energia no storage (>400k→4, >150k→2, senão 1)
  - **builder** = `min(byBacklog, byEnergy)`. `byBacklog` escala com
    `Σ(progressTotal - progress)` dos canteiros (>20k→4, >5k→3, algum→2, senão
    1). `byEnergy` limita pela energia que o builder pode pegar
    (storage + drops + tombstones + ruínas + containers + links receptores):
    >50k→4, >8k→3, >1.5k→2, >200→1, senão **0**. Teto 1 abaixo de RCL 2
  - **defender** = `hostiles>0 ? min(3, hostiles+1) : 0`
  - **scout** = `rcl>=3 && !hostiles ? 1 : 0`
- Cada `role.wanted(room)` → `roomNeeds(room)[role]`.
- `role.spawn(room)` uniforme → `census.count(name, role, 0) < wanted` (+ guard
  de `energyAvailable` onde já existe). `miner.spawn` mantém a lógica por source.
- `utils/population.js` `idealPopulation` → soma de `roomNeeds` dos
  `ECONOMY_ROLES`; remove o `require("../roles")` lazy.

## Out of scope

- Modelo de energia income/demand de verdade (Σ WORK × uptime, round-trip). As
  fórmulas iniciais são degraus, não cálculo contínuo — refinar depois.
- Priorização da fila de spawn (a ordem de `roles/index.js` continua).
- Config das fórmulas via `Memory.settings` — isso é 0012.

## Acceptance criteria

1. `roomNeeds(room)` retorna um objeto com uma entrada por role; é o mesmo
   objeto (cacheado) em chamadas repetidas no mesmo tick. *(smoke asserta)*
2. `builder` desejado sobe com backlog de canteiro e volta a 1 sem canteiros.
   *(smoke: injeta canteiros, asserta a contagem)*
3. `upgrader` desejado escala com energia no storage. *(smoke asserta 2
   níveis)*
4. Todo `role.wanted(room)` retorna `roomNeeds(room)[role]`.
5. `idealPopulation` não faz mais `require("../roles")`.
6. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§6:** um lugar só decide a população.
- **§1:** `roomNeeds` é cacheado por tick; uma passada sobre census/roomCache.
- **§3:** `roomNeeds` nunca lança — sala sem controller / sem storage → ramos
  com default.
- **§5:** estratégia de sala fica em `rooms/`, não espalhada nos roles.

## Outcome

Entregue. Novo `src/rooms/needs.js` com `roomNeeds(room)` cacheado por tick.
Todo `role.wanted` → `roomNeeds(room)[role]`; `defender`, `bootstrap`, `scout`
ganharam `wanted`. `spawn()` uniforme (`census.count < wanted` + guard de
`energyAvailable` onde já existia); `miner.spawn` mantém a lógica por source.
`utils/population.js` `idealPopulation` soma `roomNeeds` e não faz mais
`require("../roles")`. Validado pelo smoke (builder escala com backlog,
upgrader com storage, bootstrap 0/1).
