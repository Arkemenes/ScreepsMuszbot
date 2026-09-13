# 0009 — Scout hardening

- **Status:** ready
- **Analysis refs:** M1

## Problem

`src/roles/scout.js` era frágil. Parte já foi corrigida por efeito colateral
do `0018` (chave de memory unificada em `creep.memory.home`; `spawn()` e a
contagem de intel já concordam) e do estado atual do código (`exits || {}`
protege contra `undefined`; `exitDirection < 0` já é checado). O que sobra,
achado ao investigar um scout visivelmente parado perto de uma sala vizinha
("bolsão sem caminho válido", relatado pelo usuário com screenshot — scout
parado junto a uma área murada):

- **O scout de exploração livre nunca de fato atravessa a borda.**
  `scout.run` calcula um tile de borda *dentro da própria sala atual*
  (`creep.pos.findClosestByRange(exitDirection)`) e chama
  `creep.moveTo(exitTile, { reusePath: 20 })` sem `range` — o wrapper
  `utils/move.js`'s `travel()` usa `range: 1` por padrão
  (`utils/move.js:110`), então `travel()` reporta `OK` assim que o scout fica
  a 1 tile do próprio tile de borda, um tile *antes* de realmente pisar nele.
  O scout nunca pisa na borda, nunca move um passo além dela, e portanto nunca
  troca de sala pela rota de exploração — fica parado ali para sempre. Isso
  por si só explica o sintoma relatado.
- **`utils/move.js`'s `findPath()` ignora `PathFinder`'s `result.incomplete`**
  (`utils/move.js:65-77`). Quando o destino de um `travel()` intra-sala está
  atrás de um bolsão de paredes/ramparts sem passagem, `PathFinder.search`
  devolve um caminho parcial best-effort (`incomplete: true`) em vez de um
  caminho vazio — `travel()` segue esse caminho como se fosse válido, andando
  até o fundo do bolsão, e só reporta `ERR_NO_PATH` ticks depois, quando o
  próximo repath dá um caminho de tamanho zero.
- **Sem blacklist para uma sala-alvo inalcançável** (o item que já estava no
  spec original): ao receber `ERR_NO_PATH`, `scout.run` limpa
  `target`/`targetRoom`, mas a reseleção imediatamente seguinte volta a
  escolher a mesma sala nunca visitada (`lastVisit` undefined sempre vence o
  tie-break) — loop infinito de tentativa → falha → retentativa da mesma sala.
- **Achado só depois de corrigir o bug de cruzamento de borda acima:** uma
  sala-bolsão que o scout consegue de fato alcançar (sem `ERR_NO_PATH` — a
  entrada dela é alcançável, só não leva a lugar nenhum além dela mesma)
  causa um ping-pong infinito com a sala anterior. A regra "visita a sala
  vizinha vista há mais tempo" não tem memória do caminho percorrido: ao
  entrar no bolsão, ele visita a sala de origem como único vizinho — e como
  cada visita atualiza `lastVisit` pra "agora", visitar A ou B sempre deixa a
  *outra* parecendo a mais fresca pra sair DE, nunca a mais velha a evitar.
  Sintoma relatado pelo usuário (com screenshot): scout parado exatamente na
  borda de uma área pequena murada, entrando e saindo sem parar.

## Desired outcome

Scout escolhe a sala adjacente vista há mais tempo (pulando salas em
blacklist), efetivamente atravessa a borda e passa a explorá-la, registra a
visita, repete. Uma sala que se revela inalcançável (`ERR_NO_PATH`) entra numa
blacklist por um tempo em vez de ser retentada todo tick. Um `travel()`
intra-sala nunca segue um caminho que o próprio `PathFinder` já marcou como
incompleto.

## In scope

- `scout.js`: exploração livre passa a rotear via `utils/routing.moveToRoom`
  (o mesmo mecanismo já usado pelas tarefas de sign/layout) em vez de calcular
  manualmente um tile de borda — isso delega o cruzamento de sala pro
  pathfinding nativo/multi-sala, que já sabe atravessar bordas corretamente.
  Como o destino passa a ser a própria `targetRoom`, `creep.memory.target`
  (posição x/y) deixa de ser necessário; só `creep.memory.targetRoom`
  permanece.
- `Memory.rooms[room].scoutBlacklistUntil` (ticks) para uma sala que responde
  `ERR_NO_PATH`; a reseleção pula qualquer sala com blacklist ainda ativa.
  Duração configurável via `scout.blacklistTicks` (`utils/config.js`).
- `creep.memory.cameFrom`: a sala que o scout acabou de deixar. A reseleção
  nunca escolhe `cameFrom` de volta, exceto quando é a única opção — nesse
  caso a sala atual (um beco-sem-saída, sem nada novo além do caminho de
  volta) entra no mesmo `scoutBlacklistUntil` antes do recuo, pra que a
  próxima reseleção no hub não mande o scout de volta pra lá.
- `utils/move.js`'s `findPath()`/`travel()`: um resultado `incomplete: true`
  do `PathFinder` é tratado como `ERR_NO_PATH` em vez de seguido — vale para
  todo chamador de `travel()`, não só o scout, já que a causa raiz (bolsão sem
  caminho) pode afetar qualquer creep.

## Out of scope

- Tarefas de sign/layout (destino explícito escolhido pelo jogador) — não
  ganham blacklist; permanecem retentando via `routing.moveToRoom` como hoje.
- Agir sobre a intel (remote mining, resposta a ameaça) — isso é depois.
- Coordenação multi-scout / divisão de território.
- Intel baseada em observer.

## Acceptance criteria

1. `scout.run` não lança quando `Memory.rooms[creep.room.name].exits` é
   undefined. *(smoke asserta — já coberto pelo `|| {}` existente)*
2. `scout.spawn` e a contagem de scout do `intel` usam a mesma chave de memory
   (`home`). *(já coberto pelos testes existentes)*
3. Ao escolher uma sala adjacente para explorar, o scout chama `moveTo` com um
   destino cuja `roomName` é a sala-alvo (não a sala atual) — ou seja, o
   movimento é capaz de efetivamente cruzar a borda. *(smoke asserta)*
4. Um `travel()` intra-sala cujo `PathFinder.search` devolve
   `incomplete: true` retorna `ERR_NO_PATH` em vez de seguir o caminho
   parcial. *(smoke asserta)*
5. Uma sala-alvo que responde `ERR_NO_PATH` ganha
   `Memory.rooms[room].scoutBlacklistUntil` no futuro, e a reseleção pula essa
   sala (escolhendo outra saída disponível) enquanto o blacklist estiver
   ativo. *(smoke asserta)*
6. Um beco-sem-saída (sala cuja única saída conhecida é a sala de onde o
   scout acabou de vir) não gera ping-pong: o scout não reseleciona
   `cameFrom` imediatamente; ao ficar sem opção além dele, blacklista a sala
   atual antes de recuar; de volta ao hub, uma sala nova disponível é
   escolhida em vez do beco-sem-saída recém-blacklistado. *(smoke asserta)*

## Constitution check

- **Fail-soft (§3):** todo resultado de API externa (`PathFinder.search`,
  `creep.moveTo`) é validado antes do uso; nenhuma sala ruim trava o scout
  para sempre.
- **Roles finos (§5):** a lógica de roteamento cross-room sai do role e vai
  pro `utils/routing.js` já existente — o `scout.js` fica mais simples, não
  mais complexo.
- **CPU (§1):** a lógica do scout é trivial; roda uma vez por scout (há ≤ 1).
  `moveToRoom` já é usado hoje por sign/layout, sem custo novo de perfil.
