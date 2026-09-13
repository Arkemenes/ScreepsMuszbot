# 0037 — Pioneer: rescue a spawnless owned room — Tasks

Derivado de `plan.md`.

- [x] 1. `utils/energy.js`: `energyPiles(room)` (extraído/generalizado de
      `roles/builder.js`); `roles/builder.js` passa a usá-lo.
  - verify: `node --check src/utils/energy.js src/roles/builder.js` ·
    smoke do builder continua verde
- [x] 2. `utils/config.js`: `pioneer.maxDistance` (10),
      `pioneer.maxConcurrent` (2).
- [x] 3. `rooms/pioneering.js` (novo): `isSpawnless`, `spawnlessRooms`,
      `candidateMothers`, `motherRoomFor`, `pioneersWanted`, `nextTarget`
      (AC1, AC2, AC3).
  - verify: `node --check src/rooms/pioneering.js`
- [x] 4. `rooms/needs.js`: `compute(room)` ganha `pioneer`, zerado sob
      `mem.defenseActive` (AC3).
- [x] 5. `roles/pioneer.js` (novo): carrega → viaja → constrói → viagem
      redonda → aposenta (AC4).
  - verify: `node --check src/roles/pioneer.js`
- [x] 6. `roles/index.js`: registra `pioneer` entre `hauler` e `upgrader`
      (AC5).
- [x] 7. `test/smoke.js`: cobertura de `pioneering.js` (todos os
      critérios de recusa + caso positivo), `pioneer.run()` (carregar,
      viajar, construir, viagem redonda, aposentar), refactor do
      `energyPiles` não quebra os testes existentes do `builder`
      (19 novas — 356 no total).
  - verify: `node test/smoke.js` verde
- [x] 8. `npx grunt`; atualizar `ROADMAP.md`/`ARCHITECTURE.md`.

## Follow-up (mesmo dia, pós-done)

Usuário reportou em produção "não vejo nenhum pioneer spawnando" numa sala
sem spawn de verdade. Diagnóstico via console (`Game.myRooms`,
`Memory.rooms[x].enemies`, contagem de spawn, `Game.map.findRoute`, dry-run
de `spawnCreep`) confirmou que **todas** as condições pra despachar batiam
(sala-alvo sem spawn/sem hostil, sala-mãe com 3 spawns/sem ataque, distância
6 ≤ 10, corpo do pioneer cabe no orçamento) — mas não dava pra inspecionar
o resultado real de `pioneersWanted`/`wanted`/`spawn` de dentro do jogo
rodando, só os inputs crus. Adicionado `global.pioneerStatus()`
(`rooms/pioneering.js`) — traça a cadeia de decisão inteira (sala
spawnless → motivo de recusa ou sala-mãe escolhida + distância → quantos
pioneers atribuídos/faltando/já parados na sala-mãe) direto no console do
jogo, sem precisar de mais rodadas de "roda esse snippet, me manda o
resultado". Registrado em `help()`. Causa raiz ainda não confirmada no
momento deste commit — aguardando o resultado do `pioneerStatus()` em
produção (hipóteses: deploy do client-sync desatualizado, ou algo real
ainda não encontrado na revisão de código).

Validado pelo smoke (359 assertions — 3 novas: `pioneerStatus()` registrado
em `global`, roda sem lançar, relata a sala spawnless pelo nome) + `npx
grunt`.

Rodado em produção: `pioneerStatus()` confirmou `pioneersWanted` correto
("wants 2 more") e deploy em dia (o próprio comando já reflete o código
mais recente). Ainda não explica por que 0 pioneers existem de verdade —
suspeita agora é a fila de spawn genérica (`rooms/spawning.js`) sempre
escolhendo algo de prioridade mais alta que `pioneer` nos spawns livres.
Adicionado `previewQueue(room)` (lazy `require("../roles")` — evita ciclo
com `roles/index.js` → `roles/pioneer.js` → este arquivo, mesmo truque de
`utils/population.js` pro `rooms/needs.js`) — reproduz a fila de
prioridade exata que `spawning.js` monta nesse tick, impresso junto do
`pioneerStatus()`.

**Causa raiz encontrada** — `previewQueue()` em produção mostrou "nothing
wants a creep right now" (fila vazia, `pioneer` nem aparecia), contradizendo
o próprio `pioneerStatus()` (que calculava "wants 2" **reimplementando a
fórmula do `pioneersWanted()` inline**, não chamando a função de verdade).
A divergência apontou pro elo entre `rooms/needs.js` e
`roles/pioneer.js`: `compute(room)` calculava a variável local `pioneer`
(linha `const pioneer = mem.defenseActive ? 0 : pioneering.pioneersWanted(room);`)
mas **esqueceu de incluir `pioneer` no objeto `return {...}` no final da
função** — `roomNeeds(room).pioneer` sempre voltava `undefined`.
`pioneer.spawn(room)` faz `census.count(...) < this.wanted(room)`, e
`0 < undefined` é `false` em JS — por isso `spawn()` nunca retornava
`true`, nunca entrava na fila do `spawning.js`, nunca spawnava nada.
Corrigido acrescentando `pioneer` no `return` de `compute()`.

Gap de cobertura real: nenhuma assertion do smoke passava pelo caminho de
verdade `roomNeeds(motherRoom).pioneer` → `pioneer.wanted()`/`spawn()` —
só testava `pioneering.pioneersWanted()` isoladamente (que sempre esteve
correto) e `pioneer.run()` isoladamente (que nunca toca `wanted`/`spawn`).
Adicionadas 3 assertions novas exatamente nesse caminho, confirmadas
falhando sem a correção (revertida manualmente, `node test/smoke.js`
mostrou as 3 falhando) e passando com ela.

Confirmado funcionando em produção depois da correção. Usuário pediu (a)
confirmação de que o pioneer só sai da sala-mãe com a `CARRY` cheia e foca
só no spawn (não outras construções), (b) o que acontece quando a energia
acaba fora de casa (minerar ou voltar), e (c) subir `pioneer.maxDistance`
de 10 pra 30. Respondido com base no código (ver `roles/pioneer.js`:
`run()` — carrega até `getFreeCapacity()===0` antes de sair; constrói
**só** `STRUCTURE_SPAWN`, nunca outra estrutura, e se aposenta assim que
ele existe, deixando o resto pro `builder` normal da sala já com spawn;
esvaziou na sala-alvo → `routing.moveToRoom` de volta pra casa, nunca
mineira — não tem `WORK`-em-source em lugar nenhum do role). `maxDistance`
alterado pra 30 em `utils/config.js` (era 10) + os dois fallbacks
`config.get(..., 10)` em `rooms/pioneering.js` sincronizados pra 30
(mesmo padrão de todo outro tunable — fallback do call site espelha o
default do `config.js`). Smoke ajustado: o teste de "fora do alcance"
forçava uma rota de 20 hops (> 10 antigo); subido pra 40 (> 30 novo).

Pedido seguinte: em vez de se aposentar (`suicide`) assim que a sala-alvo
tem spawn de verdade, o pioneer deveria virar um `bootstrap` ali mesmo —
a sala recém-nascida ainda não tem miner/hauler, só o spawn; deixar o
pioneer (já carregado, já lá, corpo geralmente maior que o de um
bootstrap normal por vir escalado pela sala-mãe) continuar trabalhando é
estritamente melhor que jogá-lo fora e esperar um bootstrap novo nascer e
viajar do zero. Implementado como migração de role dentro do próprio
`roles/pioneer.js` (não no `main.js`) — mesmo princípio da conversão
`harvester`→`hauler` que o `main.js` já faz (ROADMAP 0014), só que aqui
precisa ficar no role porque depende de estado específico do pioneer
(`targetRoom`) que o dispatcher genérico não tem por quê conhecer:
`creep.memory.role = "bootstrap"`, limpa `targetRoom`/`home`, chama
`bootstrap.run(creep)` no mesmo tick (evita perder 1 tick ocioso). Sem
risco de ciclo de `require` (`bootstrap.js` não requer nada que volte pra
`pioneer.js`/`pioneering.js`/`needs.js`). Ajustada a assertion que testava
"pioneer se aposenta com spawn pronto" pra testar a migração de role em
vez disso — confirmado que `bootstrap.run()` roda limpo no fixture
mínimo de teste (tudo que precisaria de find-by-constante no mock
degrada pra `null`/vazio sem lançar, então o run() vira um no-op seguro
nesse cenário simplificado — comportamento de verdade só é coberto pelos
testes já existentes do `bootstrap.js`).

Validado pelo smoke (364 assertions no total — líquido +2: removida a
assertion antiga de "retira com spawn pronto", adicionadas 3 novas
cobrindo "não se aposenta"/"vira bootstrap"/"memory limpa") + `npx grunt`.

Pedido seguinte: pioneer deveria ter prioridade **máxima** em qualquer
disputa por pilha de energia na sala-mãe, acima até de hauler/bootstrap.
`utils/reservations.js` tinha só 2 níveis (`ECONOMY_PICKERS` — hauler/
bootstrap — vs. todo mundo), com a prioridade do primeiro valendo só
enquanto a sala não está `economyStable` (spawn/ext cheios). Virou 3
níveis via `pickerRank(creep)` (`TOP_PICKERS` = pioneer → rank 2 >
hauler/bootstrap → rank 1 > resto → rank 0): o rank mais alto ganha, mas
com uma diferença chave — o rank do pioneer vale **incondicionalmente**
(sala estável ou não), enquanto o rank hauler/bootstrap continua só
valendo enquanto a sala não está estável (comportamento antigo,
preservado sem mudança pra esse par). Peers do mesmo rank (dois pioneers
inclusive) continuam dividindo por nome, igual antes. Sem Memory novo,
sem mudança de assinatura pública (`available`/`usable`/`claim`/`release`
inalterados) — só a regra de rank interna.

Um erro de setup no próprio teste apareceu na primeira rodada (esqueci de
re-setar `rPio.memory.loadTarget` de volta pro drop depois de reusar o
mesmo creep pro teste do container) — o smoke pegou (`FAIL` real, não
falso-positivo), corrigido antes de fechar.

Validado pelo smoke (372 assertions no total — 8 novas: pioneer ganha de
hauler/builder num drop contestado e num container que só cede o quanto
falta, ganha de hauler **mesmo com a sala estável** — diferença chave do
rank hauler/bootstrap —, e dois pioneers concorrendo dividem por nome
como qualquer par do mesmo rank) + `npx grunt`.

Pedido seguinte: "cada sala próxima envia 2 pioneers por vez pra sala
nova" — antes, `motherRoomFor(targetRoomName)` escolhia só a **única**
sala própria com spawn mais próxima; qualquer outra sala em alcance nunca
ajudava aquele alvo (`targetsFor` filtrava por `motherRoomFor(r.name) ===
motherRoom.name`, uma atribuição exclusiva). Trocado por `mothersFor
(targetRoomName)` — devolve **toda** candidata dentro de
`pioneer.maxDistance`, não só a mais próxima. Isso exigiu mudar onde o
teto `pioneer.maxConcurrent` é contado: antes era por alvo (`assigned =
pioneers.filter(targetRoom===alvo)`, contagem única, compartilhada entre
quem quer que fosse a única mãe); agora é por **par mãe-alvo** (nova
`assignedBy(motherRoom, targetRoomName)`, filtra por `targetRoom` **e**
`home` juntos) — senão a primeira mãe a mandar 2 pioneers zeraria
`wanted()` pra qualquer outra mãe também em alcance, matando o pedido
inteiro. `pioneerStatus()` reescrito pra listar todas as resgatadoras em
alcance (antes: 1 linha por sala-alvo; agora: 1 linha por sala-alvo + 1
sub-linha por mãe, cada uma com sua própria fila de spawn). `motherRoomFor`
removido do módulo (não sobrou nenhum uso pra "a única mais próxima" —
substituído por `mothersFor` em todo lugar, inclusive nos exports/testes).

Validado pelo smoke (374 assertions no total — cenário com 2 salas-mãe
(`PMother`/`PMother2`) em alcance da mesma sala-alvo: `mothersFor()` lista
as duas, cada uma quer seus próprios 2 pioneers, e um pioneer já atribuído
por `PMother` não reduz o que `PMother2` ainda quer) + `npx grunt`.

## Notes

Sem desvios do plano. `energyPiles` saiu de `roles/builder.js` pra
`utils/energy.js` sem mudar assinatura de verdade — só trocou `creep` por
`room` (o corpo da função já só usava `creep.room`); `builder.js` passou a
chamar `energyPiles(creep.room)` no único call site.

`pioneer.spawnData()` chama `pioneering.nextTarget(room)` diretamente (não
guarda a atribuição em Memory) — mesmo princípio de `raiding.findWeakTarget()`
e `remoteMiner.spawnData()`: recalcular do zero por spawn é barato e nunca
fica desatualizado, então não precisa de um registro persistido de "quem
tá indo pra onde".

Validado pelo smoke (356 assertions no total — 19 novas:
`isSpawnless`/`spawnlessRooms`/`motherRoomFor` nos critérios de recusa
(sem spawn próprio, fora do raio, hostil visto) + caso positivo,
`pioneersWanted`/`nextTarget` respeitando `maxConcurrent` e o gate de
`defenseActive`, e o `pioneer.run()` completo — retirar sem missão,
retirar com spawn já pronto, carregar (longe/perto), viajar cheio, viagem
redonda vazio, esperar o site aparecer, ir até o site, e construir) +
`npx grunt` (60 arquivos, +2: `rooms/pioneering.js`, `roles/pioneer.js`).
