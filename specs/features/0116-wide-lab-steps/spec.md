# 0116 — Etapas de lab largas (todas as etapas em vários labs de saída)

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-10-03

## Problem

Só a ÚLTIMA etapa de uma cadeia de lab roda em vários labs de saída (modo largo, 0111). As
intermediárias usam UM lab cada (o produto precisa ficar junto para a etapa seguinte) e, com
as ondas do 0115, rodam concorrentes, mas ainda um lab por etapa. Para XLH2O (lote de 3000;
`LH` 15, `OH` 20, `LH2O` 10, `XLH2O` 60 ticks por reação de 5) isso é ~22500 ticks. O trabalho
total (~63000 lab-ticks) dividido por 8 labs reagindo ao mesmo tempo seria ~7900.

## Desired outcome

Com os labs centrais (slots 1 e 2) como entradas, TODOS os outros labs alcançam as duas
entradas e podem reagir ao mesmo tempo. A estratégia "larga" roda cada etapa assim, uma após a
outra: o produto de cada etapa é esvaziado para o storage e a etapa seguinte o recebe como um
reagente qualquer. O planner estima o tempo das duas estratégias (ondas com produto no lugar,
e larga) e escolhe a mais rápida; a larga só entra se ganhar `craft.wideMinGain` (20%), por
causa do trânsito extra do hauler.

## In scope

- `labSlots.planPhases` aceita `options.work` ({produto: {batches, cooldown}}) e então devolve
  o plano escolhido com `strategy` ("waves" | "wide") e o tempo estimado `T`.
- `planWide`: entradas (1, 2) em todas as fases, saída = lab que alcança as duas, fases em
  sequência (uma onda por fase), sem produto no lugar.
- `craftChain.buildQueue`: com a estratégia larga, toda etapa de lab sai com `outputs` largos,
  `keep: false` e `consumes: []`.
- `marketPricing`/`craftPlanner`: o `T` das etapas de lab vem de `ctx.labTime(steps)` (tempo da
  estratégia escolhida); substitui `ctx.waves` do 0115.
- `craft.labStrategy` ("auto" | "waves" | "wide") e `craft.wideMinGain` (0.2).

## Out of scope

- Pipelining entre etapas (iniciar a seguinte quando já há produto). Na estratégia larga as
  etapas dividem os mesmos labs, então não há o que sobrepor; na de ondas só ajudaria com 1 lab
  por etapa, que a larga supera. Descartado por estimativa (ver tasks.md).
- Modelar a vazão do hauler: a estimativa supõe que os labs de entrada são reabastecidos a
  tempo. Com 8 saídas cada reagente é consumido a 8×5/T por tick (2,7/tick para T=15).
- Mais de uma cadeia de lab por sala.

## Acceptance criteria

1. `planPhases` sem `options.work` continua devolvendo exatamente o plano do 0115.
2. Com `work`, o plano traz `strategy` e `T`; para XLH2O em 10 labs a estratégia larga tem T
   menor que a de ondas e é a escolhida em "auto"; `labStrategy: "waves"` força as ondas e
   `"wide"` força a larga (se houver labs centrais).
3. A estratégia larga usa as entradas (1, 2) em todas as fases, uma onda por fase, e cada saída
   alcança as duas entradas.
4. `wideMinGain` impede a estratégia larga quando o ganho é pequeno; sem os labs 1 e 2 construídos
   ela não existe.
5. `buildQueue` com a estratégia larga: todos os itens de lab têm `outputs` largos, `keep` falso e
   nenhum `consumes`; com ondas, o comportamento do 0115.
6. O `T` do candidato usa o tempo da estratégia escolhida, e o executor monta a fila da mesma
   estratégia (planner e executor chamam a mesma função com os mesmos dados).
7. No executor, a etapa seguinte só começa depois que o produto da anterior foi esvaziado dos
   labs (barreira) e o recebe do storage.
