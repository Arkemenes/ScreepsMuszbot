# 0054 — Logistics manager: resource spending tiers

- **Status:** spec
- **Owner:** usuário + Claude
- **Created:** 2026-09-12

## Problem

Cada destino de energia da sala decide "quando parar de gastar" com um número
diferente, num lugar diferente, sem nenhuma relação nomeada entre eles:

- `rampartRepair.js`'s `hasSurplusEnergy` só deixa um rampart/wall continuar
  endurecendo acima do nível "saudável" (`tower.rampartHealthyRatio`, 1% do
  `hitsMax`) se o storage estiver acima de `tower.rampartStorageFillGate`
  (50% da capacidade) — um piso alto, achado por tentativa e erro.
- `hauler.js`'s `optionalConsumer` (lab/factory/power spawn/container do
  controller) só puxa do storage acima de `hauler.storageReserveFloor` (5%) —
  outro número, outra lógica, mesma ideia.
- `hauler.js`'s "topping off" de torre (além do `deliverReserve` de
  50%/80%) está dentro de `essentialConsumer`, que **ignora** qualquer piso —
  hoje esse trecho especificamente drena o storage até zero se for preciso,
  mesmo sendo claramente um "extra", não uma emergência.
- `structures/link.js` manda o link coletor para o não-coletor com **mais
  capacidade livre**, sem saber se esse link alimenta o controller ou o
  storage, nem se o outro lado já está satisfeito.
- O terminal não tem piso nenhum — o ledger (ROADMAP 0043) decide o que é
  *retirável*, mas nada impede o hauler de zerar esse saldo retirável inteiro
  por um consumidor de baixa prioridade.

Nenhum desses lugares expressa a mesma pergunta que o usuário quer fazer em
todos eles: "esse destino já está bom o bastante? se não, resolve com tudo
que tiver; se já está, só continua melhorando enquanto isso não comer a
reserva de emergência da sala."

## Desired outcome

Todo destino de energia relevante da sala — spawn/extension, torre,
rampart/wall, lab/factory/power spawn/container do controller, e os dois
links não-coletores (controller e storage) — é lido em um de três níveis:

- **crítico** (`< satisfactory`): o destino ainda não está bom o bastante.
  Resolvido com **qualquer** energia disponível, inclusive abaixo da reserva
  de emergência — a mesma urgência que já existe hoje para spawn/ext/torre
  abaixo da reserva.
- **satisfatório** (`>= satisfactory`, `< ideal`): o destino já está numa
  faixa aceitável. Só continua recebendo energia rumo ao ideal **enquanto o
  storage da sala tiver a reserva intacta** (`logistics.reserveRatio`, 1% da
  capacidade do storage) — um piso único substitui os dois pisos antigos
  (`tower.rampartStorageFillGate` e `hauler.storageReserveFloor`).
- **ideal** (`>= ideal`): o destino está no topo, não é mais um alvo de
  entrega.

Na prática: um jogador olhando o Grafana/console vê a sala sempre priorizando
spawn/torre/rampart em apuro antes de qualquer topo cosmético, e vê a sala
parar de espremer o storage pra encher lab/torre/rampart além do satisfatório
assim que a reserva de 1% está em risco — mesmo sob ataque ou em qualquer
imprevisto, sempre sobra 1% do storage intocado por esse tipo de gasto
opcional.

## In scope

- `utils/resourceTiers.js` (novo): `reserveFloor(room)` e `aboveReserve(room)`
  — o piso único de 1% da capacidade do storage, mesmo padrão null-safe de
  `rampartRepair.hasSurplusEnergy`/`hauler.storageAboveFloor` (nunca lança
  sem storage).
- `rampartRepair.js`: troca o gate de `hasSurplusEnergy` (50% de fill do
  storage) pelo novo `resourceTiers.aboveReserve` (1%). `isCritical`/
  `isHealthy` (valores e semântica) não mudam.
- `hauler.js`: `optionalConsumer` (lab/factory/power spawn/container do
  controller) troca `storageAboveFloor` (5%) por `resourceTiers.aboveReserve`
  (1%) — continuam "sempre ideal-only" (sem faixa satisfatória própria,
  decisão do usuário: nenhuma mudança de comportamento requerida aqui além
  do piso).
- `hauler.js` + `tower.js`: a torre ganha três bandas explícitas de fill
  ratio, não mais um único limiar (`deliverReserve`) com "acima disso é
  incondicional pra sempre":
  - **crítico** `< tower.criticalRatio` (0.5) — resolve com tudo, ignora a
    reserva, igual hoje.
  - **satisfatório** `tower.criticalRatio` a `tower.satisfactoryRatio`
    (0.5–0.8) — a torre já está numa faixa aceitável; não é mais alvo
    prioritário do hauler, mas também não é mais gastado nela.
  - **ideal** `>= tower.satisfactoryRatio` até cheia — só continua sendo
    topada enquanto `resourceTiers.aboveReserve(room)` (comportamento novo:
    hoje esse trecho ignora qualquer piso).
  Sob ataque (`Memory.rooms[x].defenseActive`), as três bandas sobem juntas:
  `tower.criticalRatioUnderAttack` (0.8) / `tower.satisfactoryRatioUnderAttack`
  (0.95) — mesma intenção do `deliverReserveUnderAttack` de hoje (torre mais
  cheia em combate), só que o deslocamento vale pras três bandas, não só pro
  corte satisfatório. `hauler.toppingOffThreshold` (5% livre) continua sendo
  o corte prático de "já está perto o bastante da capacidade cheia, não vale
  mais uma viagem" dentro da banda ideal — não muda.
- `utils/config.js`: remove `tower.rampartStorageFillGate`,
  `hauler.storageReserveFloor`, `hauler.deliverReserve` e
  `hauler.deliverReserveUnderAttack`; adiciona `logistics.reserveRatio`
  (0.01), `logistics.terminalReserveRatio` (0.1),
  `tower.criticalRatio`/`tower.satisfactoryRatio` (0.5/0.8),
  `tower.criticalRatioUnderAttack`/`tower.satisfactoryRatioUnderAttack`
  (0.8/0.95), `logistics.controllerCriticalDowngradeRatio` (0.1) e
  `logistics.storageSatisfactoryRatio` (0.5).
- `structures/link.js`: classifica cada link não-coletor por proximidade em
  runtime (`findInRange(controller, 3)` = link do controller; senão, link do
  storage — mesmo padrão geométrico que `receivingLink()` já usa) e o link
  coletor decide entre os dois pela regra de "Link tiers" abaixo, em vez de
  "mais capacidade livre".
- `hauler.js`'s `terminalWithdrawable`: nunca deixa a fatia retirável cair
  abaixo de `logistics.terminalReserveRatio` × capacidade do terminal — o
  ledger continua controlando *o que é retirável em teoria*, o piso novo
  controla *quanto disso pode ser sacado agora*.
- `ARCHITECTURE.md`: atualiza as entradas de `utils/`, `structures/link.js`,
  `roles/hauler.js`, `structures/tower.js` afetadas.

### Link tiers

O controller não tem "nível de enchimento" — quem enfileira energia é o
link, o sinal de urgência real do controller é `ticksToDowngrade` perto do
limite (`CONTROLLER_DOWNGRADE[rcl]`), igual ao que `rooms/needs.js` já faz
pra decidir o upkeep-upgrader de RCL8 (`ctrl.ticksToDowngrade <
CONTROLLER_DOWNGRADE[8]`). Sem um link de controller **ou** sem link de
storage construído ainda (RCL baixo), nada disso se aplica — o não-coletor
único recebe como hoje (fallback "mais capacidade livre" entre qualquer
link não classificado). Com os dois construídos, o link coletor decide,
nesta ordem:

1. **Controller crítico** — `ticksToDowngrade <
   CONTROLLER_DOWNGRADE[rcl] * logistics.controllerCriticalDowngradeRatio`
   (10% do teto daquele RCL) → manda pro link do controller, sempre,
   mesmo que o link do storage esteja vazio (risco de perder RCL vence
   qualquer prioridade de storage).
2. **Storage crítico** — fill do storage `< logistics.reserveRatio` (a
   mesma reserva de 1%, reaproveitada) → manda pro link do storage
   (emergência simétrica à de cima).
3. **Storage satisfatório e controller não** — fill do storage `>=
   logistics.storageSatisfactoryRatio` (50%) **e** `rcl < 8` (controller
   "satisfatório" = RCL8, sem mais progresso de RCL a ganhar, upkeep only —
   mesmo critério que `rooms/needs.js` já usa) → manda pro link do
   controller (não faz sentido inchar um storage já confortável enquanto o
   controller ainda tem RCL de verdade pra ganhar).
4. **Default** — link do storage (a prioridade de base, como hoje: um
   controller que já é RCL8 e não está em risco de downgrade não ganha nada
   de correr na frente do storage).

## Out of scope

- Mineral/Power/commodity — o framework de 3 níveis vale só para
  `RESOURCE_ENERGY` (decisão do usuário). `pickMineralJob()`'s cascata
  atual não muda.
- Reordenar a prioridade **entre** destinos diferentes (torre vs spawn/ext
  vs storage-abaixo-do-piso) — a ordem do `pickLoad`/`pickDeliver` do hauler
  continua a mesma; esta spec só formaliza os 3 níveis **dentro** de cada
  destino.
- `utils/reservations.js`'s `pickerRank` (pioneer > hauler/bootstrap >
  resto) — ortogonal, não muda.
- Lógica de compra/venda no terminal (`Market / terminal`, outro item do
  Later) — aqui só entra o piso de reserva, não a política de mercado.
- `tower.repairEnergyRatio` (quanto a própria torre precisa ter pra reparar
  algo) — não é um destino de entrega, é uma condição de uso da torre.

## Acceptance criteria

1. `utils/resourceTiers.js` exporta `reserveFloor(room)` (`0` sem
   `room.storage`, senão `capacity * logistics.reserveRatio`) e
   `aboveReserve(room)` (`false` sem storage; `store.energy > reserveFloor`
   caso contrário).
2. `utils/config.js`'s `defaults` não tem mais `tower.rampartStorageFillGate`
   nem `hauler.storageReserveFloor`; tem `logistics.reserveRatio` (0.01) e
   `logistics.terminalReserveRatio` (0.1).
3. `rampartRepair.worthHardening` continua reparando um rampart abaixo de
   `rampartHealthyRatio` independente do storage; acima disso, só continua
   se `resourceTiers.aboveReserve(room)` — smoke test cobre um storage a 20%
   de fill (abaixo do gate antigo de 50%, acima da reserva nova de 1%) e
   assert que agora conta como "vale reparar" (mudança de comportamento
   deliberada desta spec).
4. `hauler.optionalConsumer`'s uso via `pickLoad` só devolve um alvo quando
   `resourceTiers.aboveReserve(room)` é `true` (substitui o antigo
   `storageAboveFloor`).
5. Torre: abaixo de `tower.criticalRatio` (0.5, ou 0.8 sob
   `defenseActive`) continua sendo puxada do storage incondicionalmente
   (crítico, sem gate); entre `criticalRatio` e `satisfactoryRatio` (0.5–0.8,
   ou 0.8–0.95 sob ataque) deixa de ser alvo do `pickDeliver`/
   `essentialConsumer` (satisfatório, não mais prioritário nem gastando);
   acima de `satisfactoryRatio` (banda ideal) só continua sendo topada
   (`towerDeliverable`) quando `resourceTiers.aboveReserve(room)` é `true` —
   hoje esse trecho é incondicional, smoke test cobre a mudança.
6. `structures/link.js` — smoke test com 3 links stub (coletor + controller
   + storage) cobre as 4 regras da seção "Link tiers" na ordem: (a)
   controller com `ticksToDowngrade` abaixo do limiar crítico ganha mesmo
   com storage vazio; (b) storage abaixo da reserva de 1% ganha quando o
   controller não está crítico; (c) storage `>= storageSatisfactoryRatio`
   com `rcl < 8` manda pro controller; (d) nenhuma das anteriores → storage
   (default).
7. `hauler.terminalWithdrawable(room)` nunca devolve um valor que, somado ao
   que já foi sacado, deixaria o terminal abaixo de
   `logistics.terminalReserveRatio * capacity` — smoke test com um terminal
   perto do piso confirma o corte.
8. `node --check` limpo em todo arquivo tocado.
9. `node test/smoke.js "$(pwd)"` verde com as novas assertions dos itens 3,
   6 e 7 (mínimo).
10. `npx grunt` builda `dist/main.js`.
11. `ARCHITECTURE.md` atualizado (`utils/resourceTiers.js` novo na tabela de
    `src/utils/`; `structures/link.js`, `roles/hauler.js` e
    `utils/rampartRepair.js` com as mudanças de gate).
12. `ROADMAP.md`: linha `0054` com status `done` e nota resumindo a mudança,
    ao fechar a feature.

## Constitution check

- **§1 CPU:** `reserveFloor`/`aboveReserve` são leituras O(1) de
  `room.storage.store`, sem `room.find` novo — mesmo custo de
  `hasSurplusEnergy`/`storageAboveFloor` que substituem. `ticksToDowngrade`/
  `CONTROLLER_DOWNGRADE[rcl]` são leitura direta de propriedade/constante
  nativa, sem custo. A classificação de link por `findInRange(controller,
  3)` roda só dentro de `link.run()` de um link coletor com energia pronta
  pra mandar (já gated por `cooldown===0`/`store>=50`), não por tick
  incondicional.
- **§2 Memory:** nenhum campo novo em `Memory` — tudo derivado ao vivo do
  `room.storage`/`room.terminal` a cada tick, mesmo padrão das funções que
  substitui.
- **§3 Fail-soft:** `aboveReserve`/`reserveFloor` nunca lançam sem storage
  (mesma guarda de `hasSurplusEnergy`); terminal floor nunca lança sem
  `room.terminal` (mesma guarda de `terminalWithdrawable` hoje).
- **§5 Roles thin:** a lógica de tiers mora inteira em
  `utils/resourceTiers.js` (novo) + `utils/rampartRepair.js` (existente);
  `roles/hauler.js` e `structures/link.js` só chamam, não duplicam.
- **§6 Config over hardcode:** `logistics.reserveRatio`/
  `terminalReserveRatio` seguem o padrão dot-path de `utils/config.js`,
  overridable via `Memory.settings` sem redeploy.
- **§4 Testável offline:** todo comportamento novo (itens 3, 6, 7 dos
  critérios de aceitação) ganha assertion no `test/smoke.js`.

## Open questions

Nenhuma pendente — as decisões de escopo (unificar os pisos em 1%, quais
grupos de destino entram, ordem entre críticos mantida, piso do terminal em
10%, classificação de link por proximidade em runtime, lab/factory sempre
ideal-only) foram fechadas com o usuário antes de escrever este spec.
