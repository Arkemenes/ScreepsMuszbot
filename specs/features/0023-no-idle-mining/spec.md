# 0023 — Builder never mines; miner only mines with a place to put it

- **Status:** done
- **Depends on:** 0006 (hauler/builder split), 0016 (miner seat & tower feed), 0019 (energy pile contention)

## Problem

Duas fontes de desperdício/comportamento indesejado ao redor de `harvest()`:

1. `builder.js` cai pra minerar uma source diretamente (`findNearbyFullSource`)
   quando nenhuma pilha de energia está disponível. Isso disputa o assento do
   `miner` e o `builder` não deveria nunca fazer esse trabalho.
2. `miner.js` chama `creep.harvest(source)` **todo tick** incondicionalmente,
   mesmo quando o container embaixo dele já está cheio e não há link coletor
   nem torre com espaço por perto — o excedente cai no chão e decai à toa.

## Desired outcome

- `builder` nunca minera. Sala seca → espera perto do link receptor (ou
  simplesmente não faz nada), igual já fazia como último passo antes do
  fallback de minerar.
- `miner` só continua chamando `harvest()` se a energia minerada tiver pra
  onde ir: o container ainda tem espaço, ou (container cheio) um link coletor
  ou uma torre adjacente ainda têm espaço. Sem container (fase inicial, antes
  de construído) continua minerando normalmente — a sobra no chão é o que o
  hauler recolhe nessa fase.

## In scope

- `src/roles/builder.js`: remover o bloco `findNearbyFullSource` da branch
  "Get Energy"; remover o import agora não usado.
- `src/roles/miner.js`: novo `hasDepositTarget(creep)`; gateia a chamada de
  `creep.harvest(source)` (e o fallback de movimento associado) em `run()`.

## Out of scope

- `bootstrap`/`upgrader` continuam podendo minerar como último recurso — são
  papéis de emergência/genéricos, fora do escopo desse pedido.
- Mudar a ordem de prioridade de `distribute()` (link → container → torre) —
  só a decisão de **minerar ou não**, não pra onde mandar depois.

## Acceptance criteria

1. Builder com todas as pilhas esgotadas/reservadas não tenta minerar uma
   source — espera perto do link receptor. *(comportamento herdado do bloco
   já existente, só sem o fallback removido)*
2. Miner com container ainda com espaço continua minerando normalmente.
   *(smoke)*
3. Miner com container cheio, sem link coletor e sem torre por perto para de
   minerar naquele tick. *(smoke)*
4. Miner com container cheio mas uma torre adjacente ainda com espaço
   continua minerando (a sobra é entregue pela torre via `distribute()`).
   *(smoke)*
5. Miner com container **e** torre cheios para de minerar. *(smoke)*

## Constitution check

- **§1/§2:** `hasDepositTarget` só olha `findInRange(1)` (já barato, mesma
  vizinhança que `distribute()` já varre) — nenhum find novo por sala/tick.
- **§3:** sem container ainda (fase inicial) sempre retorna `true` — nunca
  trava a economia early-game esperando por estruturas que não existem.

## Outcome

Entregue. `builder.js`: bloco `findNearbyFullSource` removido da branch de
"Get Energy" + import ajustado (`receivingLink` só). `miner.js`:
`hasDepositTarget(creep)` — sem container ainda, sempre `true`; com
container, `true` se ele tem espaço; se cheio, `true` só se um link coletor
ou uma torre adjacente ainda têm espaço livre (isso cobre exatamente o que
`distribute()` já faria com o excedente — uma torre não-cheia sempre acaba
recebendo via o branch de "surplus" de `distribute()`, então não checa a
reserva, só espaço livre). `run()` só chama `creep.harvest()` dentro desse
gate. Validado pelo smoke (123 assertions no total, 4 novas cobrindo os
quatro casos de `hasDepositTarget`) + confirmado que as duas assertions do
caso "para de minerar" falham revertendo o fix + `npx grunt`.

**Bug encontrado depois, validando in-game**: com a mineração removida, um
builder cuja pilha "usável" mais próxima era negada pela disputa de reserva
(`utils/reservations` — ex.: um hauler reservando o mesmo link receptor
enquanto spawn/ext estão famintos) caía no fallback "sala seca, espera perto
do link receptor" — mas esse fallback só fazia `moveTo`, nunca tentava
`withdraw()`. Se a negação da reserva persistisse tick após tick (o hauler
reclama o mesmo link de novo a cada load), o builder ficava parado pra sempre
do lado de um link com energia de verdade, nunca pegando nada — mesmo o link
"cheio" aos olhos de quem está jogando. Corrigido: ao chegar em alcance do
link de espera, se ele tiver `store[RESOURCE_ENERGY] > 0`, o builder saca
direto (`withdraw`), sem passar pelo `pushState`/reserva — é uma ação
oportunista de último recurso, não uma reivindicação; não compete com hauler
pela pilha, só evita ficar parado ao lado de energia disponível. Validado por
uma assertion dedicada (hauler reserva o link inteiro, `available()` zera
pro builder, builder já parado a range 1 do link ainda assim saca) +
confirmado que a assertion falha revertendo o fix.

Durante a investigação, achado também um bug no **harness de teste**
(`test/smoke.js`, não no bot): `RoomPosition.prototype.inRangeTo` do mock
não desembrulhava `.pos` ao receber uma estrutura/creep (só aceitava um
`{x,y}` cru), diferente do Screeps real (`inRangeTo` aceita RoomPosition OU
qualquer RoomObject). Isso mascarava silenciosamente todo teste que checasse
"já estou a range de uma estrutura" via `.inRangeTo(structure, n)` — sempre
dava `false` mesmo adjacente. Corrigido reaproveitando o helper `_xy` que
`getRangeTo` já usa.
