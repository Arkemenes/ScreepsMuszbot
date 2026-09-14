# 0056 — Uma observação por tick, mesmo com múltiplos observers

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-13

## Problem

`main.js` roda `structureLogic[structureType].run(structure)` uma vez por
`Game.structures`, independente do tipo. Pra `STRUCTURE_OBSERVER`
(`structures/observer.js`), isso significa que cada observer decide seu
próprio alvo olhando só pro próprio alcance (`serveLayoutRequests`/
`serveObserveRequests`/`explorePriority` recebiam a `structure` individual).
Com um império de 1 observer isso é o comportamento certo, mas com 2+
observers o resultado é 1 observação por observer por tick — o usuário quer
só 1 observação por tick no total, escolhida considerando a união das salas
alcançáveis por qualquer observer seu, não uma por estrutura.

## Desired outcome

Com N ≥ 2 observers, exatamente uma sala é observada por tick, escolhida
pela mesma ordem de prioridade de sempre (layout pendente > `observe()`
pendente > exploração por `staleness`/`enemies`), mas considerando todas as
salas dentro do alcance de qualquer observer — não só o alcance de quem
"correu" primeiro no loop do `main.js`. Um pedido só alcançável por um
observer fora de posição ainda é servido no mesmo tick, mesmo que outro
observer tenha rodado antes dele e não o alcance. No próximo tick a decisão
é refeita do zero. Com exatamente 1 observer o comportamento não muda (é
sempre esse único observer decidindo, sem overhead de coordenação extra).

## In scope

- `src/structures/observer.js`: `serveLayoutRequests`, `serveObserveRequests`
  e `explorePriority` passam a receber uma lista de observers (não uma
  `structure` só) e escolhem, pra cada sala candidata, o primeiro observer
  da lista que a alcança. `run(structure)` consulta
  `utils/observer.js`'s `myObservers()`; com mais de um observer no
  império, um guard por `Game.time` garante que só a primeira chamada da
  lista de `Game.structures` naquele tick decide algo — as chamadas
  seguintes (outros observers) são no-op nesse tick. Com exatamente 1
  observer, o guard não entra em jogo (decide sozinho, como antes).

## Out of scope

- Escolher o observer "mais perto" quando mais de um alcança a mesma sala —
  o primeiro da lista de `myObservers()` (ordem de `Game.structures`) já
  resolve, sem precisar de heurística de distância.
- Mudar a ordem de prioridade entre layout/observe/exploração — só estende
  o alcance considerado, não a lógica de prioridade em si (ROADMAP
  0029/0030/0031).

## Acceptance criteria

1. Com 1 observer só, o comportamento é idêntico ao anterior (layout >
   observe > exploração, tudo dentro do alcance dele) —
   `test/smoke.js`'s testes existentes de `structures/observer.js`
   continuam passando sem alterar as expectativas.
2. Com 2 observers e um pedido de layout no alcance de só um deles, chamar
   `run()` no OUTRO observer primeiro ainda serve o pedido nesse mesmo
   tick (via o observer certo) — `test/smoke.js`:
   `"a layout request only one observer can reach is still served the same tick, even when a different observer runs first"`.
3. Com 2 observers e nada fora do alcance de nenhum, só uma sala é
   observada por tick: a segunda chamada de `run()` no mesmo `Game.time`
   é um no-op — `test/smoke.js`:
   `"a second observer's run() is a no-op once another observer already acted this tick"`.
4. Avançando `Game.time`, a coordenação reseta e uma nova observação
   acontece — `test/smoke.js`:
   `"the per-tick observation guard resets on the next tick"`.
5. A exploração ociosa com 2 observers considera a união dos dois
   quadrados de alcance (não só o de quem rodou primeiro) —
   `test/smoke.js`:
   `"idle exploration with two observers picks the best room across the union of both ranges"`.

## Constitution check

- **CPU:** mesmo número de `room.find`/scans por tick (o guard só evita
  chamadas de `observeRoom` redundantes, a varredura de exploração já era
  O(alcance²) por observer e continua assim, só que no máximo uma vez por
  tick agora em vez de uma vez por observer).
- **Memory:** nenhum estado novo em `Memory` — o guard "já observei este
  tick" é só heap (`Game.time` comparado a uma variável de módulo),
  descartável a qualquer momento sem corromper nada (constitution §2/§3).
- **Fail-soft:** sem observers, ou com um só, caminho idêntico ao atual.

## Open questions

Nenhuma.
