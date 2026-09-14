# 0064 — pré-cálculo de rota real (terreno) pro claimer, cacheado por viagem

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

O 0063 corrigiu o backtrack reativo (recuar de verdade quando uma sala prova
ser beco sem saída), mas o teste ao vivo do mesmo dia expôs um limite
estrutural do mecanismo reativo em si, não só do gatilho: mesmo com
`_routeAvoid` corretamente excluindo a sala ruim (`W1N49`) e recuando pra
`W1N50` (fronteira confirmada **aberta** por inspeção visual do terreno —
não era beco sem saída nenhum), o `creep.moveTo()` **nativo** voltou a
devolver `ERR_NO_PATH` a partir de `W1N50` mesmo assim. Causa:
`routeCostCallback` restringe o `PathFinder` nativo a um conjunto estreito
de salas (a rota escolhida por `Game.map.findRoute` + uma única camada de
vizinhos conhecidos — ROADMAP 0061). `Game.map.findRoute` só enxerga
adjacência de sala no grafo do mapa, nunca terreno real — então, quando o
caminho de verdade precisa de um desvio por qualquer sala **fora** desse
conjunto restrito (comum numa região cheia de parede natural, como o print
do usuário mostrou), o `PathFinder` nativo trava e devolve `ERR_NO_PATH` —
não porque o caminho não exista no mundo real, mas porque a busca foi
proibida de olhar pra lá.

Qualquer recorte no espaço de busca pode falsamente bloquear um caminho
real, então continuar reagindo (mais uma sala em `_routeAvoid`, mais um
recuo) só empurra o mesmo problema pra próxima sala — cada recuo custa
ticks reais de viagem, e o claimer é o pior caso possível pra isso:
`CREEP_CLAIM_LIFE_TIME` é 600 ticks fixos (não os 1500 normais,
ROADMAP 0033), e `claimRoom()` já recusa um alvo cuja estimativa de viagem
(hops × `claim.ticksPerRoomHop`) não caiba num orçamento com margem. Cada
recuo reativo é ticks que esse orçamento não tinha de sobra.

## Desired outcome

Antes de depender só da correção reativa, o `reserver` em missão `"claim"`
valida a rota de verdade **uma vez**, no início da viagem, com um
`PathFinder.search` de terreno real (`Game.map.getRoomTerrain`, disponível
mesmo sem visão — ao contrário de `Game.map.findRoute`, que só conhece
adjacência) — não uma busca por creep por sala entrada (o padrão que
esvaziava o bucket de CPU e foi revertido antes), mas **uma** busca no
início da viagem, cacheada em `creep.memory` pro resto dela. Se essa busca
confirma uma sequência de salas realmente andável, `moveToRoom` usa essa
sequência (não mais `Game.map.findRoute`) pra restringir o `PathFinder`
nativo tick a tick — então o conjunto de salas permitido é um caminho
**confirmado**, não um palpite de grafo. Se a busca falhar (incompleta,
sem `PathFinder` suficiente, ou sala genuinamente inalcançável), cai de
volta pro fluxo `findRoute`/backtrack reativo (0063) de sempre — sem
regressão pra quem não usa essa opção. Se a sequência cacheada, mesmo
validada, provar errada na prática (ex.: construção nova bloqueando uma
tile que não existia quando a busca rodou), o backtrack reativo do 0063
continua como rede de segurança: descarta o cache e volta pro fluxo
normal pro resto da viagem, em vez de tentar remendar o cache no meio do
caminho.

## In scope

- `src/utils/routing.js`:
  - `computeRealRoute(fromPos, toRoomName, opts)` (nova): um único
    `PathFinder.search(fromPos, {pos: centro de toRoomName, range: 20}, ...)`
    com `roomCallback` que exclui (`false`) qualquer sala em `opts.avoid`
    ou (com `opts.blockHostiles`) com hostil conhecido
    (`rooms/remotes.hasHostiles`) — toda outra sala usa só o custo de
    terreno padrão (`Game.map.getRoomTerrain`, sem estruturas: não temos
    visão da maioria das salas do caminho, mesma limitação que
    `Game.map.findRoute` já tinha). `maxRooms`/`maxOps` generosos
    (`routing.realRouteMaxRooms`/`realRouteMaxOps` em `config.js` — a
    busca roda só uma vez por viagem, não por tick, então pode gastar mais
    orçamento que o `findPath` de `utils/move.js`). Reduz o `path` (tiles)
    resultante pra uma sequência de nomes de sala (dedup consecutivo,
    excluindo a própria sala de origem). Devolve `null` se a busca vier
    `incomplete` ou vazia — nunca lança, nunca é a única fonte de verdade.
  - `moveToRoom(creep, toRoomName, opts)` ganha `opts.realRoute` (bool,
    default `false` — opt-in, só quem precisa paga o custo do
    `PathFinder.search`). No início de uma viagem nova (mesmo gatilho que
    já zera `_routeStack`), com `opts.realRoute` true, chama
    `computeRealRoute` e cacheia o resultado (se não-nulo) em
    `creep.memory._realRoute` (a sequência inteira validada) +
    `creep.memory._realRouteDest` (pra saber quando a viagem muda). Tick a
    tick, enquanto `_realRoute` existir: em vez de `findRoute(...)`, monta
    o `route` (mesmo formato `{room}[]` que `routeCostCallback` já
    consome, reaproveitado sem mudança nenhuma) cortando `_realRoute` a
    partir da posição atual do creep dentro da sequência cacheada.
    `retreatFrom()` (0063) descarta `_realRoute`/`_realRouteDest` sempre
    que dispara — a partir daí a viagem cai pro `findRoute`/backtrack
    reativo normal, sem tentar remendar o cache.
- `src/rooms/remotes.js`: `isForeignOwned(roomName)` (correção do mesmo
  dia, ver abaixo) — sala com dono conhecido, diferente de nós e fora da
  lista de aliados (`utils/hostiles.isAlly`).
- `src/utils/routing.js`: `isDangerousRoom(roomName)` (correção do mesmo
  dia) — `hasHostiles(roomName) || remotes.isForeignOwned(roomName)`,
  usado por `findRoute`, `routeCostCallback` e `computeRealRoute` em vez
  de `hasHostiles` puro.
- `src/utils/config.js`: `routing.realRouteMaxRooms` (default 64, o teto
  do próprio `PathFinder.search`), `routing.realRouteMaxOps` (default alto
  o bastante pra uma viagem inter-sala longa, já que só roda uma vez).
- `src/roles/reserver.js`: a chamada de `routing.moveToRoom` na missão
  `"claim"` passa `realRoute: true`. `"reserve"`/`"contest"` continuam sem
  a opção — fora de escopo aqui (ver abaixo).
- `test/smoke.js`: novas assertions pra `computeRealRoute` (exclui
  `avoid`/hostil, reduz tiles pra sequência de sala, `null` em busca
  incompleta) e pro `moveToRoom` usando o cache em vez de `findRoute`
  quando `opts.realRoute` está ligado, incluindo o descarte do cache
  quando `retreatFrom` dispara mesmo assim.

## Out of scope

- `"reserve"`/`"contest"` ganharem `realRoute: true` — reserve mira alvo
  tipicamente próximo (poucos hops) e já é frequente (um `PathFinder.search`
  por creep novo se acumularia); contest já espera morrer no meio do cerco
  e respawnar (0046) — nenhum dos dois tem o mesmo aperto de ticks que
  `"claim"` (`CREEP_CLAIM_LIFE_TIME`=600, fixo). Fica pra um follow-up se
  o usuário pedir.
- Cachear a rota real por MISSÃO (`Memory.claimTarget`) em vez de por
  CREEP (`creep.memory`) — evitaria recalcular se o claimer morrer e for
  substituído, mas `claimRoom()` já é raro/manual e o abandono-por-morte
  do 0035 torna reposição de claimer incomum o bastante pra não valer a
  complexidade extra agora.
- Incorporar estruturas (roads/walls de outro jogador) na busca de
  terreno — só terreno natural, mesma limitação que `Game.map.findRoute`
  já tinha pra salas sem visão; um pré-cálculo perfeito exigiria visão de
  toda sala no caminho, o que anularia o ponto de calcular ANTES de
  chegar lá.
- ~~Recalcular a rota real no meio da viagem se o cache for descartado~~
  **revisto no mesmo dia** — decisão original era cair pro
  `findRoute`/backtrack reativo (0063) pro resto da viagem sem tentar uma
  segunda busca de terreno; teste ao vivo mostrou que isso reintroduz
  exatamente o bug que o 0064 existe pra resolver (ver "Correção no mesmo
  dia" abaixo). Agora recalcula a cada recuo concluído, não só uma vez no
  início.

## Acceptance criteria

1. `computeRealRoute` exclui toda sala em `opts.avoid` da busca —
   `test/smoke.js`: "computeRealRoute excludes every room in opts.avoid".
2. Com `opts.blockHostiles`, exclui toda sala com hostil conhecido —
   `test/smoke.js`: "computeRealRoute excludes known-hostile rooms under
   blockHostiles".
3. Reduz o `path` de tiles devolvido pelo `PathFinder.search` pra uma
   sequência de nomes de sala, sem repetir a mesma sala em sequência —
   `test/smoke.js`: "computeRealRoute collapses the tile path into a
   deduped room sequence".
4. Uma busca `incomplete` (ou vazia) devolve `null`, nunca lança —
   `test/smoke.js`: "computeRealRoute returns null when the search comes
   back incomplete".
5. `moveToRoom(creep, to, {realRoute: true})` computa e cacheia
   `creep.memory._realRoute` só uma vez por viagem (não recalcula tick a
   tick) — `test/smoke.js`: "moveToRoom computes the real route once per
   trip, not once per tick".
6. Com `_realRoute` presente, o `route` alimentado em `routeCostCallback`
   vem do cache (fatiado a partir da sala atual do creep), não de
   `Game.map.findRoute` — `test/smoke.js`: "moveToRoom uses the cached
   real route instead of calling findRoute while one is active".
7. Se `retreatFrom()` disparar mesmo com `_realRoute` ativo, o cache é
   descartado e a viagem volta a usar `findRoute` normalmente dali em
   diante — `test/smoke.js`: "a confirmed dead end discards the cached
   real route and falls back to findRoute-based routing".
8. Sem `opts.realRoute` (default), `moveToRoom` se comporta exatamente
   como antes do 0064 — nenhuma assertion nova quebra as existentes do
   0057-0063 (verificação: suite completa continua verde).
9. `computeRealRoute` retornando `null` (busca incompleta) não impede a
   viagem — `moveToRoom` cai pro `findRoute` normal no mesmo tick, sem
   erro — `test/smoke.js`: "a failed real-route precompute falls back to
   normal findRoute-based routing instead of blocking the trip".
10. `rooms/remotes.isForeignOwned(roomName)` é `true` só quando a sala tem
    dono conhecido, diferente do próprio jogador e fora da lista de
    aliados — `test/smoke.js`: "a room owned by someone else's empire is
    foreign-owned, even with zero enemies seen" + "an ally's own room is
    exempt" + "an unowned room is never foreign-owned" + "no intel at all
    for a room is never foreign-owned".
11. `findRoute`/`routeCostCallback`/`computeRealRoute` tratam sala de dono
    estrangeiro (`isForeignOwned`) exatamente como sala de creep hostil
    visto (`hasHostiles`) — penalidade normal, exclusão total sob
    `blockHostiles` — via `isDangerousRoom(roomName)` compartilhado —
    `test/smoke.js`: "a foreign-owned room stacks the same penalty as a
    known-hostile room" + "blockHostiles excludes a foreign-owned room
    outright too" + "computeRealRoute excludes a foreign-owned room
    outright".
12. Sala de aliado nunca é excluída só por posse — `test/smoke.js`: "an
    ally's room is never excluded by blockHostiles just because they own
    it" + "computeRealRoute never excludes an ally's own room just
    because they own it".
13. `moveToRoom(creep, to, {realRoute: true})` revalida contra terreno
    real ao concluir cada recuo (não só uma vez no início da viagem) —
    `test/smoke.js`: "a completed retreat re-validates the rest of the
    trip against real terrain again, not just once at the start".
14. A chamada principal de `creep.moveTo()` dentro de `moveToRoom` recebe
    `maxOps` (`routing.moveMaxOps`, default 20000) — nunca cai no default
    silencioso do motor (2000) — `test/smoke.js`: "moveToRoom()'s main
    routed moveTo() call gets routing.moveMaxOps, not the engine's silent
    2000 default".
15. A mesma chamada também recebe `maxRooms` (`routing.moveMaxRooms`,
    default 64) — nunca cai no default silencioso do motor (16) —
    `test/smoke.js`: "moveToRoom()'s main routed moveTo() call gets
    routing.moveMaxRooms, not the engine's silent 16 default".
16. Quando `computeRealRoute` não acha nenhuma rota completa evitando
    `_routeAvoid` na conclusão de um recuo, `findRoute()` nunca é chamado
    e a sala atual nunca é adicionada a `_routeAvoid` — o creep só recua
    mais uma sala (`retreatWithoutBlame`) — `test/smoke.js`: "when
    computeRealRoute finds nothing, findRoute() is never called at all" +
    "the current room (W3N51) is NOT added to _routeAvoid" + "instead, it
    retreats one more hop to the room before it in its own real history".
17. `avoidCostCallback(avoid, opts)` exclui só sala em `avoid` (e hostil
    sob `blockHostiles`) — toda outra sala fica aberta, nunca lança sem
    argumentos — `test/smoke.js`: "avoidCostCallback excludes a room in
    the avoid list outright" + "avoidCostCallback leaves every other room
    open" + "avoidCostCallback also excludes a known-hostile room under
    blockHostiles" + "avoidCostCallback is safe to call with no avoid
    list/opts at all".
18. Enquanto uma `_realRoute` validada está guiando a execução,
    `moveToRoom()` usa `avoidCostCallback` (lista de bloqueio) em vez de
    `routeCostCallback` (lista de permissão) — uma sala fora da sequência
    da rota cacheada continua permitida, só `opts.avoid` exclui algo de
    verdade — `test/smoke.js`: "a room OUTSIDE the cached real route
    sequence is still allowed" + "opts.avoid still excludes a room
    outright under the blocklist-based callback".

## Constitution check

- **CPU:** o único gasto novo é **um** `PathFinder.search` por viagem
  (não por tick, não por sala entrada) — ordem de grandeza completamente
  diferente da tentativa revertida antes (scout ciclando várias salas
  candidatas, várias buscas por tick). `claimRoom()` já é uma ação manual
  e rara; o custo é pago uma vez, na primeira chamada de `moveToRoom` da
  viagem.
- **Memory:** dois campos novos por creep (`_realRoute`, array de nomes
  de sala; `_realRouteDest`, string) — mesma escala de `_routeStack`/
  `_routeAvoid`, morrem com o creep.
- **Fail-soft:** `computeRealRoute` nunca lança (busca incompleta ou
  vazia devolve `null`, tratado explicitamente); sem `opts.realRoute`
  nada muda; com ele, uma falha de validação cai pro comportamento já
  existente (`findRoute` + backtrack reativo do 0063).
- **Testável offline:** `PathFinder.search` já é mockável no harness
  existente (o smoke test já sobrescreve `Game.map.findRoute`/
  `PathFinder.search` em vários pontos); nenhuma dependência de
  comportamento real do motor além do que já é simulado.

## Correção no mesmo dia: dono da sala importa tanto quanto creep hostil

Usuário testou ao vivo e reportou o claimer entrando numa sala que ele
chamou de "inimiga" — bloqueado por muro/rampart que o dono já tinha
construído, tendo que recuar de volta em direção à origem. Causa:
`rooms/remotes.hasHostiles(roomName)` (usado por `findRoute`,
`routeCostCallback` e `computeRealRoute` pra decidir o que `blockHostiles`
exclui) só olha `Memory.rooms[x].enemies > 0` — presença de creep hostil
**visto**, nunca posse da sala. Uma sala de outro jogador com muro/rampart
já construídos bloqueia do mesmo jeito, com zero creeps precisando estar
lá pra isso — e nem o pré-cálculo de terreno (0064 original) nem o
`findRoute` viam esse tipo de perigo.

(Correção de rota no meio da mesma conversa: o usuário esclareceu que a
sala específica do teste era na verdade de um **aliado**, com vários
creeps — não uma sala genuinamente inimiga. Isso não muda o fix abaixo,
que continua certo pra sala de dono desconhecido/hostil de verdade — só
confirma que sala de aliado é, de propósito, um caso à parte: ver
`isForeignOwned` abaixo isenta aliados explicitamente, e o obstáculo
interno de uma sala de aliado continua sendo trabalho do backtrack
reativo do 0063, não desse pré-check.)

Fix: `rooms/remotes.js` ganha `isForeignOwned(roomName)` — `true` quando
`Memory.rooms[x].owner` existe, não é o próprio jogador (`myUsername()`)
e não está na lista de aliados (`utils/hostiles.isAlly`). `utils/
routing.js` ganha `isDangerousRoom(roomName)` (`hasHostiles(roomName) ||
isForeignOwned(roomName)`), usado nos três pontos que antes só liam
`hasHostiles` direto: `findRoute`'s `routeCallback` (penalidade normal +
exclusão total sob `blockHostiles`), `routeCostCallback`'s folga de
vizinhos, e `computeRealRoute`'s `roomCallback`. `global.routeCheck`
(console) também passa a reportar sala de dono estrangeiro junto com sala
de creep hostil visto.

Generalizar pra "todo tipo de estrutura" (torres, extensions, etc., não só
muro/rampart) pra sala que a gente JÁ TEM visão continua fora de escopo
por enquanto — decisão explícita, ver "Out of scope" abaixo. Excluir a
sala inteira quando ela é de outro jogador (este fix) resolve o caso mais
comum e mais barato de acertar; incorporar estrutura conhecida no
`CostMatrix` do `computeRealRoute` pra sala com visão fica pra um
follow-up se o usuário pedir.

## Out of scope

- Incorporar estrutura conhecida (torre, extension, etc. — não só muro/
  rampart) no `CostMatrix` do `computeRealRoute` pra sala que já temos
  visão (a própria sala de origem, ou uma sala aliada/neutra já
  escoltada). `isForeignOwned` (acima) cobre o caso mais comum — sala de
  outro jogador excluída inteira — sem precisar modelar estrutura por
  estrutura; o caso restrito de sala aliada/neutra com estrutura própria
  bloqueando continua coberto só pelo backtrack reativo (0063), não por
  validação antecipada.

## Correção no mesmo dia: revalidar terreno real a cada recuo, não só uma vez

Usuário testou de novo, dessa vez batendo direto no caso que `isForeignOwned`
deixa de propósito pro backtrack reativo: um claimer entrou na sala de um
**aliado** (isenta da exclusão de dono estrangeiro), achou um obstáculo
interno de verdade lá (não visível pro `computeRealRoute`, que só vê
terreno), e `retreatFrom()` (0063) corretamente descartou o `_realRoute`
cacheado e recuou pra sala anterior. Até aqui, certo. Só que dali em
diante a viagem inteira passou a depender só do `findRoute`/
`routeCostCallback` reativo de sempre — e o usuário reportou exatamente o
mesmo sintoma que motivou o 0064 originalmente: o creep, de volta em
`W1N50`, devia ir pra `W0N50` (fronteira já confirmada aberta) e em vez
disso recuou de novo, mais uma sala pra trás.

Causa: `computeRealRoute` só era chamado **uma vez**, no exato início da
viagem inteira (dentro do bloco que reseta `_routeStack` quando o destino
muda). Depois do primeiro beco sem saída descartar `_realRoute`, nada
nunca mais tentava validar contra terreno real de novo — o resto da
viagem inteira ficava preso no mecanismo estreito que o 0064 existe pra
contornar. A decisão original de "não recalcular no meio da viagem"
(`Out of scope` acima, agora riscada) parecia razoável olhando só pro
custo de CPU, mas na prática devolvia o creep pro exato bug que motivou
o spec inteiro, só que numa sala diferente a cada recuo.

Fix: `tryComputeRealRoute(creep, toRoomName, opts)` (nova, extraída do
bloco que já existia) roda em DOIS pontos agora, não um: no início da
viagem (como antes) **e** toda vez que um recuo termina (`creep.room.name
=== creep.memory._routeRetreatTo`, o mesmo ponto onde `_routeRetreatTo` é
limpo) — cada recuo concluído é uma nova "perna" da viagem, partindo de
chão confirmado bom, com a sala que causou o recuo já corretamente em
`_routeAvoid`; exatamente o momento certo de revalidar o resto contra
terreno real de novo. Isso é limitado pelo número de becos sem saída
que o creep realmente encontra (finito, tipicamente pequeno) — não é uma
busca por tick, continua sendo o mesmo perfil de custo "uma vez por
perna" que já justificava o 0064 original, só que agora "perna" quer
dizer "trecho entre recuos", não "a viagem inteira".

## Correção no mesmo dia: `maxOps` nunca chegava no `moveTo()` nativo

Usuário testou de novo com o fix acima já no ar e, dessa vez, com log de
diagnóstico ligado (`console.log` em `retreatFrom`/`tryComputeRealRoute`,
adicionado nesse mesmo teste pra parar de adivinhar por dump de memory).
O log mostrou algo direto: `tryComputeRealRoute` **achava** uma rota real
válida (`W1N50->E1N45 avoid=[W1N49]: found 8 hop(s): W0N50 -> ...`), e
mesmo assim o `retreatFrom` disparava de novo poucos ticks depois,
confirmando a MESMA sala (`W1N50`) como beco sem saída — apesar da rota
validada dizer o contrário. Um segundo teste (rota de 23 saltos,
`avoid=[W1N49,W1N50]`) reproduziu o mesmo padrão, reforçando a causa.

Causa: `computeRealRoute` roda com `maxOps: 200000` (generoso, só uma vez
por perna). Mas a chamada de `creep.moveTo()` **nativa** — a que executa
o movimento de verdade a cada tick, usando exatamente essa rota validada
via `routeCostCallback` — nunca recebia esse `maxOps`; montava seu próprio
objeto de opções do zero (`{range, reusePath, costCallback}`), caindo no
default silencioso do motor (2000). `W1N50`/`W2N50` têm bastante parede
natural espalhada (confirmado olhando o terreno direto) — navegar da
posição atual do creep até o próximo salto validado podia custar mais que
2000 ops mesmo com a sala certa, produzindo `ERR_NO_PATH` por
insuficiência de orçamento, não por rota errada.

Fix: `moveOpts` (o objeto base reusado por todas as chamadas de `moveTo`
nativas dentro de `moveToRoom`) ganha `maxOps: config.get("routing.
moveMaxOps", 20000)`; a chamada principal (que antes montava seu próprio
objeto sem herdar `moveOpts`) passa a incluir `maxOps: moveOpts.maxOps`
explicitamente. Menor que `realRouteMaxOps` de propósito — essa roda por
tick sempre que um path precisa ser recalculado (não só uma vez por
perna), então continua sendo um teto, não um gasto de rotina.

## Correção no mesmo dia: `maxOps` sozinho não bastava — faltava `maxRooms`

Usuário testou de novo com o fix de `maxOps` já deployado (confirmou
resincronizar antes do teste) e reproduziu o **mesmo** padrão, quase no
mesmo timing: `tryComputeRealRoute` achava a rota de 8 saltos por
`W0N50`, e `retreatFrom` confirmava `W1N50` como beco sem saída poucos
ticks depois mesmo assim. `maxOps` sozinho não era a causa completa.

Causa: `routeCostCallback`'s conjunto "allowed" (a rota + os vizinhos
conhecidos de cada salto como folga, ROADMAP 0061) pode facilmente passar
das 16 salas — o default silencioso de `maxRooms` do motor, nunca setado
por nós. `maxRooms` é um teto rígido de quantas salas o `PathFinder`
pode **visitar** durante a busca, independente de quantos ops ainda
sobrem — uma rota validada de 8+ saltos, com folga de vizinhos somada,
passa fácil desse teto, então a busca nunca completa não importa quanto
`maxOps` sobre.

Fix: `moveOpts` ganha `maxRooms: config.get("routing.moveMaxRooms", 64)`
(o teto do próprio motor — mesmo valor de `realRouteMaxRooms`); a
chamada principal ganha `maxRooms: moveOpts.maxRooms` explicitamente
(mesmo padrão do fix de `maxOps`). De quebra, log de diagnóstico novo
(`[routing] ... confirmed no path this leg - route was [...], avoid=[...]`)
bem no ponto onde `retreatFrom` é decidido disparar, pra próxima rodada
de teste não precisar de mais um round-trip só pra coletar mais um dado.
Ampliado ainda no mesmo dia, a pedido do usuário ("pode colocar bastante
log, só não quero que fique infinitamente nisso"): o log passou a
disparar em TODO tick que falhar (não só na confirmação do recuo), e
`routeCostCallback` passou a expor `fn.allowedRooms` (o próprio `Set`) pra
log mostrar a contagem real de salas permitidas naquele tick, em vez de
inferir de `route.length`.

## Correção no mesmo dia: `computeRealRoute` falhando caía pro `findRoute()` não validado

Usuário mandou um trace completo (do spawn até o creep morrer de TTL) e
apontou, corretamente, que o recuo "parecia lógica errada, voltando e
voltando pra origem". Análise do trace confirmou: **é um bug de verdade**,
não geografia difícil como a correção anterior supôs.

Sequência exata (nomes reais do trace): o claimer atravessa de `W3N51` até
quase o destino, entra em `E1N46` (sala de aliado, rampart nas 4 bordas —
confirmado por print do usuário), recua corretamente pra `E0N46` — até
aqui certo. Mas dali em diante, **toda** revalidação seguinte
(`tryComputeRealRoute` a cada recuo) achava uma rota real válida
(`E0N45→E1N45`, depois um desvio de 5 saltos, depois 4) e **mesmo assim**
a execução falhava de novo, recuando mais uma sala — até que em `W1N50`,
`tryComputeRealRoute` finalmente devolveu `NONE` (a lista de exclusão já
tinha 7 salas, grande demais pro `computeRealRoute` achar QUALQUER rota
completa mesmo com 200000 ops / 64 salas de orçamento). Nesse ponto, o
código caía de volta pro `findRoute()` **puro** — o mecanismo antigo, só
grafo de sala, zero validação de terreno, exatamente o que o 0064 inteiro
existe pra substituir. `findRoute()` devolveu uma sequência de **36
saltos**, nunca validada, que obviamente falhou na execução — e `W1N50`
(uma sala que já tínhamos CONFIRMADO aberta antes, e que o usuário
confirmou de novo por print da `E0N46` limpa) foi banida permanentemente
por uma falha que não era dela. Isso se repetiu em `W2N50`, cada recuo
sem culpa cavando a lista de exclusão mais fundo e forçando desvios cada
vez maiores, até o `CREEP_CLAIM_LIFE_TIME` acabar.

Usuário também mandou prints do mapa mostrando setas de caminho livre
contornando o cluster fortificado (as duas salas de dono + a xadrez) —
confirmando visualmente que EXISTE rota livre nessa vizinhança, só que o
código estava fechando ela sozinho ao culpar salas inocentes.

Fix: quando `computeRealRoute` (chamado por `tryComputeRealRoute` na
conclusão de um recuo) não acha **nenhuma** rota completa evitando
`_routeAvoid`, isso NÃO é evidência de que a sala atual é um beco sem
saída — ela nunca chegou a ser tentada de verdade. `retreatWithoutBlame()`
(nova, compartilha `popStackAndRetreat()` com `retreatFrom()`) recua mais
uma sala, na mesma disciplina de uma-sala-por-vez, **sem** adicionar a
sala atual em `_routeAvoid` — e crucialmente, **nunca chama `findRoute()`
nem executa `moveTo()` com uma rota não validada** nesse caso. Só cai no
fallback antigo (`findRoute()`) quando não sobra nenhuma sala anterior pra
recuar (a própria origem da viagem) — o mesmo caso-base de sempre.

## Correção no mesmo dia (a causa raiz de verdade): `routeCostCallback` era lista de permissão, devia ser lista de bloqueio

Mesmo com `retreatWithoutBlame()` no ar, o usuário reportou o MESMO padrão
de novo — salas boas (`E0N46`, `E0N47`, `W0N47`, `W0N48`) sendo culpadas
via `retreatFrom` (não `retreatWithoutBlame` — ou seja, `computeRealRoute`
achava rota, mas a execução falhava mesmo assim). Print por print, o
usuário confirmou `E0N46` (sem dono — não pode ter rampart, regra do
próprio jogo), `E0N45` e `W0N45` genuinamente limpas. Com toda sala da
cadeia limpa e a execução ainda falhando, a causa só podia estar no
código, não no mundo — e o usuário pediu um teste decisivo em vez de mais
uma suposição.

Teste no console (usuário, sem nenhum código nosso no meio): um
`PathFinder.search` cru, a partir da posição REAL do creep, só excluindo
`E1N46` (`roomCallback: (roomName) => (roomName === "E1N46" ? false :
undefined)`), achou um caminho **completo em 1313 ops**, passando
exatamente pelas salas que o `moveToRoom` vinha culpando:
`W0N50,W0N49,W0N48,W0N47,E0N47,E0N46,E0N45,E1N45`. Prova definitiva: o
mundo está perfeito, o bug é nosso.

Causa raiz: `routeCostCallback` (ROADMAP 0061) é uma **lista de
permissão** — só as salas exatas da sequência de `_realRoute` mais UMA
camada de vizinhos conhecidos como folga; toda sala fora disso é
bloqueada incondicionalmente. `computeRealRoute` (o que validou a rota
originalmente) é o oposto — uma **lista de bloqueio**: só exclui
`opts.avoid`/hostil, toda outra sala fica livre (é literalmente o
`roomCallback` que o teste do usuário reproduziu manualmente). Então uma
sequência de sala que o `computeRealRoute` valida como andável ainda pode
ficar inalcançável pela lista de permissão, se o caminho real de tile
precisar serpentear por qualquer sala que não seja a sequência exata ou
vizinha direta dela — o que terreno de verdade, cheio de labirinto de
parede natural, faz com frequência. A folga de uma camada (0061) era uma
proteção contra exatamente isso, e não bastava.

Fix: `avoidCostCallback(avoid, opts)` (nova) — mesma lógica de exclusão
que o `roomCallback` do `computeRealRoute` já usa (só `avoid`/hostil sob
`blockHostiles`, tudo mais aberto), só que no formato de `costCallback`
que o `moveTo` nativo espera. `moveToRoom()` agora usa essa função em vez
de `routeCostCallback` sempre que o `route` vem de uma `_realRoute`
validada (rastreado por uma nova flag `usingRealRoute`) — confiando na
validação já feita, com a MESMA liberdade que permitiu achá-la.
`routeCostCallback` (lista de permissão) continua reservada só pro
fallback de `findRoute()` puro (uma rota nunca checada contra terreno,
onde manter perto do palpite de grafo ainda faz sentido).

## Estado atual (2026-09-14): o que é sabido, suposto e não-sabido

Depois de cinco correções no mesmo dia (recuo real, gatilho por
`ERR_NO_PATH`, `isForeignOwned`, `_routeAvoidSeenLen`, `maxOps`+`maxRooms`)
o usuário pediu pra fechar por ora ("por hora vou me contentar com a
missão cumprindo, mas isso vai vir a tona no futuro") — registro honesto
do estado, pra não fingir uma certeza que não existe:

**Sabido** (confirmado por leitura de código e/ou teste ao vivo com log):
- `computeRealRoute` e a `routeCostCallback` da chamada nativa de `moveTo`
  nunca leem estrutura (`room.find(FIND_STRUCTURES)`) — só terreno — em
  NENHUMA sala, nem a que o creep está parado agora com visão plena.
- ~~`retreatFrom()` (0063) sempre culpa a sala em que o creep ESTÁ no
  momento do recuo — sem distinguir "essa sala é topologicamente ruim
  de verdade" de "a execução do `moveTo` falhou por outro motivo" (ponto
  levantado pelo usuário ao vivo). Isso não foi corrigido nesta sessão.~~
  **causa raiz achada e corrigida** (ver "Correção no mesmo dia: a causa
  raiz de verdade" acima): a execução falhava não por a sala estar
  realmente ruim, mas porque `routeCostCallback` (lista de permissão)
  recusava salas que `computeRealRoute` (lista de bloqueio) já tinha
  validado como abertas — confirmado com `PathFinder.search` cru do
  usuário no console achando o caminho exato em 1313 ops. Fix:
  `avoidCostCallback`, uma lista de bloqueio usada sempre que a execução
  é guiada por uma `_realRoute` validada.
- `maxOps` sozinho (2000 → 20000) NÃO resolveu o sintoma reproduzido ao
  vivo — reteste confirmado com resync, mesmo padrão de recuo indevido
  de `W1N50` mesmo com o fix já deployado. (Esperado, em retrospecto: o
  gargalo real era a lista de permissão, não o orçamento de busca.)
- A folga de vizinhos do `routeCostCallback` (ROADMAP 0061) pode fazer o
  `PathFinder` nativo preferir um caminho diferente da sequência exata
  validada por `computeRealRoute` (ex.: `W3N51→W2N51→W2N50` em vez de
  `W3N51→W3N50→W2N50`) — isso é o mecanismo funcionando como desenhado,
  não um bug.

**Evidência bruta** (log ao vivo real, não parafraseado — geografia:
`W3N51` é a sala-mãe própria; `E1N45` o alvo do claim; `W1N49`, sala do
aliado `Netloc`, é onde trava; `W1N50`/`W2N50`/`W3N50` são o corredor
entre elas):

```
[routing] tryComputeRealRoute <creep> W1N50->E1N45 avoid=[W1N49]: found 8 hop(s): W0N50 -> W0N49 -> W0N48 -> W0N47 -> E0N47 -> E0N46 -> E1N46 -> E1N45
[routing] retreatFrom <creep>: W1N50 confirmed a dead end (_routeStack was [W3N51,W3N50,W2N50,W1N50])
[routing] retreatFrom <creep>: _routeAvoid=[W1N49,W1N50], retreating to W2N50
```

Isso foi capturado ANTES do fix de `maxOps`/`maxRooms` (só tinha o log,
não os fixes de orçamento ainda) — mostra a revalidação achando uma rota
válida e o recuo disparando de novo poucos ticks depois mesmo assim, a
prova direta que motivou investigar orçamento de busca em vez de lógica
de rota. Depois do fix de `maxOps` sozinho, o MESMO padrão se repetiu
(mesmas salas, timing quase idêntico) — só depois do fix de `maxRooms`
(ainda não confirmado se foi ele ou coincidência de rota, ver "Suposto"
abaixo) que o padrão parou de aparecer num teste.

**Suposto** (raciocínio com base técnica real, mas sem confirmação
definitiva por teste): `maxRooms` (nunca setado antes, default do motor
16) também estava insuficiente, somando com `maxOps` — a mecânica é real
(`allowed` pode passar de 16 salas fácil com a folga de vizinhos de uma
rota de 8+ saltos) e o fix foi aplicado, mas o teste ao vivo seguinte ao
fix **não voltou a entrar em `W1N49`** — a busca, com mais orçamento,
achou uma rota alternativa (`W2N51`/`W0N50`, folga do 0061) sem nunca
precisar do cenário de recuo que estávamos tentando validar. Não dá pra
distinguir, com o que foi observado, se o fix resolveu o cenário original
ou se a busca só achou um caminho melhor dentro do MESMO conjunto sempre
permitido, por coincidência de custo em distância de tile. **Atualização
posterior**: com a causa raiz real identificada (lista de permissão vs.
bloqueio, ver acima), esse "não dá pra distinguir" perde importância —
`maxRooms` provavelmente ajudou marginalmente (mais salas consideradas),
mas o motivo dominante da falha de execução era a lista restritiva,
independente de orçamento. Continua sem teste isolado que separe as duas
contribuições, mas não é mais um ponto crítico em aberto.

**Não sabido** (em aberto, sem teste que confirme ou refute):
- ~~Se o fix de `maxOps`+`maxRooms` de fato resolve o cenário original~~
  **respondido** (trace completo do vivo, ver "Correção no mesmo dia"
  logo abaixo): não resolvia sozinho — a causa real nesse trace específico
  nem era orçamento (`allowedRooms` sempre pequeno, 5-19 salas), era
  `computeRealRoute` genuinamente não achando rota alguma depois que
  `_routeAvoid` cresceu demais, caindo pro `findRoute()` não validado e
  culpando a sala errada. Corrigido com `retreatWithoutBlame()`.
- ~~Se `retreatFrom()` ainda culpa uma sala boa quando a causa real é
  orçamento insuficiente~~ **respondido, causa raiz achada de verdade**:
  não era orçamento — era `routeCostCallback` sendo uma lista de
  **permissão** (só a sequência exata + 1 camada de folga) em vez de
  lista de **bloqueio** (só exclui `avoid`/hostil) como o `computeRealRoute`
  que validou a rota. Provado com um `PathFinder.search` cru do usuário no
  console, achando em 1313 ops o caminho exato que o `moveToRoom` vinha
  recusando. Corrigido com `avoidCostCallback` (ver "Correção no mesmo
  dia" acima) — `retreatFrom()` em si não mudou, mas o motivo dela disparar
  incorretamente (execução falsa negativa por lista restritiva demais)
  foi eliminado.
- Se/quando o creep encontrar uma sala com obstrução estrutural de
  verdade de novo (a raiz do problema, nunca resolvida: nem
  `computeRealRoute` nem `routeCostCallback` sabem de muro/rampart), o
  comportamento observado deve ser: recuo correto (0063) seguido de
  revalidação por terreno (0064) que, de novo, vai validar passando pela
  MESMA sala estruturalmente bloqueada (porque terreno não muda) — ou
  seja, o ciclo de recuo-e-revalidação deve se repetir de forma estável
  (sem travar pra sempre, graças ao 0063+0064), mas sem nunca aprender
  que aquela sala específica tem um problema estrutural permanente. Isso
  é esperado dado o estado atual do código, não uma regressão nova.
- **O obstáculo dentro de `W1N49` nunca foi confirmado como muro/rampart
  de verdade** — essa é uma suposição nossa (a mais óbvia, dado que é uma
  sala de aliado — `Netloc`, um dos aliados default de `utils/
  hostiles.js` — com creeps e RCL, presumivelmente com defesa construída),
  nunca verificada olhando o estado real da sala (precisaria de visão —
  scout, observer, ou o próprio usuário abrindo a sala no cliente). Pode
  ser outra coisa (um invader core, uma fila de creeps parados bloqueando
  fisicamente, etc.) — importa pra decidir a forma exata do fix de
  estrutura (`STRUCTURE_WALL`/`STRUCTURE_RAMPART` são o caso óbvio, mas
  não o único).
- ~~O aumento de `maxOps`/`maxRooms` é global, não só pro claimer~~
  **resolvido no mesmo dia**: o usuário perguntou diretamente se isso
  aumentava consumo de CPU e se valia pra todo `moveToRoom`. Resposta
  dada (e ainda válida como explicação técnica): um teto mais alto não
  força mais gasto por si só — `PathFinder` para assim que acha a
  resposta, o teto só permite mais busca nos casos que ANTES falhavam
  batendo nele; pros que já funcionavam, é de graça. Mesmo assim, sem
  evidência de que `raider`/`pioneer`/`scout`/`squad` precisassem disso, o
  usuário preferiu a opção mais conservadora: `moveOpts.maxOps`/
  `maxRooms` agora só são setados quando `opts.realRoute` é `true` (hoje,
  só a missão `"claim"`) — os outros chamadores continuam exatamente no
  default do motor (2000 ops / 16 salas), sem nenhuma mudança de
  comportamento pra eles. `test/smoke.js`: "with opts.realRoute,
  moveToRoom()'s main routed moveTo() call gets routing.moveMaxOps..." +
  "without opts.realRoute, maxOps/maxRooms are never set at all...".
- **Não existe teste automatizado pro ciclo completo** (creep entra numa
  sala com obstrução estrutural real, recua, revalida, tenta nova rota,
  sucede ou recua de novo em cascata) — os testes em `test/smoke.js`
  cobrem cada peça isolada (gatilho de recuo, revalidação por perna,
  `maxOps`/`maxRooms` passados, `isForeignOwned`) mas nenhum simula o
  cenário ponta-a-ponta que só existe em produção porque depende de
  estrutura real que o harness offline não modela. Se/quando a estrutura
  entrar no `computeRealRoute`, um teste desse formato (creep tenta sala
  com "estrutura" simulada, recua, revalida evitando-a) valeria a pena.

### Sugestão de próximo passo (não implementado, só um ponto de partida)

`utils/move.js`'s `roomMatrix(room)` já constrói um `CostMatrix` a partir
de `room.find` (estrada com desconto, container/rampart própria ou pública
andável, todo resto sólido 255) — mas só serve pra `travel()`, movimento
**dentro** da mesma sala, e só funciona pra uma sala com `Game.rooms[x]`
(visão ativa). Pra `computeRealRoute`/`routeCostCallback` aproveitarem
isso, precisariam de uma versão que: (a) só tenta construir o matrix pra
sala com `Game.rooms[roomName]` existente (visão ativa agora — não intel
velha de `Memory.rooms`, que não guarda posição de estrutura); (b) devolve
o matrix de terreno puro de sempre pra qualquer sala sem visão (a maioria
de uma viagem longa, limitação que não tem como contornar sem visão de
verdade); (c) precisaria ser chamada tanto no `roomCallback` do
`PathFinder.search` de `computeRealRoute` quanto no `costCallback` que
`routeCostCallback` devolve — hoje os dois só devolvem o `matrix` recebido
sem tocar (nota: a execução de rota validada hoje usa `avoidCostCallback`,
não `routeCostCallback` — ver "Correção no mesmo dia" acima — então essa
mudança valeria pros dois: `routeCostCallback` e `avoidCostCallback`),
então essa seria a mudança principal nos dois lugares.

Ver `ROADMAP.md`'s entrada "Later" (`computeRealRoute`/`routeCostCallback`
incorporarem estrutura conhecida) pro item que fica pendente de propósito
— com o histórico completo dessa investigação linkado lá também.

## Open questions

Nenhuma.
