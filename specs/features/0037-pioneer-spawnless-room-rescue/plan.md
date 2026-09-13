# 0037 — Pioneer: rescue a spawnless owned room — Plan

Derivado de `spec.md`.

## Approach

Mesma forma dos outros pares "módulo de sala decide elegibilidade + role
fino que só executa" já usados no projeto (`rooms/remotes.js`+`remoteMiner`/
`remoteHauler`; `rooms/raiding.js`+`raider`). `rooms/pioneering.js` (novo)
é a única porta pra "qual sala precisa de resgate e quem ajuda" —
`roles/pioneer.js` não sabe nada de `Game.myRooms`/distância, só chama
`pioneering.wantedFor`/`nextTarget` e executa viagem+carga+build via
primitivos já existentes (`utils/routing.moveToRoom`, `utils/energy`,
`utils/reservations`, `utils/population.scaledBody`).

A única peça de comportamento genuinamente nova é `roles/pioneer.js`'s
próprio loop (carregar → viajar → construir → viagem redonda se esvaziar
→ aposentar quando o spawn existe); tudo o mais é composição do que já
existe. `utils/energy.js` ganha `energyPiles(room)` extraído do
`builder.js` (que hoje tem a mesma lógica inline, só que tomando `creep`
em vez de `room` — generalização trivial) pra não duplicar entre os dois
roles (constitution §5).

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/rooms/pioneering.js` | `isSpawnless(room)`, `spawnlessRooms()`, `candidateMothers()`, `motherRoomFor(targetRoomName)`, `pioneersWanted(motherRoom)`, `nextTarget(motherRoom)`. Única porta pra elegibilidade — mesmo papel de `remotes.js`/`raiding.js` pros próprios domínios. |
| `src/roles/pioneer.js` | O loop: carrega na sala-mãe → viaja (`routing.moveToRoom`) → constrói o site do spawn na sala-alvo → viagem redonda se esvaziar antes do spawn terminar → aposenta quando o spawn existe de verdade. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/energy.js` | `energyPiles(room)` (extraído de `roles/builder.js`, generalizado de `creep` pra `room`). |
| `src/roles/builder.js` | usa `energy.energyPiles(creep.room)` em vez da cópia local — remove a duplicata. |
| `src/utils/config.js` | `pioneer.maxDistance` (10), `pioneer.maxConcurrent` (2). |
| `src/rooms/needs.js` | `compute(room)` ganha `pioneer: pioneering.pioneersWanted(room)` — zerado quando `mem.defenseActive` (mesma cautela de `reserver`/`raider` já existentes ali). |
| `src/roles/index.js` | registra `pioneer`, entre `hauler` e `upgrader` — depois da sobrevivência básica da própria sala-mãe (bootstrap/defender/miner/hauler), antes das melhorias (upgrader/builder/scout). |
| `src/rooms/spawning.js` | nenhuma mudança de código — `pioneer` entra na fila genérica automaticamente por já estar em `roles/index.js`, não é luxo tipo scout/raider/squadDismantler (não precisa de exceção no loop). |

## Data shapes

- **`creep.memory`** (pioneer): `{ role: "pioneer", targetRoom, home }` —
  sem estado novo em Memory além disso; nenhuma atribuição persistida
  (`motherRoomFor`/`nextTarget` recalculam do zero por tick, mesmo
  princípio de `raiding.findWeakTarget()` — barato, sem risco de ficar
  desatualizado).
- **`config.get("pioneer.maxDistance", 10)`** / **`config.get("pioneer.maxConcurrent", 2)`**
  — sob `Memory.settings`, mesmo padrão de todo outro tunable.

## How it satisfies the constitution

- **CPU:** `pioneering.js` não adiciona `room.find` novo (`roomCache`
  cobre a contagem de spawn); `remotes.roomDistance` já cacheia
  `Game.map.findRoute` por tick.
- **Memory:** nada persistido além dos 2 campos de `creep.memory` que
  todo role cross-room já usa (`targetRoom`/`home`, mesmo padrão de
  `remoteMiner`/`raider`).
- **Fail-soft:** roda dentro do `guard()` por-creep do `main.js` como
  todo role; sem spawn na sala-alvo ainda não plantado pelo `architect.js`,
  o pioneer só espera perto do centro em vez de lançar.
- **Offline test:** determinístico — contagem de `STRUCTURE_SPAWN` via
  fixture, `roomDistance` mockável (`Game.map.findRoute`), energia
  carregada/gasta, `census.all("pioneer")` pra concorrência.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Sala-mãe esvazia a própria fila de spawn ajudando outra pra sempre | `pioneer.maxConcurrent` por sala-alvo; prioridade na fila fica depois de bootstrap/defender/miner/hauler (`roles/index.js`); zerado sob ataque |
| Pioneer desarmado morre numa sala-alvo com hostil | `pioneersWanted`/`nextTarget` recusam sala-alvo com `mem.enemies > 0` |
| `architect.js` ainda não colocou o site do spawn quando o pioneer chega | espera perto do centro da sala em vez de lançar/vagar |
| Duas salas sem spawn perto uma da outra competem pela mesma sala-mãe | `motherRoomFor` é determinístico (mais próxima com spawn) — a demanda das duas só soma no `pioneersWanted` daquela mãe, sem heurística extra (fora de escopo, ver spec.md) |

## Rollback

Sem flag dedicada — `pioneer` é só mais uma entrada em `roles/index.js`;
removê-la (ou zerar `pioneer.maxConcurrent` via `Memory.settings`) desliga
o resgate automático inteiro sem tocar em mais nada. Sem role nenhum
existente reaproveitando `pioneer.js`, então não há risco de regressão em
outro lugar além do `builder.js`/`energy.js` (refactor mecânico, coberto
pelo smoke já existente do `builder`).
