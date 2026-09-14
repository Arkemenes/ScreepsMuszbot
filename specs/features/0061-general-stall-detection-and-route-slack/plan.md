# 0061 — Plan

Derivado de `spec.md`.

## Approach

Duas mudanças independentes no mesmo módulo (`utils/routing.js`), cada
uma isolada o suficiente pra testar/reverter em separado:

1. **Generalizar o detector de stall.** `isStuckAtBorder` vira `isStuck`
   (perde a checagem `!onBorder → return false`, ganha o guard de
   `fatigue`). `isOnBorder` é extraído da checagem de borda que existia
   dentro dela. Os dois call sites (`moveToRoom`, `roles/scout.js`) somam
   uma checagem explícita de `isOnBorder` pra decidir qual blacklist
   aplicar (vizinho vs. sala atual) — a reação de borda não muda, só passa
   a coexistir com um `else` pro caso novo (travado no meio).
2. **Dar folga ao `routeCostCallback`.** Depois de montar o `allowed` de
   hoje (atual + destino + hops do `route`), mais uma passada só sobre os
   hops do `route` somando `Memory.rooms[hop].exits` (quando existir),
   filtrando hostil (se `blockHostiles`) e blacklist. Isso muda a
   assinatura de `routeCostCallback` (ganha `opts`), então o único
   call site (`moveToRoom`) atualiza a chamada.

Nenhuma das duas mexe em `isRouteFlapping`/`isFlapping` (trilha por nome
de sala) — ficam como estão, cobrindo o padrão de sair-e-voltar que
continua não sendo o mesmo problema.

## Modules

### New

Nenhum módulo novo — tudo em módulos já existentes.

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | `isStuckAtBorder` → `isStuck` (sem restrição de borda, guard de `fatigue`); novo `isOnBorder`; `moveToRoom()` usa os dois e blacklista sala atual + descarta `_move` no caso "travado, não é borda"; `routeCostCallback(route, currentRoomName, toRoomName, opts)` soma vizinhos de `exits` como slack |
| `src/roles/scout.js` | Exploração livre troca `routing.isStuckAtBorder(creep, "_exploreBorder")` por `routing.isStuck(creep, "_exploreStuck")` + `routing.isOnBorder(creep)`; mesmo `else` pro caso "travado, não é borda" (blacklista `targetRoom`, limpa `_roomTrail`, descarta `_move`) |
| `src/utils/config.js` | Novo `routing.stuckTicks` (default 4) |
| `test/smoke.js` | Renomeia/generaliza as assertions de `isStuckAtBorder` do 0060 pra `isStuck`/`isOnBorder`; novas assertions pro caso "travado no meio" e pro slack do `routeCostCallback` |
| `specs/ARCHITECTURE.md` | Parágrafo novo descrevendo o detector unificado + slack de rota |

## Data shapes

- `Memory.creeps[x]._routeStuckPos` / `_routeStuckTicks` (renomeado de
  `_routeBorderPos`/`_routeBorderTicks` — mesmo formato, `"x:y:room"` +
  contador) — usado por `moveToRoom()`.
- `Memory.creeps[x]._exploreStuckPos` / `_exploreStuckTicks` (renomeado de
  `_exploreBorderPos`/`_exploreBorderTicks`) — usado pela exploração livre
  do scout.
- `Memory.settings.routing.stuckTicks` (número, default 4) — via
  `config.get`, mesmo padrão dos outros tunables do módulo.
- Nenhum campo novo em `Memory.rooms[x]` — a folga do `routeCostCallback`
  só **lê** `exits`, já escrito por scout/observer.

## How it satisfies the constitution

- **CPU:** o detector de stall é a mesma contabilidade de tick/posição de
  antes, só sem o `if (!onBorder) return false` inicial — mesmo custo por
  chamada. O slack do `routeCostCallback` é leitura de `Memory.rooms`
  já cacheado (sem `room.find`, sem `PathFinder.search` novo); o
  `delete creep.memory._move` só roda no tick em que o stall já foi
  confirmado (reativo), e o `creep.moveTo()` daquele tick ia rodar de
  qualquer jeito — só evita reusar um path morto por mais `reusePath`
  ticks.
- **Memory:** dois campos por creep, renomeados (não somados) — mesma
  pegada de antes.
- **Fail-soft:** sem intel de `exits`, `routeCostCallback` se comporta
  como hoje (sem slack). Sem stall, `isStuck` nunca marca nada, igual
  antes.
- **Offline test:** `test/smoke.js` stuba `creep.fatigue`, `creep.pos`,
  `Memory.rooms[x].exits` e `remotes.hasHostiles` pra cobrir os 8
  critérios de aceitação da spec.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `isStuck` sem filtro de borda pode disparar em congestionamento normal de tráfego (`excuseMe.js`) num corredor estreito, blacklistando uma sala boa | `routing.stuckTicks` configurável (default 4, igual ordem de grandeza do threshold de borda anterior); só chamado durante trânsito ativo (`moveToRoom`/exploração), nunca por um role parado de propósito |
| Slack do `routeCostCallback` deixa o `PathFinder` considerar uma sala que `findRoute` deliberadamente evitou por custo (mas não por `blockHostiles`) | Slack só adiciona vizinhos **sem hostil conhecido** quando `blockHostiles` está ativo; sem `blockHostiles`, o pior caso é o `PathFinder` escolher um caminho num vizinho um pouco mais caro — nunca um hostil bloqueado |
| Renomear `isStuckAtBorder`/campos de memory quebra o smoke test existente do 0060 | Mesmo commit atualiza `test/smoke.js` — sem versão intermediária quebrada |

## Rollback

Reverter o commit — `isStuckAtBorder`/`routeCostCallback` antigos voltam
exatamente como estavam (0058/0060 continuam válidos e testados
independentemente disso). Nenhuma migração de dado: os campos de memory
renomeados são recriados do zero por creep na próxima vez que
`moveToRoom()`/exploração rodar; o campo antigo (`_routeBorderPos` etc.)
só fica órfão até o creep morrer.
