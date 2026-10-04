# 0116 — Tarefas

- [x] T1 `labSlots`: `planWide`, estimativa de T, `planPhases(..., {work})` escolhendo a estratégia + testes
- [x] T2 `craftChain.buildQueue`: itens largos na estratégia larga + testes (executor ponta a ponta)
- [x] T3 `craftPlanner`/`marketPricing`: `ctx.labTime` no lugar de `ctx.waves` + testes
- [x] T4 config, ROADMAP, ARCHITECTURE; definição de pronto (check, smoke, grunt)

## Notas de execução (2026-10-03)

- **Por que pipelining ficou de fora.** Estimativa (XLH2O, lote 3000; `LH` 15, `OH` 20, `LH2O` 10,
  `XLH2O` 60 ticks por reação de 5, ~63000 lab-ticks de trabalho): ondas com 1 lab por etapa
  ~22500; ondas + pipelining ~13500; todas as etapas em 8 labs ~7875. O que decide é quantos labs
  reagem ao mesmo tempo, não a ordem. Na estratégia larga as etapas dividem os MESMOS labs
  (entradas 1 e 2, saídas nos outros 8), então não há o que sobrepor; e pipelining com 1 lab por
  etapa perde para a larga. Só valeria numa sala sem os labs centrais, onde a larga não existe.
- **Estimativas por número de labs** (mesma árvore): 10 labs: wide 7875 x waves 22500 (escolhe
  wide); 6 labs (RCL 7): 15750 x 27000 (wide, 4 saídas); 3 labs (RCL 6): 63000 x 63000 (empate,
  fica nas ondas por não haver ganho de 20%).
- **Risco principal, não medido: vazão do hauler.** Com 8 saídas cada reagente é consumido a
  8x5/T por tick (2,7/tick para T=15) e o produto sai pelo dreno. A estimativa de T supõe os
  labs de entrada reabastecidos a tempo. Se os haulers não derem conta, o tempo real fica entre
  a estimativa larga e a das ondas. Alavancas: `craft.labStrategy: "waves"` ou subir
  `craft.wideMinGain`; reduzir saídas não está implementado.
- **Transição.** Cadeias abertas antes do deploy não têm `wave` nem estratégia larga e seguem
  como estavam; só as novas escolhem por estimativa. Salas com 10 labs passam a usar a larga
  por padrão.
- **Cobertura.** Plano (T e escolha, com 10/6/3 labs e as chaves de configuração), fila
  (saídas largas, sem produto no lugar, entradas 1 e 2), executor ponta a ponta (início, barreira
  entre etapas, dreno do produto, etapa final, venda) e T do planner; 5 mutações pegas.

## craftReplan (2026-10-03, pedido do usuário)

- **Problema.** Uma cadeia mantém a fila com que foi aberta; as abertas antes do deploy nunca
  recebem a estratégia larga. Console: `craftReplan()` (todas as salas) ou
  `craftReplan("W7N49")`; `craftChain.replan`.
- **O que faz.** Só em cadeias de lab em `buying`/`working`. Refaz, com o plano ATUAL, apenas as
  etapas ainda não iniciadas; o que está rodando ou já terminou fica como está, mas deixa de fixar
  o produto no lugar (`keep` falso na etapa e na reação). Só troca se o plano atual da cadeia for
  o largo; se a ordem/produtos da fila nova não batem, não troca. O produto de uma etapa anterior
  preso num lab é solto para o dreno levar ao storage, exceto num lab que é ENTRADA de uma etapa
  pendente (a etapa larga o lê ali mesmo). Repetir é inofensivo.
- **Achado.** No plano de ondas os intermediários da raiz já ficam nos labs centrais 1 e 2, que
  são as entradas da etapa larga: ela começa de imediato, consumindo o produto no lugar.

