# 0076 — shared-route-dead-end-cache — Plan

Derivado de `spec.md`.

## Approach

`utils/routing.js` ganha um par de funções simétrico ao resto do módulo
(`isDangerousRoom`/etc.): `isKnownDeadEnd(roomName)` (leitura) e
`markDeadEnd(roomName)` (escrita, TTL). `retreatFrom()` — já o único lugar
que confirma um beco sem saída com certeza (ROADMAP 0063: `creep.room.name`
no momento do `ERR_NO_PATH` real, nunca um chute) — chama `markDeadEnd`
além do `_routeAvoid` por-creep de sempre. Os quatro pontos que já filtram
sala por `avoid`/`allowRoom`/hostil (`findRoute`, `computeRealRoute`,
`routeCostCallback`, `avoidCostCallback`) ganham mais uma checagem idêntica
em espírito: `if (isKnownDeadEnd(roomName)) return <excluído>;`.
`moveToRoom()` ganha o mesmo tratamento que já dava pro destino em
`_routeAvoid` — recusa outright se `isKnownDeadEnd(toRoomName)`.

Isso revive a ideia do blacklist global do ROADMAP 0058 (morto pelo 0062
por um motivo específico: adivinhar errado qual das duas salas do padrão
`[A,B,A,B]` era a armadilha de verdade). A diferença que torna seguro
reviver agora: 0058 tentava decidir a sala culpada SEM `_routeStack`
(história real de onde o creep esteve); hoje `retreatFrom()` só roda depois
que `creep.room.name` já é ground truth confirmado (0063), nunca mais um
coin-flip entre duas salas candidatas.

## Modules

### New

Nenhum módulo novo.

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | `isKnownDeadEnd`/`markDeadEnd` novos; `retreatFrom()` chama `markDeadEnd`; `findRoute`/`computeRealRoute`/`routeCostCallback`/`avoidCostCallback`/`moveToRoom` (destino) checam `isKnownDeadEnd`; `global.clearRouteDeadEnd(roomName)` novo; exports `isKnownDeadEnd`/`markDeadEnd` pro smoke. |
| `src/utils/config.js` | `routing.deadEndTicks` (default 10000). |
| `test/smoke.js` | assertions AC1-AC5. |

## Data shapes

`Memory.rooms[roomName].routeDeadEndUntil: number` — tick absoluto até o
qual a sala é tratada como beco sem saída confirmado. Ausente/expirado =
sala normal. Mesma "vizinhança" de dados que `Memory.rooms[x]` já guarda
(`exits`, `owner`, `enemies`, etc.) — nenhuma estrutura nova.

## How it satisfies the constitution

Ver "Constitution check" no `spec.md`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Marcar sala errada de novo (o bug que matou o blacklist original) | `markDeadEnd` só é chamado de dentro de `retreatFrom()`, que só dispara com `creep.room.name` como ground truth confirmado (ROADMAP 0063) — nunca um chute entre duas salas candidatas, ao contrário do mecanismo de 0058. |
| Obstrução muda (aliado abre rampart) e a sala fica marcada sem necessidade | TTL (`routing.deadEndTicks`, 10000 ticks) + `clearRouteDeadEnd()` manual. |
| `Memory.rooms[x]` crescer sem limite com marcas velhas nunca lidas | Mesma chave que já existe pra intel de sala — um número a mais, não uma lista/objeto que cresce; GC natural quando a sala some do jogo não é diferente do resto do `Memory.rooms[x]`. |

## Rollback

Reverter via `git revert`. Em produção sem revert: `clearRouteDeadEnd` zera
uma marca específica; para desligar o mecanismo inteiro sem tocar código,
não há flag dedicada — precisa do revert (decisão deliberada: é pouco
código, um flag extra seria complexidade sem uso real esperado).
