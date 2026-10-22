# 0185 — Plan

## Módulos

- **Novo** `src/rooms/noStorageEconomy.js`: `applies(room)`, `observe(room, mem, pressure, surplus, baseUpgraders)` → `{ hauler, upgraderExtra }`, `isExcessHauler(creep, wanted)`, `recycle(creep)`.
- `src/rooms/needs.js` (`compute`): calcula as amostras `pressure`/`surplus` com os containers de fonte já levantados; quando `applies`, o tier de hauler vira `min(noStorage.hauler, containers + 1)` e o upgrader base recebe `upgraderExtra`. Pisos posteriores (mineral, pressured output, autoscale, override, on-demand) seguem aplicados depois.
- `src/roles/hauler.js`: no ramo ocioso (nada a carregar, nenhum job mineral) pergunta `isExcessHauler`; marca `memory.recycle` e vai ao spawn. No topo de `run`, `memory.recycle` continua a viagem.
- `src/utils/config.js`: bloco `noStorageEconomy`.

## Dados

`Memory.rooms[name].noStorageEco = { p, s, h, up, upTick }` — EMAs arredondadas a 3 casas, contadores inteiros e o tick da última mudança de upgrader.

## Riscos

- Sinais instantâneos oscilam (um spawn esvazia extensions): mitigado por EMA + histerese + cooldown.
- Hauler único demorando a reabastecer spawn: pressure sobe e traz o segundo de volta.
- Upgraders a mais quando a sobra some: excedente vira builder (comportamento existente de `isExcessUpgrader`).
