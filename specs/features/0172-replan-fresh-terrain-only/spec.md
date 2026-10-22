# 0172 — replanRoom fresh: plano só pelo terreno

- **Status:** done
- **Owner:** a definir
- **Created:** 2026-10-21
- **Linear:** [ARK-219](https://linear.app/arkemenes/issue/ARK-219/0172-replanroom-fresh-plano-so-com-terreno-ignorando-estruturas)

## Problem

`replanRoom(room)` apaga o plano, mas o planejamento refeito continua preso ao que está construído. O primeiro stamp de spawn é ancorado no spawn existente. `existingBuiltNear` reaproveita containers, links e torres perto de sources e mineral. `unclaimedBuiltTowers` reaproveita as torres de perímetro. Tiles ocupados por estruturas são descartados na escolha do link. Por isso não há como ver nem adotar o layout que o planner escolheria olhando só para o terreno.

## Desired outcome

`replanRoom(room, {fresh: true})` refaz o plano a partir só do terreno (walls naturais), das sources, do mineral e do controller. Esse plano substitui o plano real da sala, e o bot passa a construir por ele. Nada é demolido: as estruturas fora do plano ficam de pé até o usuário removê-las.

## In scope

- Opção `{fresh: true}` em `replanRoom`, persistida como `Memory.rooms[room].planFresh` (boolean).
- Enquanto a flag existir: sem âncora no spawn construído (o construction site de spawn continua valendo), sem reaproveitar containers/links/torres e sem descartar tiles ocupados.
- `replanRoom(room)` sem a opção apaga a flag e volta ao comportamento atual.
- Entrada na ajuda do console.
- Âncora do primeiro spawn também pelo construction site de spawn quando ainda não há spawn construído (pedido do usuário, mesmo dia).

## Out of scope

- Demolir estruturas fora do plano (já existe `destroyUnplannedRoads` para roads).
- Prévia separada que não substitui o plano real.
- Mudar o algoritmo de stamps, o flood fill ou o mincut, que já usam só o terreno.

## Acceptance criteria

1. `replanRoom(room)` continua reaproveitando estruturas construídas ("0172: a normal replanRoom still reuses a built tower").
2. `replanRoom(room, {fresh: true})` limpa o plano e grava `planFresh` ("0172: replanRoom(room, {fresh: true}) clears the plan and sets planFresh").
3. Com `planFresh`, `existingBuiltNear` e `unclaimedBuiltTowers` não devolvem nada ("0172: a fresh replan ignores built structures (no tower reuse)").
4. Um `replanRoom` comum apaga `planFresh` ("0172: a plain replanRoom drops planFresh again").
5. Fora do modo fresh, o primeiro stamp de spawn ancora no spawn construído e, sem ele, no construction site de spawn ("0172: with no spawn built, the first spawn stamp anchors on the spawn construction site", "0172: a built spawn wins over a spawn construction site as the anchor"); no modo fresh, o spawn construído é ignorado mas o construction site continua sendo âncora, porque é a escolha deliberada do jogador para o layout novo ("0172: a fresh replan ignores the built spawn but still anchors on the spawn site", "0172: a fresh replan with no spawn site has no anchor").

## Constitution check

- **CPU:** com a flag ativa há menos `room.find`, nunca mais.
- **Memory:** um boolean por sala; nenhum objeto do jogo.
- **Fail-soft:** nada é demolido; o pior caso é um site recusado num tile ocupado, que o jogo já trata.
- **Offline test:** quatro asserções no smoke.

## Open questions

Nenhuma. O usuário escolheu substituir o plano real em vez de uma prévia.
