# 0019 — Energy pile contention priority

- **Status:** done
- **Depends on:** 0014, 0015, 0017

## Problem

Vários creeps (hauler, bootstrap, builder, upgrader) escolhem de onde pegar
energia **independentemente**, sempre pela pilha mais próxima. Quando a sala
está com pouca energia disponível, um builder e um hauler convergem para o
mesmo drop / container; o builder chega primeiro, esvazia a pilha, e o hauler
volta vazio — spawn e extensions ficam sem energia e a produção de creeps
trava. Não há noção de prioridade entre "quem mantém a economia" e "quem
gasta".

## Desired outcome

Quando mais de um creep disputa a mesma pilha de energia, a prioridade é de
quem mantém spawn + extensions cheios (**hauler**, **bootstrap**). Builder e
upgrader **cedem a pilha inteira** para esses enquanto `room.energyAvailable <
room.energyCapacityAvailable`. Assim que spawn + extensions estão cheios, a
prioridade deixa de valer e vale o mais próximo (com desempate estável para
dois creeps do mesmo nível não travarem no mesmo drop pequeno).

## In scope

- Novo `src/utils/reservations.js`:
  - `ECONOMY_PICKERS = { hauler, bootstrap }`.
  - Ledger por tick, reconstruído de `Game.creeps[*].memory.loadTarget`
    (ignora creep sem espaço de carga).
  - `available(creep, pile)` → energia da pilha livre para esse creep depois
    de descontar quem tem prioridade. `0` = não usar.
    - sala instável + o outro é economy e eu não → `return 0`.
    - sala instável + eu sou economy e o outro não → ignoro a claim dele.
    - demais (mesmo nível, ou sala estável) → desconto a carga livre de quem
      ordena antes por `name`.
  - `usable(creep, piles, min=50)` → filtra a lista.
  - `claim(creep, id)` / `release(creep)` → grava/limpa `memory.loadTarget` e
    atualiza o ledger vivo.
  - `economyStable(room)` = `energyAvailable >= energyCapacityAvailable`.
- `hauler.pickLoad` — cada candidato (link receptor, drop, tombstone, ruína,
  container de source) filtrado por `available >= 50`; `claim` ao comprometer,
  `release` ao entrar em `deliver` / esperar.
- `builder` — `usable()` sobre `energyPiles`; `claim` no `pushState("GetEnergy")`,
  `release` ao ter energia / cair para source / esperar no link.
- `upgrader` — `available >= 50` nos filtros de link / drop / storage-container;
  `claim`/`release` análogos.
- `bootstrap` — `claim` no link receptor e no drop; `release` ao encher / cair
  para source.

## Out of scope

- Reserva de quantidade fina / múltiplos creeps dividindo uma pilha grande de
  forma ótima — o desempate por `name` é suficiente.
- Roteamento / anti-congestionamento (isso é a discussão do "central traffic
  resolver").
- Prioridade entre consumidores na entrega (já coberta em `hauler.pickDeliver`).
- Miner (tem assento próprio, não disputa pilha).

## Acceptance criteria

1. Com a sala instável (spawn/ext com fome) e um hauler já indo para um drop,
   `reservations.available(builder, drop) === 0`. *(smoke)*
2. O próprio hauler continua vendo a pilha que reservou. *(smoke)*
3. Com spawn/ext cheios, `available(builder, drop) >= 50`. *(smoke)*
4. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§1:** ledger reconstruído **uma vez** por tick; `available` é O(claims na
  pilha).
- **§3:** `available` nunca lança — pilha sem `store`/`amount` → 0; sala sem
  spawn → `0 >= 0` estável.
- **§6:** a política de disputa mora num lugar só (`utils/reservations`), os
  roles só consultam.

## Outcome

Entregue. `src/utils/reservations.js` com ledger por tick em
`creep.memory.loadTarget`. `hauler`, `bootstrap`, `builder`, `upgrader`
consultam `available()` / `usable()` antes de escolher a pilha e chamam
`claim` / `release`. Validado pelo smoke (94 asserções) + `npx grunt`.

**Bug encontrado depois, validando in-game**: "cede a pilha inteira" fazia
sentido pra um drop/tombstone/ruína (pequeno, único, não reabastece), mas a
mesma regra também se aplicava a container/storage/link — um hauler
reservando um **container de source com 1350 de energia** bloqueava esse
container por inteiro pro builder, que caía pra minerar a source direto
(último recurso) mesmo sobrando ~1250 de energia parada do lado. Corrigido:
`available()` agora distingue pilha "renovável" (`isReplenishing` —
`structureType` presente, ou seja container/storage/link) de pilha
"descartável" (drop/tombstone/ruína, sem `structureType`). Só a descartável
continua sendo cedida por inteiro; na renovável o builder/upgrader só cede o
quanto o hauler/bootstrap ainda precisa (`other.store.getFreeCapacity(...)`,
igual ao desempate entre pares), o resto continua disponível. Validado por
duas assertions dedicadas (container grande com claim de hauler: hauler vê os
1350 inteiros, builder vê 1350 − a capacidade livre do hauler) + confirmado
que a assertion falha revertendo o fix.
