# 0043 — Ajustes de prioridade: bootstrap, builder, pioneer, hauler

- **Status:** done
- **Depends on:** 0037 (pioneer), 0026 (miner/tower feed), 0032 D4 (rampartRepair)

## Problem

A pedido do usuário, quatro roles tinham comportamento de coleta/gasto de
energia que já não refletia a prioridade real desejada:

1. **bootstrap** — na entrega, `spawn` tinha prioridade incondicional sobre
   `extension` (que só empatava com link coletor/container no segundo
   nível). Extension deveria contar tanto quanto spawn para manter a sala
   apta a spawnar.
2. **builder** — o repair oportunista (alcance 3, sem interromper a
   viagem pro alvo real) usava um teto plano de 35% pra qualquer estrutura
   e `rampartRepair.worthHardening` (3 níveis) pro rampart — bem mais
   frouxo que o repair crítico da etapa principal (<30% / `isCritical`).
   Uma estrutura só arranhada ou um rampart "saudável" sequestrava o
   builder do canteiro real só por estar de passagem.
3. **pioneer** — ao terminar o spawn, virava `bootstrap` imediatamente,
   mesmo com outros canteiros do `architect.js` ainda pendentes (extension,
   container, estrada). E ao esvaziar na sala-alvo, sempre fazia a viagem
   redonda pra sala-mãe reabastecer, mesmo quando minerar uma source ali
   mesmo seria mais rápido.
4. **hauler** — a ordem de coleta/entrega já não refletia a prioridade
   desejada: container de source vinha antes de storage (deveria ser o
   contrário, uma vez que storage está acima do próprio piso de reserva),
   não existia piso de emergência pro storage, e drops eram aceitos com
   qualquer valor razoável sem considerar que decaem por tick. Confirmado
   com o usuário: o pioneer continua vencendo o hauler em qualquer disputa
   por pilha (rank 2 > 1 em `utils/reservations`, não muda); o container do
   controller continua como último nível de entrega; labs entram nesta
   rodada (regra mínima — topar energia, sem reação/boost).

## Desired outcome

- `roles/bootstrap.js`: entrega prioriza spawn/extension juntos (o mais
  perto por range), depois link coletor/container, depois dropa no chão.
- `roles/builder.js`: `opportunisticWork()`'s repair passa a exigir a
  mesma barra de "crítico" da etapa principal — <30% pra estrutura normal,
  `rampartRepair.isCritical` pro rampart (não mais `worthHardening`). O
  fallback de último recurso (`damagedRamparts`, depois de canteiros e
  repair normal) continua usando `worthHardening` (3 níveis) — só as
  etapas oportunista e crítica ficaram mais estritas.
- `roles/pioneer.js`:
  - Só vira `bootstrap` quando o spawn está pronto **e** não sobra nenhum
    `FIND_MY_CONSTRUCTION_SITES` na sala-alvo; enquanto sobrar, continua
    construindo (o mais perto por range, sem heurística de "mais perto de
    terminar").
  - Ao esvaziar na sala-alvo com trabalho pendente, compara minerar uma
    source local (`FIND_SOURCES` com `energy>0`, tempo = alcance +
    `capacidade/(WORK×HARVEST_POWER)`) contra a viagem redonda pra
    sala-mãe (`remotes.roomDistance × claim.ticksPerRoomHop × 2`, mesmo
    orçamento que `claimRoom` já usa) e commita na opção mais rápida
    (`memory.miningLocal`, sticky como `memory.returning`, pra não
    recalcular toda hora).
- `roles/hauler.js`:
  - Coleta: drop **decay-aware** acima de `hauler.minDropLoad` (100) na
    chegada (`estimatedDropAmount` — alcance como proxy de ETA, sem
    PathFinder por candidato) → tombstone/ruína (mesmo piso, sem
    decaimento por tick) → link não-coletor → storage (só acima de
    `hauler.storageReserveFloor`=5% **e** com consumidor genuíno,
    `needyConsumer` ampliado pra incluir lab e container do controller) →
    container de source (`minContainerLoad`, como antes) — container agora
    vem **depois** de storage.
  - Entrega: torre-reserva → spawn/ext → storage abaixo do piso de 5%
    (buffer de emergência antes de qualquer topping opcional) → torre-95%
    → lab com espaço → storage (geral) → container do controller (mantido
    como último nível, sem mudança).

## In scope

- `roles/bootstrap.js`, `roles/builder.js`, `roles/pioneer.js`,
  `roles/hauler.js`.
- `test/smoke.js`: `HARVEST_POWER` nas constantes stubadas; asserções
  novas pro repair oportunista crítico-only, pro pioneer que continua
  construindo com spawn pronto, pra comparação minerar-local vs.
  voltar-pra-casa, pro piso de decaimento de drop, pra storage vencendo
  container, e pros dois níveis novos de entrega (piso de storage, lab).

## Out of scope

Reação/boost de verdade em lab (consumir mineral, `structures/lab.js`,
role dedicado) — o hauler só topa energia num lab existente, não decide
o que a sala faz com reações. Fica pra quando isso for pedido de verdade.

## Follow-up: terminal + bug do piso de storage

A pedido do usuário, depois da primeira rodada:

1. **Terminal como topo de prioridade de coleta.** Problema: qualquer
   energia que aparece no terminal sem o hauler ter posto ali (depósito
   manual pela UI, `Terminal.send` de sala-irmã, ordem de mercado
   liquidada) é presumidamente reservada pelo jogador pra outra coisa
   (vender, mandar pra outra sala) — um hauler que a redistribui desfaz
   essa intenção. `roles/hauler.js`'s `terminalWithdrawable(room)` mantém
   um ledger (`Memory.rooms[x].terminalLedger = {amount, withdrawable}`,
   recalculado 1×/tick) que só encolhe (nunca cresce sozinho com um
   aumento não creditado) — hoje, sem nenhum caminho que credite o
   ledger, isso significa na prática que o hauler nunca retira do
   terminal, o que é o comportamento seguro pedido; é andaime pronto pro
   dia que existir depósito automático de excedente lá. Tudo que vem do
   terminal é marcado (`dest`/`memory.forcedDeliver = "storage"`) pra ir
   **direto pro storage** na entrega, pulando a cascata normal
   (torre/spawn/lab/etc) inteira, enquanto storage existir e tiver
   espaço — cai de volta pra cascata normal só se não tiver storage ou
   ele estiver cheio.
2. **Bug do piso de storage (5%) bloqueando spawn/ext.** A primeira
   rodada introduziu `storageAboveFloor` como gate único pra qualquer
   retirada do storage — sem perceber que isso também bloqueava o caso
   original (spawn/extension precisando de energia), já que um storage
   de sala jovem raramente chega nem perto de 5% de 1M de capacidade.
   Corrigido: `essentialConsumer` (spawn/extension/torre) ignora o piso
   por completo — manter a sala apta a spawnar/defender sempre vale mais
   que preservar o buffer; só `optionalConsumer` (lab/container do
   controller, os dois níveis novos desta feature) continua respeitando
   `storageAboveFloor`.

`test/smoke.js` ganhou asserções pra: terminal protegido na primeira vez
que é visto (nada creditado ainda), ledger creditado sendo respeitado e
capado pela capacidade livre do hauler, entrega forçada pro storage
ignorando spawn/torre, essential consumer furando o piso, e optional
consumer continuando bloqueado por ele.

### Bug real: torre `sourceDefense` contando como "essencial"

Reportado pelo usuário: "o hauler está pegando do terminal, mas não está
depositando no storage... parece que está pegando do storage e
depositando no próprio storage, mesmo com terminal adjacente cheio".

Causa: `essentialConsumer` contava **qualquer** torre com espaço livre,
sem excluir a tagueada `sourceDefense` — só o miner alimenta essa torre
(ROADMAP 0026), `pickDeliver` nunca a mira. Se a única "necessidade" da
sala fosse essa torre, o hauler sacava do storage (achando que havia
consumidor) e, na entrega, `pickDeliver` pulava a torre — sobrava só o
nível geral de storage, devolvendo a energia pro mesmo lugar de onde
saiu. Como terminal costuma ficar adjacente ao storage no stamp, o
round-trip inútil dava a impressão de estar mexendo no terminal também.

Corrigido: `essentialConsumer` agora exclui torre `sourceDefense`
(`isSourceDefenseTower`, a mesma checagem que `pickDeliver` já usa).
Também corrigido de passagem: `terminalWithdrawable`'s cache por tick
era uma única variável global, não por sala — um bot com mais de um
terminal só atualizava o ledger de uma sala por tick.

`test/smoke.js`: nova asserção — torre `sourceDefense` sozinha (spawn
cheio, storage bem acima do piso) não desbloqueia storage como fonte.

### Correção: ledger do terminal por transação, não "nunca cresce"

O usuário corrigiu o design inicial do ledger: "se tiver recursos no
terminal que eu não coloquei, a prioridade máxima deve ser pegar esses
recursos". A primeira versão (`withdrawable` só encolhe, nunca cresce
sozinho) protegia **qualquer** aumento, inclusive os que não vieram de
depósito manual — na prática, nunca liberava nada, o que não é o que foi
pedido.

Redesenhado: `terminalWithdrawable` agora credita a fatia de um aumento
que uma **transação de entrada registrada** explica —
`Game.market.incomingTransactions` (cobre tanto um `Terminal.send` de
sala-irmã quanto uma ordem de mercado liquidada a favor da sala),
filtrando por `to === room.name`, `resourceType === RESOURCE_ENERGY` e
`time` mais novo que o do último check (`ledger.sinceTick`, pra nunca
contar a mesma transação duas vezes — `incomingTransactions` é um log
rolante dos últimos 100, não uma fila que esvazia ao ser lida). Um
aumento **sem** transação correspondente (arrastado à mão pela UI do
jogo) continua de fora — essa é a parte que o jogador já decidiu o
destino. Reduções (retirada do próprio hauler, `Terminal.send` de saída,
venda) encolhem o credenciado no mesmo tanto, como antes. `Game.market`
ausente nunca lança (trata como zero transações, constitution §3).

`test/smoke.js`: aumento sem transação correspondente continua
protegido; aumento com uma entrada em `Game.market.incomingTransactions`
batendo (sala, tipo, tick) é creditado e vira a prioridade máxima de
coleta do hauler no mesmo tick.

### Bug real #2: torre na "zona morta" entre os dois níveis do pickDeliver

Reportado pelo usuário: "meu hauler continua retirando do storage e
depositando no storage" — depois do bug #1 já corrigido, mesmo sintoma,
causa diferente.

`essentialConsumer` aceitava qualquer torre com `freeCapacity > 0`. Mas
`pickDeliver` só entrega numa torre em duas faixas: ≤50% cheia (reserva,
nível 1) OU mais de 5% livre (`toppingOffThreshold`, nível 4). Como
"≤50% cheia" sempre implica "mais de 5% livre", a união das duas faixas
colapsa numa só: **mais de 5% livre**. Uma torre na faixa que sobra —
entre 95% e ~100% cheia (ex.: 98%) — tem `freeCapacity > 0` (conta pro
`essentialConsumer`) mas não bate nenhuma das duas condições do
`pickDeliver`. Torres passam boa parte do tempo nessa faixa quase-cheia
(topadas periodicamente, drenando devagar) — não era uma corrida rara
entre haulers, era um round-trip que se repetia toda vez que essa fosse
a única "necessidade" da sala.

Corrigido: nova função `towerDeliverable(s)` — `!sourceDefense &&
freeCapacity > cap*toppingOffThreshold` — é exatamente a união das duas
faixas do `pickDeliver`, usada tanto por `essentialConsumer` quanto pelo
próprio nível 4 do `pickDeliver` (que antes tinha sua cópia própria do
mesmo teste) — agora as duas leituras não têm como divergir de novo,
mesmo princípio de `utils/rampartRepair.js` como fonte única de verdade.

`test/smoke.js`: torre a 98% cheia (zona morta) não desbloqueia storage
como fonte; torre a 90% cheia (fora da zona morta, controle) continua
desbloqueando.

### Bug real #3: baseline do terminal nunca reavaliada

Reportado pelo usuário (com screenshot): "o hauler continua ainda
retirando do storage e depositando no storage em vez de retirar do
terminal e depositar no storage" — depois dos bugs #1 e #2 já
corrigidos. Perguntei diretamente e o usuário confirmou: a energia já
estava no terminal **antes** desse recurso existir.

Causa: `terminalWithdrawable` só creditava a fatia de um *aumento* que
uma transação explicasse — mas o saldo que já estava lá na primeira vez
que o código olhou o terminal virava a baseline (`ledger.amount`) com
`withdrawable = 0`, e nunca mais era reavaliado, porque dali em diante
só *aumentos acima dessa baseline* entravam na conta. Um terminal que
já tinha saldo antes desse código rodar pela primeira vez ficava com
esse saldo preso pra sempre — não existe histórico de transação pra
justificar retroativamente algo que já estava lá.

Corrigido: a primeira observação agora credita o saldo existente como
**imediatamente retirável** (não dá pra saber a origem sem histórico, e
"protegido pra sempre" é pior que "liberado por padrão" quando a
alternativa é travar o recurso inteiro). Só increments *depois* dessa
primeira observação continuam exigindo transação. Adicionado console
`resetTerminalLedger(roomName)` (registrado em `utils/console.js`) pra
destravar um ledger que já ficou preso por uma versão anterior — apaga
`Memory.rooms[roomName].terminalLedger`, e a próxima observação
credita o saldo atual como baseline nova.

`test/smoke.js`: terminal com saldo existente, visto pela primeira vez,
já é retirável de cara; `resetTerminalLedger()` existe, limpa a Memory,
e o próximo tick credita o saldo atual.
