# 0071 — Torres na mesma sala não focam mais o mesmo alvo cacheado

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Mesma revisão geral do ROADMAP 0070: `findRepairTarget` cacheava o **alvo
escolhido** por sala/tick (`repairTargets[room.name]`), não a lista de
candidatos. Com 2+ torres na mesma sala, a segunda (e qualquer outra) só
lia o cache já resolvido pela primeira — ou seja, TODAS as torres da sala
sempre reparavam exatamente o mesmo alvo no mesmo tick. Não é um bug de
"escolher a estrutura errada" (a escolhida é sempre a mais urgente), mas é
uma perda real: com dois ramparts críticos simultâneos e duas torres, as
duas torres empilhavam na mesma, deixando a outra sem nenhuma atenção
naquele tick.

## Desired outcome

O `room.find` caro continua rodando só uma vez por sala/tick (constitution
§1), mas agora cacheia as **listas ordenadas** (`urgent`/`eligible`), não
um único alvo resolvido. Cada torre, ao escolher seu alvo, pula qualquer
estrutura já reivindicada por outra torre da mesma sala nesse tick
(`claimedRepairTargets`, um `Set` por sala, limpo em `resetCache`) — assim
a atenção se espalha entre alvos urgentes distintos primeiro. Só quando
TODO alvo distinto já tem uma torre nele, uma torre extra volta a empilhar
no pior alvo restante (melhor que ficar ociosa com energia sobrando).

## In scope

- `src/structures/tower.js`: `findRepairTarget` split em
  `computeRepairLists(room)` (cacheado por sala, devolve `{urgent,
  eligible}` ordenados) + a escolha por torre (`pick`, com fallback pra
  "todo mundo já reivindicado → dobra no pior").
- `test/smoke.js`: três assertions novas — primeira torre pega o pior,
  segunda pega o outro alvo urgente (não repete), terceira (nada distinto
  sobrando) volta a dobrar no pior.

## Out of scope

- Mudar a MECÂNICA nativa do Screeps (múltiplas torres reparando o mesmo
  alvo somam dano de reparo normalmente — isso não muda, só a ESCOLHA de
  alvo quando existe mais de um candidato urgente).
- `roles/builder.js` — cada builder já naturalmente vai pro alvo mais
  próximo dele via `findClosestByRange`/estado próprio; não compartilha o
  mesmo tipo de cache global que motivou esse fix na torre.

## Acceptance criteria

1. Duas torres na mesma sala, dois ramparts críticos distintos: a primeira
   pega o pior, a segunda pega o outro (não o mesmo). *(smoke)*
2. Uma terceira torre, sem alvo distinto restante, volta a reparar o pior
   dos dois (dobra) em vez de ficar sem alvo. *(smoke)*
3. `node test/smoke.js "$(pwd)"` verde.
4. `npx grunt` builda sem erro.

## Constitution check

- Ainda um único `room.find`/sala/tick — só o formato do cache mudou (lista
  em vez de alvo único).
- Nenhum objeto de jogo em Memory — o `Set` de reivindicados é heap-only,
  por tick, igual a todo outro cache deste arquivo.
- Fail-soft preservado.
- Testável offline via smoke, chamando `tower.run()` duas vezes no mesmo
  `Game.time` pra simular duas torres.

## Outcome

Entregue. `computeRepairLists` cacheado por sala; `findRepairTarget` pula
alvo já reivindicado nesse tick, com fallback pra dobrar no pior quando
nada distinto resta. `node test/smoke.js` verde (747 assertions),
`npx grunt` gerou `dist/main.js` sem erro.
