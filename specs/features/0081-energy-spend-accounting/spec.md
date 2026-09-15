# 0081 — Energy spend accounting

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

A economia de energia das salas flutua bastante e às vezes fica seca, mas o
bot não tem nenhuma visibilidade de **pra onde** a energia está indo — spawn,
construção, reparo (normal/rampart/wall), upgrade, torre. `Memory.stats.rooms`
já expõe estoque (`storageEnergy`/`terminalEnergy`/`energyAvailable`) mas
nenhum breakdown de gasto por categoria, então não dá pra achar gaps/
oportunidades de gestão de energia olhando só pro Grafana — só o saldo,
nunca a causa de um saldo caindo.

## Desired outcome

Cada sala própria reporta em `Memory.stats.rooms[name].energySpent` quanto
foi gasto **nos últimos `energyLedger.windowTicks` ticks** (default 60 — "últimos
60 segundos", a aproximação de 1 tick ≈ 1 segundo já usada informalmente em
outros lugares do código; não há sinal de relógio real disponível) em cada
categoria (`spawn`, `renew`, `build`, `repairNormal`, `repairRampart`,
`repairWall`, `upgrade`, `towerAttack`, `towerHeal`, `towerRepair`), sempre as
10 chaves presentes (default `0`). Isso já é observável no Grafana no próximo
dashboard, e no smoke test via `Memory.stats.rooms[x].energySpent`.

**Follow-up (mesmo dia, usuário pediu):** a métrica original só refletia o
gasto **do tick corrente** — uma amostra do Grafana lida uma vez a cada
alguns ticks podia perder gasto inteiro que aconteceu entre leituras.
`energyLedger.snapshot()` passou a somar uma janela deslizante de
`energyLedger.windowTicks` ticks (default 60), não mais só o tick atual.

**Bug real (mesmo dia, usuário reportou em produção):** "vendo torres
reparando, creeps construindo, spawns spawnando, mas os valores estão
sempre retornando 0". Causa raiz: a medição original comparava
`store[RESOURCE_ENERGY]` antes/depois do intent (`build`/`repair`/
`upgradeController`) dentro do mesmo statement — funciona nos mocks do
smoke test (que mutam o `store` na hora, por conveniência), mas nunca no
motor real: todo intent de creep é só enfileirado durante a execução do
script e só é aplicado pelo servidor depois que **todos** os jogadores
terminam a tick — `creep.store` lido logo após chamar `build()` ainda
reflete o valor de **antes** da ação, então a diferença é sempre 0.
Corrigido: `utils/energyLedger.js` passa a **estimar** o gasto (WORK parts
vivas × `BUILD_POWER`/`REPAIR_POWER`/`UPGRADE_CONTROLLER_POWER`, boost lido
ao vivo de `BOOSTS[WORK][part.boost]` — nunca hardcoded, mesmo princípio de
`utils/combat.js`'s `incomingDps` — limitado pela energia que o creep tinha
antes de agir e pelo trabalho restante do alvo), em vez de diff. Torre usa
`TOWER_ENERGY_COST` (custo fixo por ação) e `renewCreep` usa a fórmula
nativa (`bodyCost/2.5/tamanho`) — nenhum dos dois depende de observar o
`store` depois.

## In scope

- Um módulo novo, `utils/energyLedger.js`, que acumula gasto por sala/tick no
  heap e o expõe via `snapshot(roomName)`.
- Instrumentar todo intent que gasta energia de creep/torre/spawn dentro da
  própria sala: `build`/`repair`/`upgradeController` (via
  `prototypes/creep.js` e os pontos que chamam essas ações fora da state
  machine em `roles/builder.js`/`roles/pioneer.js`), `attack`/
  `rangedMassAttack`/`heal`/`repair` de torre, `spawnCreep`/`renewCreep`.
- Medição por diff de `store[RESOURCE_ENERGY]` ao redor de cada intent (não
  fórmula por WORK part) — mede o gasto real da ação, cobre boost sem ler
  `BOOSTS`. Exceção: `spawnCreep` usa `bodyCost(body)` (já existe em
  `rooms/spawning.js`), porque o custo sai de spawn+extensions juntos, não só
  do store do spawn.
- `utils/stats.js`'s `exportStats()` grava o snapshot em
  `Memory.stats.rooms[name].energySpent`, mesmo bloco que já seta
  `minerals`/`avgBarrierHits`.

## Out of scope

- Waste/decay (drop/tombstone expirando sem coleta, perda de `link.transfer`)
  — mais caro de medir certo (precisa comparar estado tick a tick); vira
  follow-up se o breakdown de destino não explicar sozinho os gaps.
- Gasto de `roles/remoteMiner.js` (build/repair de container numa sala
  remota, não-própria) — auto-financiado pelo harvest local daquela sala,
  nunca sai do estoque da sala-mãe, e a sala remota nem aparece em
  `Memory.stats.rooms` (só salas `my`).
- Qualquer mudança de comportamento de gasto (a feature só mede, não decide
  onde gastar).

## Acceptance criteria

1. `energyLedger.record(roomName, category, amount)` acumula múltiplas
   chamadas no mesmo tick/sala; chamadas com `amount<=0` são ignoradas.
2. `energyLedger.snapshot(roomName)` isola por sala — gravar numa sala nunca
   aparece no snapshot de outra.
3. `energyLedger.snapshot(roomName)` sempre devolve as 10 categorias
   (`spawn`, `renew`, `build`, `repairNormal`, `repairRampart`, `repairWall`,
   `upgrade`, `towerAttack`, `towerHeal`, `towerRepair`), com `0` nas que não
   tiveram `record()` na janela.
4. Gasto de um tick anterior continua contando enquanto estiver dentro da
   janela (`energyLedger.windowTicks`, default 60, override via
   `Memory.settings.energyLedger.windowTicks`); some da soma só quando
   envelhece além dela.
5. `energyLedger.recordRepair(roomName, structureType, amount)` mapeia
   `STRUCTURE_RAMPART`→`repairRampart`, `STRUCTURE_WALL`→`repairWall`,
   qualquer outro tipo→`repairNormal`.
6. Um cenário roteirizado de build + repair de rampart + upgrade + repair de
   torre + spawn produz, depois de `exportStats()`,
   `Memory.stats.rooms[x].energySpent` com os valores esperados em cada
   categoria correspondente.
7. `creep.build()`/`creep.repair()`/`creep.upgradeController()` que falham
   (não `OK`) não gravam nada no ledger.
8. A estimativa de gasto de creep (build/repair/upgrade) nunca depende de
   ler `store`/`progress`/`hits` **depois** do intent — só valores disponíveis
   antes de chamar `build`/`repair`/`upgradeController`, porque o motor real
   só aplica o intent após todos os scripts da tick terminarem.
9. Um WORK part boostado credita mais que um não-boostado, multiplicado
   pelo fator lido de `BOOSTS[WORK][part.boost]` (nunca hardcoded).

## Constitution check

- **CPU (§1):** nenhum `room.find`/varredura nova; só diffs de `store` já
  lido pelos call sites existentes, e um objeto pequeno por sala no heap.
- **Memory (§2):** `energySpent` é só números (10 chaves) por sala própria,
  mesma ordem de grandeza dos campos que `stats.js` já grava; o acumulador em
  si vive no heap, nunca em `Memory`.
- **Fail-soft (§3):** o ledger nunca lança — `record`/`recordRepair` ignoram
  `amount` inválido em silêncio; nenhum novo guard é necessário no `main.js`
  porque não é um subsistema chamado por `guard()`, é lido só dentro de
  `stats()` (já guardado).
- **Testável offline (§4):** toda categoria nova ganha assertion no smoke.
- **Roles finos / utils dono do cross-cutting (§5):** a constituição já cita
  "contabilidade de energia" como responsabilidade de `utils/*` — este módulo
  formaliza isso.

## Open questions

- Nenhuma.
