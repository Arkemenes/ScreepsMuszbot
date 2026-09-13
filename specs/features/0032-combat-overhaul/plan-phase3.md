# 0032 — Combat overhaul — Plan (Fase 3: O2 + O4)

Derivado de `spec.md`. Escopo: limpeza de invader core (O2, PvE) + raid
oportunista contra `targetEnemies` fraco (O4). Fases 1–2 já entregues. O3
(assédio de remote) e O5 (squad, Fase 4) continuam fora.

## Approach

**`targetEnemies`** (novo, `utils/hostiles.js`) — mesmo formato/lugar de
`allies`/`hostilePlayers` (0012): `Memory.settings.targetEnemies`, lista
opt-in de usernames, console `addTargetEnemy`/`removeTargetEnemy`/
`listTargetEnemies`. O2 (invader core) nunca consulta essa lista — não é
um jogador. O4 só considera um jogador que esteja nela.

**Um role novo, `raider.js`**, em vez de sobrecarregar
`defenderStriker`/`defenderMedic` com um "modo ofensivo" — a dupla de
defesa já está bem cheia (D2/D3/O1) e um raider tem forma mais simples
(sem parceiro, sem tanque, sem mop-up): viaja até `Memory.raidTarget.room`
(`utils/routing`, mesmo padrão do `reserver`), luta hostil se houver
(reaproveita `combat.threats`/`shoot`/`kiteAwayFrom`), senão ataca a
primeira `FIND_HOSTILE_STRUCTURES` (o invader core, ou qualquer estrutura
inimiga) via `rangedAttack` a `KITE_RANGE` (corpo é `RANGED_ATTACK`
puro — não precisa de `ATTACK`/alcance 1, `rangedAttack` já mira
estrutura). Sem mais nada pra atacar, a missão terminou: limpa
`Memory.raidTarget` e se aposenta.

**`rooms/raiding.js`** (novo, mesmo papel do `rooms/remotes.js` mas pra
"vale a pena invadir" em vez de "vale a pena minerar"): `isWeakEnemyRoom`
pontua um alvo — sala de um `targetEnemy`, sem torre vista, sem hostil
visto, RCL abaixo de um teto (`raiding.maxTargetRcl`). Console
`raidRoom(roomName, motherRoomName?)` despacha manualmente (serve tanto
O2 - sala sem dono com invader core - quanto O4 - sala fraca de um
`targetEnemy`, mesma validação de segurança nos dois casos). Um scan
automático opcional (`raiding.autoRaid`, **default `false`** - opt-in
explícito, não liga sozinho só porque `targetEnemies` tem alguém) chama
`findWeakTarget()` a cada tick, por sala própria, e despacha se achar algo
e não houver raid em andamento.

**Intel:** `rooms/intel.js` ganha `mem.controllerLevel` (RCL de qualquer
sala vista, não só própria - hoje só existe pra sala própria via
`needs.js`) e `mem.hasInvaderCore` (deriva do mesmo `find()` que já
preenche `mem.enemyStructures` - sem chamada nova).

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/roles/raider.js` | Viaja até `Memory.raidTarget.room`; luta hostil se houver; senão ataca a primeira estrutura hostil (`FIND_HOSTILE_STRUCTURES`) a `KITE_RANGE`; sem alvo nenhum, limpa `Memory.raidTarget` e se aposenta. |
| `src/rooms/raiding.js` | `isWeakEnemyRoom(roomName)`, `findWeakTarget()`. Console `raidRoom(roomName, motherRoomName?)`. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/hostiles.js` | `targetEnemies()`, `isTargetEnemy(username)`; console `addTargetEnemy`/`removeTargetEnemy`/`listTargetEnemies`. |
| `src/rooms/intel.js` | `mem.controllerLevel`, `mem.hasInvaderCore` (do `find()` já existente de `enemyStructures`). |
| `src/rooms/needs.js` | `raider`: 1 quando `Memory.raidTarget` pendente pra essa sala e nenhum raider vivo (mesmo padrão do `claimPending`, sem o problema de morte-em-trânsito do claim - um raider que morre simplesmente **não** reserva o alvo; o scan/console decide de novo no próprio tick seguinte, então não precisa do mecanismo de `creepSeen` do 0035). |
| `src/roles/index.js` | Registra `raider`, prioridade baixa (depois de `scout`, é sempre oportunista). |
| `src/main.js` | Se `config.get("raiding.autoRaid", false)`, por sala própria: sem `Memory.raidTarget` pendente, chama `raiding.findWeakTarget()` e despacha se achar. |
| `src/utils/config.js` | `raiding.maxTargetRcl` (3), `raiding.autoRaid` (`false`). |
| `test/smoke.js` | `STRUCTURE_INVADER_CORE` no stub de constantes. Cobertura: `targetEnemies` add/remove/list; `isWeakEnemyRoom` (sala fora da lista, com torre, com hostil, RCL alto - todas recusam; sala realmente fraca aceita); `raidRoom()` recusa sala não-`targetEnemy` (exceto invader core sem dono) e sala que falha `isWeakEnemyRoom`; `raider.run()` ataca estrutura hostil quando não há creep hostil, luta creep hostil quando há, se aposenta e limpa `Memory.raidTarget` quando não sobra nada. |

## Data shapes

| Chave | Onde | Forma |
|-------|------|-------|
| `Memory.settings.targetEnemies` | `Memory.settings` | `string[]` (usernames) |
| `Memory.raidTarget` | Memory (pequeno) | `{room, from}` - 1 raid por vez no império, mesmo padrão do `claimTarget` |
| `Memory.rooms[x].controllerLevel` | `Memory.rooms[x]` | `number \| undefined` |
| `Memory.rooms[x].hasInvaderCore` | `Memory.rooms[x]` | `boolean` |
| `config.get("raiding.maxTargetRcl")` / `("raiding.autoRaid")` | `defaults`/`Memory.settings.raiding` | `number` (3) / `boolean` (`false`) |

## How it satisfies the constitution

- **CPU:** `findWeakTarget()` varre `Memory.rooms` (objeto pequeno, só
  salas já vistas) - nada de `room.find` novo; `mem.hasInvaderCore` reusa
  o `find()` que `enemyStructures` já fazia.
- **Fail-soft:** `raidRoom()` segue o padrão de validação do `claimRoom`
  (recusa com log em vez de despachar um raider fadado); `raider.run()`
  trata "sem alvo nenhum" como sucesso (missão cumprida), não como erro.
- **§6 (config sobre hardcode):** `maxTargetRcl`/`autoRaid` são
  `config.get()`.
- **§8 (spec antes do código):** política de alvo já decidida na revisão
  da spec original - este plano só implementa o que já foi aprovado.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `isWeakEnemyRoom` decide com intel desatualizada (torre construída depois da última observação) - raider morre à toa | Risco já aceito explicitamente na spec (O4 "Contras"); mitigado por `autoRaid` vir `false` por padrão - só acontece se o usuário ligar de propósito |
| Um raider preso brigando com um creep hostil que não morre nunca (ex.: reforço constante) | Fora de escopo por ora - mesma exposição que qualquer combate; sem stall guard dedicado nesta fase |
| `raidRoom()` despachado pra uma sala de invader core mas sem checar alcance de vida do corpo (raider não tem `CLAIM`, não tem o limite de 600 ticks do 0033/0034) | N/A - só o `CLAIM` tem esse teto; `raider` é um corpo comum (1500 ticks), sem esse risco |

## Rollback

Reverter os arquivos listados; `raider.js`/`rooms/raiding.js` são
arquivos novos, apagar. `Memory.raidTarget`/`Memory.settings.targetEnemies`
somem sozinhos se não escritos de novo.
