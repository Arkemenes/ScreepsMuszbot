# 0036 — Automatic safe mode (D6) + remote harassment (O3) — Plan

Derivado de `spec.md`.

## Approach

Dois pedaços independentes, sem dependência um do outro — implementados
juntos só porque ambos eram os itens represados do cardápio de `0032` e o
usuário pediu os dois na mesma mensagem.

**D6:** um módulo novo e pequeno, `rooms/defense.js`, com uma função
`checkSafeMode(room)` chamada do `main.js` no loop de `Game.myRooms`
(mesmo padrão de `roomLogic.spawning`/`planCity`). Sem estado novo em
Memory — cada tick decide do zero a partir de `combat.threats` + census +
`room.controller.safeMode`/`activateSafeMode()`.

**O3:** reaproveita `roles/raider.js` (já existe, já sabe viajar/lutar) com
um `memory.mission` novo (`"harass"` vs. o `"raid"` implícito de hoje).
`rooms/raiding.js` ganha `isEnemyRemote`/`raidRemote()`, espelhando o
padrão já existente de `isWeakEnemyRoom`/`raidRoom()`. O gap de detecção em
`utils/hostiles.js` é corrigido primeiro (é pré-requisito real — sem ele,
`mem.enemies` de uma sala-remote de um `targetEnemy` nunca reflete um
guarda que esse jogador tenha posto lá, e o gate de O3 ficaria cego).

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/rooms/defense.js` | `checkSafeMode(room)` — gatilho conservador de safe mode automático (D6). Só isso; não é um "sistema de defesa" novo, os roles de combate continuam onde estão. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/hostiles.js` | `isHostile()` fora de sala própria também conta `isTargetEnemy(username)` como hostil (corrige o gap que afeta O3 **e** retroativamente O4). |
| `src/utils/config.js` | `combat.safeModeSpawnHpRatio` (default 0.5). |
| `src/rooms/raiding.js` | `isEnemyRemote(roomName)`, `remoteRefusalReason(roomName)`, console `raidRemote(roomName, motherRoomName?)`. Exporta `isEnemyRemote` (pro smoke). |
| `src/roles/raider.js` | `spawnData()` carrega `mission` de `Memory.raidTarget.mission` (default `"raid"`); `run()` ganha o branch `mission==="harass"` (ataca `FIND_HOSTILE_CREEPS` sem filtro de armamento, nunca ataca estrutura, retira sem hostil algum no momento). |
| `src/main.js` | `guard("defense:" + r.name, () => roomLogic.checkSafeMode(r))` no loop de `Game.myRooms`, depois do spawn (ordem não importa muito, mas depois de `spawning` deixa o log de safe mode perto do log de under-attack que já existe). |
| `src/rooms/index.js` | registra `checkSafeMode: require("./defense")`. |

## Data shapes

- **`Memory.raidTarget.mission`** — `"raid"` (default, comportamento
  existente inalterado) ou `"harass"` (O3). Só mais um campo no objeto que
  já existe, não uma estrutura nova.
- **Sem Memory novo pro D6** — `room.controller.safeMode`/
  `safeModeAvailable`/`safeModeCooldown` já são expostos pelo próprio
  `RoomController` pelo motor do jogo; nada pra persistir.
- **`config.get("combat.safeModeSpawnHpRatio", 0.5)`** — sob
  `Memory.settings`, mesmo padrão de todo outro limiar de combate.

## How it satisfies the constitution

- **CPU:** `checkSafeMode` é O(spawns × threats) por sala própria, já
  pequeno; `raidRemote`'s find de hostil roda só nos raiders em missão
  harass (tipicamente 0 ou 1 por vez).
- **Memory:** nada novo além de um campo (`mission`) num objeto que já
  existe.
- **Fail-soft:** `activateSafeMode()` chamado dentro do `guard()` do
  `main.js` como tudo mais; resultado != OK só loga, não lança.
- **Offline test:** tudo determinístico — hp ratio de spawn, contagem de
  `defender`/`defenderStriker` via census, presença em `combat.threats`
  (mockável), `Memory.rooms[x].reservation`/`owner`/`enemies` pro
  `isEnemyRemote`. `activateSafeMode()` do harness precisa devolver `OK`
  por padrão e ser sobrescrevível por teste pra simular erro (cooldown).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Gatilho de safe mode dispara cedo demais (desperdiça a carga limitada) | Gate duplo (hostil a alcance **e** hp baixo **ou** zero defenders) já decidido conservador na revisão de 0032; limiar em `config.get` pra ajustar sem redeploy |
| Corrigir `isHostile()` muda comportamento em outro lugar que dependia do gap | Mudança é estritamente aditiva (só adiciona um critério de hostilidade a mais fora de sala própria); toda política de "quando atacar" continua isolada em `raiding.js` — isso só corrige "isso é hostil?", não "devo atacar isso?" |
| `raidRemote` mira sala que na verdade tem um jogador não-hostil reservando (ex.: engano de digitação do `targetEnemy`) | `remoteRefusalReason` exige `isTargetEnemy` explícito na lista opt-in — mesma barreira de confiança que O2/O4 já usam |

## Rollback

Sem flag dedicada — `checkSafeMode` é só uma função pura chamada do
`main.js`; remover a linha do `guard()` desliga o D6 inteiro sem tocar em
mais nada. `raidRemote()` é opt-in por natureza (comando manual de
console) — nunca dispara sozinho.
