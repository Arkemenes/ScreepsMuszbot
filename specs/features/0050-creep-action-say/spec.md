# 0050 — Creep action flavor: `say("~Pew!~")` on build/repair

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

`old_1/prototype.creep.repairStructure.js`/`prototype.creep.upgrade.js` faziam
o creep dizer `'*Pew!*'` a cada `build()`/`repair()`/`upgradeController()`
bem-sucedido. Hoje `src/prototypes/creep.js`'s `runBuild()` (usado por
`builder`/`upgrader` via `invokeState`) já tem essa linha escrita — mas
comentada (`// this.say("~Pew!~")`) — nas duas ramificações (`build` e
`repair`). Ninguém tira som nenhum ao construir/reparar hoje.

## Desired outcome

Um creep que constrói ou repara com sucesso mostra a bolha `"~Pew!~"` acima
da cabeça, mesma cadência de antes (uma vez por ação bem-sucedida, não por
tick de trabalho contínuo — na prática é por tick já que `build`/`repair`
roda todo tick enquanto há canteiro/dano, então a bolha se repete a cada
~3 ticks igual a qualquer `say()` do jogo).

## In scope

- `src/prototypes/creep.js`'s `runBuild()`: reativa as duas linhas
  `this.say("~Pew!~")` (branch `ConstructionSite` e branch `Structure`).

## Out of scope

- Qualquer outra fala de ação (ex.: o `"Hello!"` do scout do `old_1` ao
  nascer, ou falas de combate) — não pedidas nesta rodada.
- Mudar a cadência/condição de quando a fala aparece.

## Acceptance criteria

1. `runBuild()` chama `say("~Pew!~")` quando `build()` retorna `OK` —
   `test/smoke.js`: `"runBuild says '~Pew!~' on a successful build"`.
2. `runBuild()` chama `say("~Pew!~")` quando `repair()` retorna `OK` —
   `test/smoke.js`: `"runBuild says '~Pew!~' on a successful repair"`.

## Constitution check

- **CPU:** `say()` é uma intent nativa, mesmo custo de qualquer outra
  chamada de creep já feita nesse tick — sem varredura nova.
- **Trivial:** mudança de 2 linhas (descomentar), mas o usuário pediu uma
  entrada no ROADMAP pra rastrear a decisão de reativar, daí a spec curta.
