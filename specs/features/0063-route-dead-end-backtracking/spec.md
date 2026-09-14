# 0063 — backtrack de verdade quando uma sala da rota é um beco sem saída

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Cinco specs seguidas (0057/0058/0060/0061/0062) tentaram consertar o mesmo
bug ao vivo relatado pelo usuário e nenhuma resolveu: um creep com destino
fixo (`utils/routing.js`'s `moveToRoom`) decide uma rota de sala em sala
(`A > B > C > E`, via `Game.map.findRoute`) e, ao entrar em `C`, descobre que
não existe caminho andável dali até `E` — `findRoute` só enxerga adjacência
de sala no grafo do mapa, nunca o terreno real da fronteira entre duas
salas (`ARCHITECTURE.md`'s nota em `routeCostCallback`), então um hop
"válido" no grafo pode ser impossível na prática. O esperado é o creep
voltar pra `B` e recalcular `B > D > E`. Na prática, ele fica preso na
divisa entre `B` e `C` — nunca completa o desvio.

Causa raiz, confirmada lendo como `Game.map.findRoute` funciona de verdade:
`routeCallback(roomName)` só é chamado para salas que a busca **considera
entrar** — nunca para a sala de onde a busca **parte**. Toda tentativa
anterior girava em torno de "quando o creep travar, empilha a sala atual
em `creep.memory._routeAvoid` e chama `findRoute`/`moveTo` de novo" — mas
essa chamada seguinte sempre parte da MESMA sala onde o creep travou (ele
não se moveu), então o próprio `avoid` daquela sala nunca é lido por
`routeCallback` nenhuma vez. Cada correção mudava outro detalhe (qual sala
detectar, blacklist global com TTL, lista por-creep, trilha de nome
A-B-A-B) sem nunca tocar nesse defeito: **avoidar a sala em que você está
não muda nenhuma decisão de rota computada a partir dela**. Isso explica
por que o usuário via o creep preso bem na fronteira `B`/`C` — o mecanismo
de "evitar" nunca teve efeito nenhum, então a mesma rota (inútil) era
recomputada pra sempre a partir de dentro do próprio beco sem saída.

O 0062 também tem um bug próprio, agora identificado: ao detectar um
"bounce" (creep cruzando a fronteira pra frente e pra trás sem nunca
congelar), ele empilhava as DUAS salas do padrão em `_routeAvoid` — mas uma
delas costuma ser o corredor seguro que o creep precisa atravessar pra
recuar (o próprio caso ao vivo documentado no 0061/0062: `W1N49`, sala de
aliado com interior fechado, e `W1N50`, o corredor na frente dela).
Avoidar as duas "pra ser seguro" pode envenenar a única rota de volta.

## Desired outcome

Um creep que descobre que a sala em que está é um beco sem saída em
relação ao destino atual **recua fisicamente** para a última sala que
sabe, pelo próprio histórico de onde já esteve, que ainda conecta a algum
lugar — nunca por geometria de nome de sala ou distância linear (as duas
formas que o 0061 já mostrou dar errado ao vivo) — e só DAÍ recalcula a
rota, agora com o beco sem saída genuinamente excluído (porque, a partir
da sala anterior, `routeCallback` de fato avalia essa sala como candidata).
`B > C > E` falhando em `C` vira `B > D > E`, andando por `B` de novo antes
de tentar `D`. Nenhuma sala além do beco sem saída em si é excluída — o
corredor de recuo nunca é sacrificado.

## In scope

- `src/utils/routing.js`:
  - `moveToRoom()` passa a registrar, por creep e por viagem (chave =
    destino atual), cada sala em que o creep realmente esteve
    (`creep.memory._routeStack`) — a viagem reinicia (stack e qualquer
    recuo em andamento zerados) sempre que o destino (`toRoomName`) muda
    em relação à última chamada, pra não misturar histórico de uma viagem
    anterior a um destino diferente (ex.: `utils/squad.js` manda o mesmo
    creep pro alvo e depois de volta pra `squad.from`).
  - `retreatFrom(creep)` (nova): ao disparar (ver gatilho abaixo) empilha
    a sala atual em `creep.memory._routeAvoid` (permanece por-creep, sem
    TTL — ROADMAP 0062), tira essa sala do topo de `_routeStack` e, se
    sobrar uma sala anterior na pilha, marca `creep.memory._routeRetreatTo`
    com ela.
  - `moveToRoom()` checa `_routeRetreatTo` antes de qualquer outra coisa
    (exceto o refuse-outright de destino já avoidado): enquanto o creep
    não estiver de volta naquela sala, anda direto pra lá (`creep.moveTo`
    simples, sem `costCallback` restrito — é uma sala adjacente por onde
    ele acabou de passar, sempre andável) ao invés de tentar de novo a
    travessia pro destino real. Ao chegar, limpa o recuo e retoma o fluxo
    normal — agora com `findRoute` partindo da sala anterior, não mais do
    beco sem saída.
  - Remove `borderNeighborRoom` (só existia pra alimentar o "avoid o
    vizinho da borda", a parte insegura do 0060/0061 — pode invalidar o
    próprio destino final se o vizinho travado for ele) e o comentário/uso
    correspondente em `isOnBorder`.
  - `isBouncing` continua só detecção (mesma trilha), mas sua reação muda:
    em vez de empilhar as duas salas da trilha, chama o mesmo
    `retreatFrom()` do caso congelado — só a sala em que o creep está NO
    MOMENTO em que o padrão fecha (sempre o lado "beco sem saída" do
    bounce, nunca o corredor — ver Acceptance criteria) entra em
    `_routeAvoid`.
- `test/smoke.js`: novas assertions cobrindo o backtrack de ponta a ponta
  (histórico de sala, recuo físico, recálculo de `findRoute` a partir da
  sala certa com o beco sem saída genuinamente excluído) e o bounce
  corrigido (só uma sala evitada, nunca as duas); remove as assertions do
  `borderNeighborRoom` e as do reação antiga de "avoid as duas salas".

## Out of scope

- Qualquer `PathFinder.search` proativo pra verificar conectividade real
  antes de tentar — já tentado e revertido antes (custo de CPU bucket,
  ver comentário existente em `moveToRoom`); esse spec só corrige a reação
  REATIVA depois que o travamento já foi detectado, não adiciona detecção
  nova de "essa sala vai ser um beco sem saída antes de eu tentar".
- Backtrack de mais de um nível numa única chamada — se a sala anterior
  TAMBÉM se revelar um beco sem saída (nenhuma rota de lá pro destino
  além de atravessar o beco original), o mesmo mecanismo se repete
  naturalmente tick a tick (a pilha de histórico permite recuar quantos
  níveis precisar, um de cada vez), não precisa de um caso especial.
- Mudar `findRoute`/`routeCostCallback`'s própria lógica de custo (highway,
  hostil, avoid) — só a forma como `moveToRoom` decide DE ONDE chamar
  `findRoute` depois de um travamento.

## Acceptance criteria

1. `moveToRoom()` grava cada sala visitada nesta viagem em
   `creep.memory._routeStack`, na ordem — `test/smoke.js`: "moveToRoom()
   records each room actually visited toward the current destination".
2. Confirmado o beco sem saída (ver critério 10 — sequência de
   `ERR_NO_PATH`, não posição congelada) numa sala que tem uma sala
   anterior no histórico, só o beco sem saída entra em `_routeAvoid`
   (nunca a sala anterior) —
   `test/smoke.js`: "the dead end itself goes into _routeAvoid - never the
   room behind it, which the creep still needs to retreat through".
3. Nesse mesmo tick, o creep já anda de volta pra sala anterior
   (`creep.moveTo` chamado com aquela sala como alvo) em vez de repetir a
   travessia pro destino real — `test/smoke.js`: "moveToRoom() immediately
   walks the creep back there the SAME tick it gives up on the dead end".
4. Enquanto o recuo não chega, `moveToRoom` continua mandando o creep pra
   sala de recuo, ignorando o destino real — `test/smoke.js`: "still short
   of the retreat target - moveToRoom keeps walking it there".
5. Ao chegar de fato na sala de recuo, a próxima chamada de `findRoute`
   parte dessa sala (não mais do beco sem saída) E o beco sem saída é
   avaliado como candidato de verdade por `routeCallback` (retorna
   `Infinity`) — `test/smoke.js`: "the route is recomputed FROM the room
   behind the dead end, not from inside it" + "the dead end is genuinely
   excluded".
6. Sem sala anterior no histórico (a própria origem da viagem é o beco sem
   saída), `_routeAvoid` recebe só a sala atual e o fluxo cai de volta pro
   `findRoute`/`moveTo` normal (mesmo comportamento de fail-soft de antes)
   — `test/smoke.js`: assertion já existente adaptada, "with no earlier
   room in this trip's history to retreat to, only the room the creep is
   stuck in goes into _routeAvoid".
7. Um "bounce" (trilha de nome A-B-A-B, nunca congela) evita só a sala em
   que o padrão fecha (o lado beco sem saída), nunca as duas —
   `test/smoke.js`: "bouncing excludes only the room the pattern closes
   on ... never the safe corridor behind it" + "the creep is walked
   straight back to that corridor room, the same tick".
8. Uma viagem pra um destino novo (`toRoomName` diferente da última
   chamada) começa com histórico e recuo zerados, sem herdar nada da
   viagem anterior — coberto indiretamente por cada teste acima começar
   com `creep.memory = {}`; nenhuma assertion nova dedicada (comportamento
   interno, não observável de fora sem inspecionar `_routeStack`).
9. `borderNeighborRoom` não existe mais em `utils/routing.js` (verificação
   manual: `grep` no arquivo).
10. O gatilho de `retreatFrom()` é uma sequência de `creep.memory.
    _routeNoPathTicks` ticks consecutivos em que `moveTo()` devolveu
    `ERR_NO_PATH` de verdade (`routing.noPathTicks`, default 2) — nunca
    posição congelada; um único tick com caminho encontrado (`OK`, mesmo
    sem progresso real por tráfego) zera a sequência — `test/smoke.js`:
    "a single ERR_NO_PATH tick isn't a confirmed dead end yet" +
    assertions equivalentes nos casos de maze/sem-histórico.
11. `moveToRoom()` descarta `creep.memory._move` sempre que `_routeAvoid`
    cresceu desde a última sincronização (`creep.memory.
    _routeAvoidSeenLen`), não só no exato momento em que `retreatFrom()`
    dispara — `test/smoke.js`: "a creep whose _routeAvoid already has an
    entry the cached path never accounted for gets that stale path
    dropped, forcing a fresh (avoid-respecting) one".
12. Sem crescimento de `_routeAvoid` desde a última sincronização, o path
    cacheado fica intocado — não é uma limpeza incondicional a cada tick
    — `test/smoke.js`: "with _routeAvoid unchanged since the last
    recompute, a freshly-cached path is left alone".

## Constitution check

- **CPU:** nenhuma busca de `PathFinder` nova — o recuo usa `creep.moveTo`
  simples (sem `costCallback` restrito) pra uma sala adjacente conhecida
  andável; o `findRoute` só roda quando já rodaria de qualquer jeito
  (fluxo normal ou o tick em que o recuo termina).
- **Memory:** dois campos novos por creep (`_routeStack`, pequeno array de
  nomes de sala; `_routeRetreatTo`, uma string) — mesma escala de
  `_routeAvoid`/`_routeTrail` que já existiam, morrem com o creep.
- **Fail-soft:** sem sala anterior pra recuar, cai exatamente no
  comportamento de antes (tenta de novo, eventualmente o stall guard do
  chamador — `scout`'s `travelStallLimit`, `reserver`'s `claimStallTicks`
  — desiste). Nenhum caminho novo lança exceção sem histórico/recuo
  presente.
- **Testável offline:** todo o mecanismo (histórico, recuo, exclusão) é
  bookkeeping puro de `creep.memory` + os stubs de `Game.map.findRoute`
  já usados pelo resto do arquivo — nenhuma dependência de comportamento
  real do motor além do que os testes existentes já simulavam.

## Correção no mesmo dia: o gatilho de recuo tinha o próprio falso positivo

Usuário testou ao vivo logo depois do fix acima e reportou o creep saindo
de `W1N49` (beco sem saída de verdade), voltando pra `W1N50` — e então
recuando de novo, agora de `W1N50` pra `W2N50`. Verificação visual do
terreno de `W1N50` mostrou a fronteira com `W0N50` **totalmente aberta**
dos dois lados — não era beco sem saída nenhum. O segundo recuo era um
falso positivo.

Causa: o gatilho original de `retreatFrom()` era `isStuck` (posição
congelada por `routing.stuckTicks` ticks). Isso não distingue "não me
movi porque não existe caminho" de "não me movi porque tem alguma coisa
na frente" — um creep aliado parado, ou só tráfego normal numa sala
highway compartilhada, congela a posição exatamente como uma sala
genuinamente selada, mas o `creep.moveTo()` nativo sabe a diferença: ele
só devolve `ERR_NO_PATH` quando o `PathFinder` de verdade não acha nada;
tráfego bloqueando o próximo passo não muda esse código de retorno (o
caminho continua válido, só temporariamente bloqueado). Antes desse spec
isso nunca importava (avoidar a própria sala atual era um no-op, ROADMAP
0057-0062), mas agora que o recuo é real, um falso positivo blacklista
permanentemente uma sala boa.

Fix: o gatilho de `retreatFrom()` deixou de ser `isStuck` (posição) e
virou uma sequência de `creep.memory._routeNoPathTicks` — ticks
consecutivos em que o `moveTo()` do próprio `moveToRoom` devolveu
`ERR_NO_PATH` de verdade (`routing.noPathTicks`, default 2, menor que o
antigo `stuckTicks`=4 porque `ERR_NO_PATH` é um sinal autoritativo do
motor, não uma suposição). Uma sala com tráfego nunca acumula essa
sequência (um único tick `OK` zera o contador); um beco sem saída
genuíno devolve `ERR_NO_PATH` todo tick sem exceção, então continua
sendo pego igual de rápido. `isStuck` (a função) continua existindo e
exportada — só não é mais usada dentro de `moveToRoom`; `roles/scout.js`
continua usando-a por conta própria pra exploração livre, sem mudança.
`isBouncing` continua sendo o gatilho pro padrão de sair-e-voltar sem
nunca congelar (não dá pra ler isso do `ERR_NO_PATH`, já que um caminho
parcial pra dentro de um bolsão ainda conta como "achei caminho" pro
`moveTo` nativo).

Esse mesmo teste ao vivo revelou um limite mais fundo do mecanismo
reativo, tratado num spec separado: mesmo com o gatilho certo, qualquer
recorte no espaço de busca do `PathFinder` nativo (`routeCostCallback`'s
"allowed" set, ROADMAP 0061) pode bloquear um caminho que existe de
verdade — ver `specs/features/0064-proactive-claim-route-precompute/spec.md`.

## Correção no mesmo dia (via 0064): cache de path nativo não respeitava `_routeAvoid`

Usuário testou de novo com o 0064 já implementado (pré-cálculo de rota real
+ exclusão de sala de dono estrangeiro) e ainda assim viu um claimer
reentrar numa sala que já estava em `creep.memory._routeAvoid` havia
tempo — segundo dump de memory confirmou: `_routeAvoid` já tinha a sala
antes do creep entrar nela de novo. Causa raiz: o cache de path **nativo**
do motor (`creep.memory._move`, controlado por `reusePath`) só é
recalculado quando o destino muda, o cache expira, ou a próxima tile fica
fisicamente bloqueada — passar uma `costCallback` nova a cada tick não
invalida um path já cacheado. Um path calculado ANTES de uma sala entrar
em `_routeAvoid` podia continuar sendo andado, atravessando aquela mesma
sala, pelo resto da janela de `reusePath` — `retreatFrom()` já limpava
`_move` no exato momento em que disparava, mas essa não era a única forma
de `_routeAvoid` crescer em relação ao path que estava em uso naquele
momento.

Fix: `moveToRoom()` compara o tamanho de `_routeAvoid` contra
`creep.memory._routeAvoidSeenLen` (o tamanho na última vez que o path foi
recalculado) antes de cada chamada normal de `moveTo` — qualquer
crescimento força `delete creep.memory._move`, garantindo um recálculo
fresco com a `costCallback` atual. Sem crescimento, o path cacheado fica
intocado (não é um "limpa toda hora" — só limpa quando `_routeAvoid`
mudou de verdade desde a última sincronização).

## Open questions

Nenhuma.
