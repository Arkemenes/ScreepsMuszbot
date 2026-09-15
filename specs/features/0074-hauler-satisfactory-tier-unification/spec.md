# 0074 — Torre não-crítica vira prioridade satisfatória própria, à frente de lab/factory/container

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Depois do ROADMAP 0073 (torre não-crítica virou alvo opcional de entrega,
mesma prioridade nominal de lab/factory/container do controller), o
usuário pediu um passo além: tratar uma torre entre 50% e 100% de energia
como o equivalente exato de "prioridade satisfatória" **em todas as
comparações de prioridade** — não só nominalmente, mas na prática de
escolha de alvo.

Investigando `roles/hauler.js`'s `pickDeliver`, a torre não-crítica
(`towerDeliverable`) e os consumidores opcionais (`optionalConsumer`:
lab/factory/power spawn/container do controller) eram checados em **três
passos sequenciais fixos**: torre sempre primeiro, lab sempre depois,
container do controller sempre por último — nunca comparados entre si de
forma explícita/nomeada, só por acidente de ordem no código-fonte.

## Desired outcome (revisado no mesmo dia)

Primeira versão da função `satisfactoryConsumer(creep)` comparava
`toppableTower(creep)` contra `optionalConsumer(creep)` **por distância**
(`creep.pos.getRangeTo`), deixando o mais próximo dos dois vencer — mas o
usuário corrigiu ainda no mesmo dia: "Torres devem ser prioritárias vs
lab/factory/container". Não é uma comparação por proximidade — dentro do
tier satisfatório, torre sempre vence lab/factory/power spawn/container do
controller, mesmo estando mais longe (prontidão de defesa pesa mais que um
errand de lab ou o buffer de upgrade do controller, mesmo quando nenhum
dos dois é essencial ainda).

`satisfactoryConsumer(creep)` final:

```js
function satisfactoryConsumer(creep) {
    return toppableTower(creep) || optionalConsumer(creep);
}
```

Torre não-crítica sempre checada primeiro (mesma regra de sempre, ROADMAP
0073); `optionalConsumer` só entra em jogo se nenhuma torre não-crítica
precisar de energia. Usada em todo lugar que antes chamava
`optionalConsumer(creep) || toppableTower(creep)` (gate booleano de
`pickLoad`) ou checava os dois em sequência com o container do controller
separado (`pickDeliver`, que de brinde ganhou a cobertura de
factory/power spawn que faltava no seu check de lab isolado).

## In scope

- `src/roles/hauler.js`: `satisfactoryConsumer(creep)` novo (torre
  primeiro, resto depois); `pickLoad`'s gate booleano e `pickDeliver`'s
  cascata atualizados pra usá-la; comentários dos dois atualizados.
- `test/smoke.js`: teste — torre não-crítica mais longe vence um lab mais
  perto (prova que é prioridade, não proximidade).

## Out of scope

- Storage (dump geral) — continua fora do pool comparado, como decisão
  separada (não é um "consumidor" com propósito, é só um destino de
  sobra). Mantido exatamente na mesma posição relativa da cascata.
- Mudar a ordem essencial (spawn/ext/torre crítica) — inalterada.
- Sub-priorizar dentro da própria faixa 50%-100% da torre (ex.: 90% antes
  de 55%) — usuário já tinha confirmado antes que toda essa faixa conta
  como uma única prioridade satisfatória, sem gradação interna.

## Acceptance criteria

1. Com uma torre não-crítica mais longe e um lab/factory/container do
   controller mais perto, ambos elegíveis, o hauler entrega na torre
   (prioridade vence proximidade). *(smoke)*
2. Com só a torre elegível (sem lab/container por perto), ela continua
   sendo escolhida normalmente. *(smoke, cobertura já existente do 0073)*
3. `node test/smoke.js "$(pwd)"` verde.
4. `npx grunt` builda sem erro.

## Constitution check

- Nenhuma varredura nova de `Game.creeps`/`room.find` — reaproveita
  `roomCache.myStructures` já memoizado.
- Nenhum objeto de jogo em Memory.
- Fail-soft preservado — devolve `null` quando nenhum dos dois acha nada,
  mesmo padrão de antes.
- Testável offline via smoke.

## Outcome

Entregue. `satisfactoryConsumer(creep)` = `toppableTower(creep) ||
optionalConsumer(creep)` — torre não-crítica sempre tem prioridade dentro
do tier satisfatório, usada tanto no gate de `pickLoad` quanto na cascata
de `pickDeliver`. `node test/smoke.js` verde (762 assertions), `npx
grunt` gerou `dist/main.js` sem erro.
