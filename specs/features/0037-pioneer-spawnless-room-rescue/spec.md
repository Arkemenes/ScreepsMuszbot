# 0037 — Pioneer: rescue a spawnless owned room

- **Status:** done
- **Owner:** -
- **Created:** 2026-09-11
- **Reviewed:** 2026-09-11
- **Depends on:** `rooms/architect.js` (já cria o construction site do spawn
  sozinho pra qualquer sala `my`, ROADMAP 0001/0005), `utils/routing.js`
  (viagem segura entre salas, ROADMAP 0028), `rooms/remotes.js`
  (`roomDistance`/`nearestOwnedRoom`, ROADMAP 0020)

## Problem

Uma sala própria sem spawn nenhum — recém-claimada (`claimRoom()`, ROADMAP
0020/0033/0034) ou que perdeu o último spawn num ataque — não consegue
spawnar **nenhum** creep sozinha. `rooms/architect.js` já planeja a sala e
cria o construction site do spawn automaticamente assim que ela vira `my`
(passo 1 do plano, sites a partir de `planStep >= 3`), mas nada no código
manda um creep com `WORK` até lá pra construir de verdade — e sem spawn,
a sala não tem como produzir esse creep por conta própria. Hoje isso exige
intervenção manual (spawnar um builder noutra sala e andar até lá à mão).

## Desired outcome

Qualquer sala própria sem spawn recebe ajuda automaticamente: a sala própria
mais próxima que **já tem spawn**, dentro de um raio configurável (padrão
10 salas de distância, mesma métrica de hops de `remotes.roomDistance`),
passa a spawnar `pioneer`s — creeps `WORK`+`CARRY`+`MOVE` que enchem a
`CARRY` na sala de origem antes de sair, viajam até a sala sem spawn, e
constroem o site do spawn que o `architect.js` já deixou lá. Uma vez que
o spawn existe de verdade, a sala volta a se sustentar sozinha (spawna
seus próprios creeps) e os pioneers restantes se aposentam.

## In scope

- Detecção automática, sem comando de console — toda sala própria sem
  spawn e sem hostil visto é candidata; a ajuda é atribuída à sala-mãe
  own mais próxima que **tem** spawn (uma sala sem spawn não pode ajudar
  outra).
- Corpo escala com a energia da sala-mãe (`utils/population.scaledBody`,
  mesma proporção `WORK`:`CARRY`:`MOVE` do `builder.js`).
- Pioneer só sai da sala-mãe com a `CARRY` cheia; se esvaziar antes do
  spawn terminar, volta pra sala-mãe, enche de novo, volta — viagem
  redonda, não um único trecho.
- Limite de pioneers simultâneos por sala-alvo (config, evita a sala-mãe
  esvaziar a própria fila de spawn pra sempre por um único desastre).
- Pioneer se aposenta (`suicide`, derruba o que carrega no chão) assim que
  a sala-alvo já tem um spawn de verdade — não importa se foi ele ou outro
  pioneer que terminou.

## Out of scope

- Sala-alvo com hostil visto (`mem.enemies > 0`) — não despacha pioneer
  desarmado pra zona de guerra; espera a ameaça sumir (defesa normal da
  sala-mãe, se aplicável, ou o inimigo ir embora sozinho). Não é uma
  extensão de combate.
- Qualquer trabalho de construção além do spawn em si — depois que o
  spawn existe, a sala passa a se virar com `builder`/`needs.js` normais.
- Escolher/priorizar QUAL sala-alvo ajudar primeiro quando uma sala-mãe
  está no raio de mais de uma sala sem spawn ao mesmo tempo além de somar
  a demanda das duas — cenário raro, sem heurística especial por ora.

## Acceptance criteria

1. `rooms/pioneering.js`'s `isSpawnless(room)` — `true` só pra sala
   própria (`controller.my`) sem nenhuma `STRUCTURE_SPAWN`.
2. `motherRoomFor(targetRoomName)` — sala própria mais próxima **com**
   spawn, dentro de `pioneer.maxDistance` (default 10, `roomDistance` em
   hops de rota); `null` se nenhuma sala qualifica (fora do raio, ou
   nenhuma tem spawn).
3. `pioneersWanted(motherRoom)`/`nextTarget(motherRoom)` — soma/escolhe
   entre as salas sem spawn atribuídas a essa mãe, respeitando
   `pioneer.maxConcurrent` por sala-alvo; zero quando a sala-alvo tem
   hostil visto ou a sala-mãe está sob ataque (mesma cautela de
   `reserver`/`raider` em `rooms/needs.js`).
4. `roles/pioneer.js`: na sala-mãe, sem `CARRY` cheia, carrega de
   qualquer pilha de energia disponível (`utils/energy.energyPiles`,
   compartilhado com `builder.js` — constitution §5); cheio, viaja
   (`routing.moveToRoom`) até a sala-alvo; lá, sem energia, constrói o
   site de `STRUCTURE_SPAWN`; energia zerada e spawn ainda não pronto,
   volta pra sala-mãe (viagem redonda); sala-alvo já com spawn de
   verdade, se aposenta.
5. `spawning.js` inclui `pioneer` na fila normal (não é luxo tipo
   scout/raider) mas depois de `bootstrap`/`defender`/`miner`/`hauler` —
   a sala-mãe nunca sacrifica a própria sobrevivência básica pra ajudar
   outra.

## Constitution check

- **§1 (CPU):** `pioneering.js` reaproveita `roomCache.structuresByType`
  (sem `room.find` novo) e `remotes.roomDistance` (já cacheado por tick).
- **§5 (roles finos, sem duplicar):** `energyPiles` sai de dentro do
  `builder.js` pra `utils/energy.js` — agora compartilhado, não duplicado
  entre `builder`/`pioneer`.
- **§6 (config sobre hardcode):** `pioneer.maxDistance`/`maxConcurrent`
  via `config.get`.
- **§4 (testável offline):** determinístico — contagem de spawn, distância
  de rota, energia carregada, tudo mockável.

## Open questions

Nenhuma — as únicas decisões de design em aberto (viagem redonda vs.
trecho único, limite de concorrência, prioridade na fila de spawn, gate
de sala-alvo hostil) foram resolvidas neste próprio spec (ver "In scope"/
"Out of scope" e critérios de aceitação); a intenção central (ajudar salas
sem spawn com pioneers cheios de recursos, até 10 salas de distância) veio
já bem definida do usuário.
