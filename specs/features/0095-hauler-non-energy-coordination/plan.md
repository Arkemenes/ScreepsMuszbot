# 0095 — Coordenação de jobs não energéticos do hauler — Plan

## Approach

Criar `utils/nonEnergyLogistics.js` como fonte compartilhada para pressão dos
três outputs e eleição de um único hauler por sala. A pressão será derivada de
`roomCache`, `Memory.rooms` e stores ao vivo, cacheada por sala/tick. A eleição
será um ledger mutável no heap: na primeira leitura da sala em cada tick ele é
semeado a partir dos `hauler` com `memory.mineralJob`; claims posteriores no
mesmo tick atualizam o ledger, independentemente da ordem de execução.

`roles/hauler.js` continuará dono dos candidatos e intents. O fluxo calculará
`pickLoad()` uma vez para distinguir energia acionável: sem fonte, o owner pode
fazer qualquer job não energético; com fonte, somente um output pressionado e
ao menos dois haulers permite o override. Job vazio pode ser substituído;
qualquer carga já retirada compromete a entrega. `rooms/needs.js` reutilizará a
pressão compartilhada para o piso 2 com histerese pela população atual.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/nonEnergyLogistics.js` | Classificar pressão de mineral/lab/factory e eleger um owner por sala/tick. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/config.js` | Defaults de pressão, histerese e fallback perto da morte. |
| `src/utils/reservations.js` | Remover imediatamente do ledger um claim de energia liberado no mesmo tick. |
| `src/roles/hauler.js` | Separar energia acionável de demanda, coordenar/preemptar jobs e preservar carga. |
| `src/rooms/needs.js` | Aplicar piso temporário de dois haulers por pressão com histerese. |
| `test/smoke.js` | Cobrir AC1–AC10 e regressões dos fluxos existentes. |
| `specs/ARCHITECTURE.md` | Documentar a política implementada e o helper novo. |
| `specs/ROADMAP.md` | Atualizar status e outcome da feature. |

## Data shapes

- Heap `pressureCache[roomName] = Array<{kind, resourceType, ratio, sourceId}>`,
  reiniciado quando `Game.time` muda; nenhum objeto de jogo persiste.
- Heap `ownerByRoom[roomName] = creepName | null`, semeado de
  `census.creepsByRole(roomName, "hauler")` e mutável durante o tick.
- `creep.memory.mineralJob` preserva `{resourceType, fromId, toId}` e ganha
  `kind` para prioridade/preempção. Entradas antigas sem `kind` continuam
  executáveis.
- Config: `mineralHauler.pressureHigh`, `.pressureLow` e `.deathDropTtl`.

## How it satisfies the constitution

- **CPU:** pressão é calculada uma vez por sala/tick; eleição reutiliza census;
  nenhum novo `room.find` por creep.
- **Memory:** somente strings/ids no formato pequeno já existente; caches e
  objetos derivados ficam no heap.
- **Fail-soft:** job/destino inválido cai para reseleção, fallback ou espera.
- **Offline test:** o smoke stubará dois haulers, stores em 49%/50%/75%, fonte
  de energia acionável e destinos cheios/destruídos.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| dois creeps reivindicarem no mesmo tick | ledger heap mutável semeado antes da primeira claim. |
| pressão cacheada ficar obsoleta após intent | cache vale só no tick; intents só alteram stores após o tick no motor. |
| job legado sem `kind` ficar preso | aceitar o shape antigo e inferir prioridade apenas quando possível. |
| segundo hauler oscilar a cada tick | histerese 75%/50% usando população atual como latch. |
| carga morrer sem destino | esperar normalmente; perto da morte, dropar junto ao storage/terminal. |

## Rollback

Remover o helper e restaurar o gate por `criticalConsumers`; apagar os três
defaults novos. Nenhuma migração de Memory é necessária: `kind` é opcional e
jobs existentes mantêm o shape anterior.