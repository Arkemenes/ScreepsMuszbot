# 0051 — Mineral extraction, lab reactions/boosts, factory (nível 0), power spawn

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

Nenhuma das 3 árvores de código (`src/` atual, `old_1/`, `old_2/`) tem
extractor/lab/factory/power spawn funcionando de verdade — achado num
levantamento comparativo (2026-09-12). `old_1/architect.js` chegava a
plantar os construction sites de lab/factory/power spawn, mas nada os
usava; o extractor ficava até comentado. Hoje `src/rooms/architect.js` **já
planta** extractor + container de mineral (achado ao investigar esta spec
— não é gap, é trabalho de uma feature anterior nunca aproveitado), mas:

- Nenhum role minera o mineral.
- Nenhum hauler move mineral/composto/commodity/power entre estruturas.
- Nenhuma lógica de `structures/` roda reação de lab, produção de factory,
  ou `processPower()`.
- Nenhum comando de console decide **o quê** produzir (reação de lab,
  commodity do factory) — sem isso, mesmo com tudo automatizado, nada
  saberia o que fazer.

## Desired outcome

Com um mineral + extractor + container construídos (já cobertos pelo
`architect.js`), a sala minera o mineral sozinha e o excedente chega no
storage/terminal sem intervenção. Com labs manualmente construídos pelo
jogador (esta spec não planeja lab no stamp — cluster de lab é decisão de
posicionamento do jogador, fora de escopo) e um comando de console
(`setLabReaction`), a sala produz um composto de reação continuamente,
reabastecendo os labs de entrada e escoando o de saída sozinha. Um segundo
comando (`boostCreep`) aplica boost manualmente. Com um factory construído
e `setFactoryProduct` apontando pra uma commodity de **nível 0** (a única
faixa que não depende de Power Creep/GPL — ver "Fora de escopo"), o
factory produz sozinho contanto que os componentes cheguem lá. Um power
spawn com Power no store processa automaticamente.

## In scope (fases, cada uma fecha sozinha)

### Fase 0 — link nunca ajuda o mineral (achado ao desenhar esta spec)

- `src/rooms/architect.js`: `StructureLink` só move `RESOURCE_ENERGY` —
  restrição do próprio motor do jogo, não política. O planejador plantava
  um link "primário" do lado do mineral do mesmo jeito que faz pra cada
  source, mesmo sem nenhuma chance de esse link algum dia mover o que o
  mineral produz — puro desperdício de um slot de link (limitado por RCL)
  e energia de construção. Corrigido: o cluster de mineral não ganha
  link nenhum (continua ganhando rampart no container, igual antes).

### Fase 1 — Extração de mineral + logística

- `src/roles/mineralMiner.js`: role novo, senta no container do mineral
  (já plantado pelo `architect.js`), minera (`WORK`-heavy, sem `CARRY` —
  overflow cai automaticamente no container por baixo, mesmo mecanismo
  nativo que `roles/miner.js` já usa pra energy) enquanto
  `mineral.mineralAmount > 0` e o container tem espaço; `wanted()`
  self-contido (não passa por `rooms/needs.js` — sem disputa de recurso
  com economia de energia).
- **Sem role novo pra logística** (decisão do usuário, revisando o plano
  original desta spec): mineral/composto/commodity/Power é raro e lento
  (regeneração/cooldown na casa dos milhares de ticks) — um creep
  dedicado ficaria ocioso quase sempre (constitution §7, prefer the
  no-op). Em vez disso, `src/roles/hauler.js` ganha um fallback de
  **menor prioridade possível**: só quando o hauler não tem nenhum job de
  energia pendente (`pickLoad()` vazio, tanque vazio) é que ele tenta
  `pickMineralJob()` — (1) esvazia o container do mineral pro
  storage/terminal; (2) [fase 2] escoa o lab de saída pro storage; (3)
  [fase 2] reabastece os labs de entrada a partir do storage/terminal;
  (4) [fase 3] escoa a commodity do factory; (5) [fase 3] reabastece o
  factory; (6) [fase 4] alimenta o power spawn com Power do
  storage/terminal (raramente há Power sem power bank — ver "Fora de
  escopo" — mas o código não distingue a origem, só move o que está lá).
  Uma vez que um job não-energia é aceito (`memory.mineralJob`), o hauler
  o termina antes de voltar pra lógica de energia — nunca abandona um
  recurso pela metade no próprio `store`. Energia pro lab/factory/power
  spawn continua vindo do `optionalConsumer()` já existente do próprio
  `hauler.js` (só ganhou `STRUCTURE_FACTORY`/`STRUCTURE_POWER_SPAWN` na
  mesma lista que já tinha `STRUCTURE_LAB`).

### Fase 2 — Lab: reações + boost

- `src/structures/lab.js`: registrado em `structures/index.js`. Só a lab
  de **saída** (`Memory.rooms[x].labReaction.output`) age — chama
  `runReaction(input1, input2)` quando `cooldown === 0` e as duas labs de
  entrada existem. As labs de entrada não fazem nada por conta própria
  (`run()` confere o id e sai).
- `src/rooms/refining.js` (mesmo papel de `remotes.js`/`raiding.js`
  pra elegibilidade — constitution §6): console
  `setLabReaction(roomName, mineral1, mineral2)` — valida a reação via
  `REACTIONS[mineral1][mineral2]` (constante nativa do Screeps, nunca
  copiada pro código — só consultada em runtime, ver "Constitution
  check"), acha 3 labs na sala tal que a de saída esteja a alcance 2 das
  outras duas (requisito real do `runReaction`), grava
  `Memory.rooms[x].labReaction = {a, b, product, output, input1, input2}`
  (ids fixos — resolvido uma vez, não recalculado a cada chamada).
  `cancelLabReaction(roomName)` apaga a qualquer momento.
- Console `boostCreep(creepName, compoundType)` — acha uma lab na sala do
  creep com `compoundType` carregado a alcance 1 e chama
  `lab.boostCreep(creep)`. Sempre manual — decidir qual creep boostar
  quando é uma escolha estratégica do jogador, mesma filosofia do
  `contestRoom` (0046).

### Fase 3 — Factory (nível 0)

- `src/structures/factory.js`: registrado em `structures/index.js`. Com
  `Memory.rooms[x].factoryProduct` setado, `cooldown === 0`, e todo
  componente da receita (`COMMODITIES[product].components` — constante
  nativa, mesmo princípio do `REACTIONS`) já estocado no próprio factory,
  chama `factory.produce(product)`.
- `setFactoryProduct(roomName, resourceType)` — valida
  `COMMODITIES[resourceType]` existe **e** `.level === 0` (nível 1-5
  precisa de Operate Factory, Power Creep/GPL — fora de escopo, recusa
  com mensagem explicando o motivo). `cancelFactoryProduct(roomName)`.

### Fase 4 — Power spawn

- `src/structures/powerSpawn.js`: registrado em `structures/index.js`.
  Com `store[RESOURCE_POWER] >= 1`, chama `processPower()` — sem
  condição de energia própria (o motor recusa sozinho, fail-soft, se
  faltar); `powerSpawn.enabled` (`config.js`) desliga se preciso.

### Transversal

- `src/roles/hauler.js`'s `optionalConsumer()`: ganha `STRUCTURE_FACTORY`
  e `STRUCTURE_POWER_SPAWN` na mesma lista que já alimenta
  `STRUCTURE_LAB` com energia (extensão de 2 linhas de um filtro já
  existente — essas três estruturas só precisam de `RESOURCE_ENERGY` pro
  hauler normal, o `mineralHauler` é só pros recursos não-energia).
- `src/utils/console.js`: nova seção "Refino" com os 6 comandos.

## Out of scope

- **Power Creep / GPL** (subir de nível um power creep, `operateFactory`,
  liberar nível 1-5 do factory) — sistema próprio do jogo, do porte de
  uma feature nova inteira, não uma automação de estrutura. Vira item no
  ROADMAP "Later".
- **Invasão de power bank** (única forma de conseguir Power de verdade
  sem mercado) — expedição com squad de ataque e prazo curto, do mesmo
  porte do `raidSquad` (0032 Fase 4). Vira item no ROADMAP "Later".
- **Planejamento automático de cadeia de reação multi-hop** — o jogador
  escolhe UMA reação de cada vez (`setLabReaction`) com os dois reagentes
  já disponíveis (via storage/terminal, comprados ou minerados
  manualmente); o bot não decide sozinho "preciso de ZK, que precisa de
  Z+K" em cascata.
- **Lab no stamp do `architect.js`** — cluster de lab é posicionamento
  manual do jogador (mesma decisão do 0032's D5, represada de propósito).
- **Estratégia de o quê produzir** (qual composto/commodity vale mais
  agora) — decisão do jogador via console, não heurística automática.
- **Terminal market pra minério/composto/commodity** (vender excedente) —
  já listado em "Later" (Market/terminal), sem mudança aqui.

## Acceptance criteria

1. `mineralMiner` minera o mineral (`creep.harvest`) quando
   `mineral.mineralAmount > 0` e o container tem espaço; não minera com
   o container cheio nem com o mineral esgotado — `test/smoke.js`: 3
   casos.
2. `hauler.js`'s `pickMineralJob(room)` prioriza esvaziar o container do
   mineral antes de qualquer outro job — `test/smoke.js`.
3. `setLabReaction()` recusa uma reação inválida (`REACTIONS` não tem o
   par), recusa sem 3 labs a alcance 2, e grava `Memory.rooms[x]
   .labReaction` com os 3 ids corretos no caso válido —
   `test/smoke.js`: 3 casos.
4. `structures/lab.js`'s `run()` só chama `runReaction` na lab de saída, e
   só com `cooldown === 0` — `test/smoke.js`: 2 casos.
5. `hauler.js`'s `pickMineralJob()` reabastece uma lab de entrada abaixo
   do buffer (`mineralHauler.labBuffer`) a partir do storage, e escoa a
   lab de saída com produto pro storage — `test/smoke.js`: 2 casos.
6. `boostCreep()` chama `lab.boostCreep(creep)` quando há uma lab com o
   composto certo a alcance 1, e recusa (loga, não lança) sem uma —
   `test/smoke.js`: 2 casos.
7. `setFactoryProduct()` recusa uma commodity de nível > 0 com mensagem
   explicando o motivo (Power Creep/GPL), e aceita nível 0 —
   `test/smoke.js`: 2 casos.
8. `structures/factory.js`'s `run()` só chama `produce()` com todo
   componente já estocado — `test/smoke.js`: 2 casos.
9. `structures/powerSpawn.js`'s `run()` chama `processPower()` só com
   `store[RESOURCE_POWER] >= 1`, e respeita `powerSpawn.enabled = false`
   — `test/smoke.js`: 2 casos.
10. `hauler.js`'s `optionalConsumer()` também considera
    `STRUCTURE_FACTORY`/`STRUCTURE_POWER_SPAWN` com energia livre —
    `test/smoke.js`.

## Constitution check

- **CPU:** `mineralHauler.pickJob()` só lê `roomCache`/`Memory.rooms`
  (nenhum `room.find` novo fora do que `roomCache` já cacheia por tick).
  `structures/lab.js`/`factory.js` fazem 1 chamada nativa condicional por
  estrutura por tick, mesmo custo de `tower.js`/`link.js` já pagos hoje.
- **Memory:** `Memory.rooms[x].labReaction`/`.factoryProduct` — objetos
  pequenos, só ids/strings, nunca um objeto de jogo.
- **Fail-soft:** `runReaction`/`produce`/`processPower`/`boostCreep` são
  chamadas nativas por código de retorno — um erro nunca lança, só não
  produz nada naquele tick.
- **Config over hardcode:** `mineralHauler.labBuffer` (500),
  `powerSpawn.enabled` (true) em `utils/config.js`. `REACTIONS`/
  `COMMODITIES` **nunca** são copiados pro código — são constantes
  nativas do Screeps, consultadas em runtime (mesmo princípio de
  `BODYPART_COST`/`CONTROLLER_STRUCTURES` já usados em todo o código).
- **Roles thin, utils/structures own the logic**: `mineralMiner.js` e o
  fallback de `hauler.js` são comportamento de creep; a decisão de "que
  reação/commodity" mora em `rooms/refining.js`, execução em
  `structures/lab.js`/`factory.js`/`powerSpawn.js` — mesma separação que
  `remotes.js`/`raiding.js` já usam pra decisões de sala.
- **Prefer the no-op** (constitution §7): nenhum role novo pra logística
  de mineral/lab/factory/power — um creep dedicado ficaria ocioso quase
  sempre dado o ritmo lento dessas mecânicas; reaproveitar os ciclos
  ociosos do `hauler.js` já existente custa zero spawn extra.
- **Offline test:** `test/smoke.js` mocka `REACTIONS`/`COMMODITIES` com
  um subconjunto suficiente pra exercitar os caminhos de código (a tabela
  real de produção só existe no servidor real, o código nunca a hardcoda
  — ver acima).

## Open questions

Nenhuma — escopo (A) fechado com o usuário antes desta spec; Power
Creep/GPL e invasão de power bank ficam como itens novos no ROADMAP
"Later", sem spec própria ainda.
