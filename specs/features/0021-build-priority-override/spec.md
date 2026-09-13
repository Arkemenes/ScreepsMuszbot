# 0021 — Build priority override

- **Status:** done
- **Depends on:** 0005 (construction queue), 0006 (`hauler`/`builder` split)

## Problem

`builder` escolhe canteiro pelo heurístico "mais perto de terminar, desempate
por distância" ([builder.js](../../../src/roles/builder.js)). Não há como o
jogador forçar manualmente uma ordem — por exemplo, terminar a torre nova
antes de qualquer extension, porque a sala está sob ameaça.

## Desired outcome

Função de console que recebe uma lista de **IDs de construction site** (já
existentes no jogo) e faz os `builder` completarem esses sites primeiro,
**na ordem passada**, antes de cair no heurístico normal. Autolimpeza: um id
que termina de construir (ou é cancelado) sai da lista sozinho.

## In scope

- `global.prioritizeBuild(ids)` — aceita um id (string) ou array de ids;
  grava em `Memory.settings.buildPriority` (lista pequena, ordem importa).
- `global.clearBuildPriority()` — remove o override.
- `builder.js`: no passo de escolha de canteiro (`targetConstructionSite`), o
  primeiro id da lista que tem um `ConstructionSite` na sala do creep vence,
  antes do sort por progresso/distância.
- Autolimpeza cacheada por tick: ids que não existem mais em
  `Game.constructionSites` são removidos de `Memory.settings.buildPriority`.

## Out of scope

- Priorizar reparo (`repairTarget`) ou ramparts danificados — só canteiros.
- Sobrepor o repair de emergência (`hits < 30%`), que continua rodando antes
  da escolha de canteiro — é uma rede de segurança, não uma preferência do
  jogador.
- Afetar `opportunisticWork` (o build/repair de passagem enquanto o builder
  caminha pra outro alvo) — continua puramente local (alcance 3).
- Influenciar `architect.js`/`createConstructionSites` (quais entradas do
  plano viram canteiro) — isso é sobre canteiros **já criados**.

## Acceptance criteria

1. `prioritizeBuild(id)` aceita string solta ou array; grava em
   `Memory.settings.buildPriority`. *(smoke)*
2. Com um site priorizado na lista, o builder o escolhe mesmo que outro site
   esteja mais perto de terminar. *(smoke)*
3. Quando o site priorizado some de `Game.constructionSites` (terminou/foi
   cancelado), a lista se autolimpa e o builder volta ao heurístico normal.
   *(smoke)*
4. `clearBuildPriority()` remove o override. *(smoke)*

## Constitution check

- **§1:** a lista é cacheada por tick (`priorityTick`/`priorityCache`); a
  limpeza é O(tamanho da lista), não uma varredura.
- **§2:** só a lista de ids na Memory (`Memory.settings`, convenção já usada
  por `profiler`/`allies`/`planSegments`) — pequena, autolimpa.
- **§3:** id inválido ou de outra sala é ignorado silenciosamente
  (`site.pos.roomName === creep.room.name`), nunca lança.
- **§6:** a decisão mora só em `builder.js`, onde o resto da escolha de
  canteiro já vive.

## Outcome

Entregue. `global.prioritizeBuild(ids)` / `global.clearBuildPriority()` em
`builder.js`. Validado pelo smoke (106 assertions no total, 5 novas: registro
da lista, vitória sobre o heurístico normal, autolimpeza ao sumir o site,
fallback pós-limpeza, `clearBuildPriority`) + `npx grunt`.
