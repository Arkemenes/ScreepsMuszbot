# 0062 — troca o blacklist global de sala por lista de "evitar" por creep

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-13

## Problem

O 0058 introduziu `Memory.rooms[x].routeBlacklistUntil` (TTL 5000 ticks,
compartilhado por todo creep que rotear por ali) como forma de "essa sala
provou ser ruim, evita por um tempo". O 0061 corrigiu duas vezes seguidas
um bug de **qual** sala blacklistar (geometria de borda, depois o próprio
`isRouteFlapping`) — mas o usuário testou ao vivo depois da segunda
correção e reportou: mesmo **limpando manualmente** o blacklist errado no
console (`delete Memory.rooms.W1N50.routeBlacklistUntil`), o claimer
continuou preso do mesmo jeito. Ou seja, o problema não é (só) "qual sala
blacklistar" — o mecanismo inteiro de blacklist **global, com TTL,
compartilhado entre creeps** provou ser frágil demais: três correções
seguidas, cada uma emendando a anterior, e o sintoma ao vivo não mudou.

Pedido direto do usuário: tirar essa lógica de blacklist. Em vez disso,
verificar (reativamente, do jeito que já fazíamos) e, se for o caso, mudar
de rota — sem persistir "essa sala é ruim" em `Memory.rooms` com prazo de
validade, sem tentar adivinhar qual das duas salas de um bounce é "a
armadinha de verdade" (a fonte dos dois bugs do 0061).

## Desired outcome

`utils/routing.js` não tem mais `Memory.rooms[x].routeBlacklistUntil`,
`isBlacklisted`, `blacklistRoom` nem `isRouteFlapping`/`_routeTrail`. Um
creep que trava (`isStuck`, ROADMAP 0060/0061 — mesma detecção por
posição, mantida) guarda a(s) sala(s) implicada(s) numa lista própria,
`creep.memory._routeAvoid` — sem prazo de validade, sem afetar nenhum
outro creep — e a MESMA chamada de `findRoute`/`moveTo` daquele tick já
recalcula excluindo essas salas, em vez de esperar o próximo tick ler um
blacklist gravado. Quando travar numa borda, tanto a sala atual quanto a
vizinha identificada (se houver) entram na lista — sem tentar decidir qual
das duas é "a real armadilha" (a fonte dos bugs anteriores): evitar as
duas pro resto da viagem desse creep é seguro (é local a ele, não afeta
mais ninguém) e não exige nenhuma matemática de distância.

## In scope

- `src/utils/routing.js`: remove `isBlacklisted`, `blacklistRoom`,
  `isRouteFlapping`, `nudgeAcrossBorder` (não faz mais sentido sem a
  lógica de "qual lado é a armadilha"). `findRoute(from, to, opts)` e
  `routeCostCallback(route, current, to, opts)` trocam a checagem de
  blacklist por `opts.avoid` (array de nomes de sala, custo `Infinity`/
  excluído da folga). `moveToRoom()` reescrito: mantém `isStuck`/
  `isOnBorder`/`borderNeighborRoom`/`nudgeAwayFromBorder` (detecção e
  nudge continuam — só o que acontece DEPOIS de detectar muda), mas ao
  travar só empilha em `creep.memory._routeAvoid` (a sala atual sempre; a
  vizinha da borda também, se identificável) e já chama `findRoute`/
  `moveTo` do mesmo tick com esse `avoid` — nunca escreve nada em
  `Memory.rooms`. `nudgeAwayFromBorder` vira um fallback só quando
  `moveTo()` não consegue nem propor um passo (`ERR_NO_PATH`) estando na
  borda — evita o snapback do motor (0060) sem precisar saber se é o lado
  certo.
- `src/roles/scout.js`: o branch de exploração livre parava de chamar
  `routing.isStuck`/`nudgeAwayFromBorder` e blacklistava
  `creep.memory.targetRoom` via a PRÓPRIA `blacklistRoom` do scout
  (`scoutBlacklistUntil`, mecanismo separado, ROADMAP 0009) — isso não
  muda, é um problema diferente e intocado.
- `test/smoke.js`: remove as assertions de `isBlacklisted`/`blacklistRoom`/
  `isRouteFlapping`/`_routeTrail` (routing.js) e do `routeBlacklistUntil`;
  novas assertions pra `_routeAvoid` e `opts.avoid` em `findRoute`/
  `routeCostCallback`.

## Out of scope

- `roles/scout.js`'s próprio `isBlacklisted`/`blacklistRoom`
  (`scoutBlacklistUntil`) da exploração livre — mecanismo separado
  (ROADMAP 0009), nunca reportado com problema, fora de escopo.
- Qualquer nova busca de `PathFinder.search` proativa — o recálculo de
  `findRoute` acontece só depois de `isStuck` confirmar o travamento
  (reativo), nunca antes.
- Persistir `_routeAvoid` além da vida do creep — morre com ele
  (`Memory.creeps` de creep morto já é coletado no `main`), não precisa
  de TTL próprio.

## Acceptance criteria

1. `findRoute(from, to, { avoid: [...] })` dá custo `Infinity` (exclusão
   total) pra qualquer sala em `avoid`, mesmo sem `blockHostiles` —
   `test/smoke.js`: `"findRoute excludes every room in opts.avoid
   outright"`.
2. `routeCostCallback`'s folga (vizinhos de `exits`) nunca inclui uma sala
   de `opts.avoid` — `test/smoke.js`: `"routeCostCallback's slack never
   adds a room from opts.avoid"`.
3. `moveToRoom()` travado (borda ou meio da sala) empilha a sala atual em
   `creep.memory._routeAvoid` e a MESMA chamada de `findRoute`/`moveTo`
   desse tick já exclui essa sala — `test/smoke.js`: `"a stuck creep's
   own room is added to _routeAvoid and excluded from the very same
   tick's route"`.
4. Travado na borda, a vizinha identificada (`borderNeighborRoom`) também
   entra em `_routeAvoid`, além da sala atual — `test/smoke.js`:
   `"stuck at a border also adds the identified neighbor to
   _routeAvoid"`.
5. `_routeAvoid` nunca duplica uma sala já presente — `test/smoke.js`:
   `"_routeAvoid never grows with a duplicate entry"`.
6. Destino já presente em `_routeAvoid` faz `moveToRoom()` devolver
   `ERR_NO_PATH` na hora, sem `move()`/`moveTo()` — `test/smoke.js`:
   reaproveita a assertion equivalente do 0060/0061, adaptada pra
   `_routeAvoid`.
7. Nenhum campo novo em `Memory.rooms` — `isBlacklisted`/`blacklistRoom`/
   `routeBlacklistUntil` não existem mais em `utils/routing.js`
   (verificação manual: `grep` no arquivo).
8. Um creep que atravessa a borda pra frente e pra trás (posição muda todo
   ciclo, nunca congela) é pego por `isBouncing` mesmo sem `isStuck` nunca
   disparar — `test/smoke.js`: `"walking out and back in every cycle
   (never frozen in one spot) is caught by the room-name trail, not the
   position freeze - both rooms go on _routeAvoid"`.
9. `isBouncing` dispara empilha as DUAS salas da trilha em `_routeAvoid` e
   a MESMA chamada de `findRoute` do tick já redireciona por uma sala
   diferente — `test/smoke.js`: `"the SAME tick's findRoute() call already
   redirects through a genuinely different room (W2N50), not just refuses
   to move"`.

## Constitution check

- **CPU:** mesma coisa de antes — nenhuma busca de `PathFinder` nova; o
  `findRoute`/`moveTo` do tick em que `isStuck` dispara já ia rodar de
  qualquer jeito, só que agora com uma exclusão a mais.
- **Memory:** troca um campo por sala (`Memory.rooms[x].
  routeBlacklistUntil`, compartilhado, com TTL) por um campo por creep
  (`_routeAvoid`, array pequeno, vida do creep) — estritamente mais barato
  e menos acoplado (nenhum creep afeta o roteamento de outro).
- **Fail-soft:** sem travamento, comportamento idêntico a hoje
  (`_routeAvoid` vazio não muda nada). Um `avoid` genuinamente sem
  alternativa faz `findRoute` devolver `null` e `moveTo` não avançar —
  mesmo resultado de "sem rota seguro" que o `blockHostiles` já produzia.

## Correção no mesmo dia: sair-e-voltar não é a mesma coisa que travar parado

Usuário testou ao vivo e reportou um padrão diferente do que os testes
cobriam: "Ele está parando na sala anterior, sai da porta, pensa e volta
para a sala sem saída. Entra, pensa e sai" — e, no acompanhamento, "o
problema real é que não redirecionou para outra sala". O creep está se
movendo a cada ciclo (sai, entra, sai de novo) — nunca **parado** na mesma
posição por `routing.stuckTicks` ticks seguidos.

Causa: ao tirar a lógica de blacklist (acima), o `isRouteFlapping`
original (trilha `[A,B,A,B]` por nome de sala, ROADMAP 0058) foi removido
junto — mas ele cobria um padrão genuinamente diferente do `isStuck`
(posição **congelada**): um creep que atravessa a borda pra frente e pra
trás a cada ciclo nunca tem a mesma posição duas ticks seguidas, então
`isStuck` nunca vê nada. Sem nenhum dos dois detectores, esse padrão
específico (o que o usuário efetivamente estava vendo) ficou sem cobertura
nenhuma.

Fix: `isBouncing(creep)` — mesma mecânica de trilha `[A,B,A,B]` por nome de
sala do antigo `isRouteFlapping`, mas **só detecção**, sem nenhuma decisão
de "qual sala é a armadilha" embutida (essa parte era o problema real das
três correções anteriores, não a detecção em si). `moveToRoom()` chama
`isBouncing` antes de `isStuck`; ao disparar, empilha as DUAS salas da
trilha (`trail[len-1]` e `trail[len-2]`) no MESMO `creep.memory._routeAvoid`
por-creep introduzido acima — sem TTL, sem adivinhar qual das duas é
"real" — zera a trilha, descarta o path em cache, e cai no mesmo
`findRoute`/`moveTo` de sempre, que já recalcula excluindo as duas salas
recém-adicionadas nesse mesmo tick (não só "para de tentar", like o
usuário apontou — genuinamente escolhe outra sala, ex.: `W0N50`/`W2N50` em
vez de insistir em `W1N49`).

## Open questions

Nenhuma.
