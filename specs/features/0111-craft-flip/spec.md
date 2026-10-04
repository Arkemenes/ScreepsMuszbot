# 0111 — Craft flip (fabricação lucrativa em factory e lab)

- **Status:** done (implementação v1; sem validação em jogo real - ver tasks.md, "Desvios")
- **Owner:** Arkemenes
- **Created:** 2026-10-01

## Problem

O bot só lucra com arbitragem instantânea do mesmo `resourceType` (0110,
`src/utils/marketFlip.js`). Fabricar — `COMMODITIES` na factory, `REACTIONS`
nos labs, inclusive em vários níveis — nunca é avaliado como fonte de lucro.
Os blocos que existem hoje não sustentam isso:

- `utils/market.js` `derivedPrice()` soma as medianas de bid/ask dos
  componentes recursivamente, mas ignora taxa de energia, cooldown, `level` e
  o tempo de execução. O resultado não diz se dá lucro *depois* do tempo que a
  cadeia leva, nem se o produto ainda terá comprador quando terminar.
- `marketFlip.js` `guardrailBlocks()` compara o ask com `fairPrice × 1,05`.
  Não mede liquidez, volatilidade nem presença do mercado, e barra também a
  compra barata (que nunca é um risco).
- `structures/factory.js` produz o que `Memory.rooms[r].factoryProduct` manda e
  só confere se os componentes estão estocados. Não confere `factory.level` nem
  operador (`PWR_OPERATE_FACTORY`); `refining.js` `setFactoryProduct` recusa
  nível ≥ 1 só no console manual.
- `roles/hauler.js:161` `labFactoryPowerSpawnNeedingEnergy()` seleciona
  **qualquer** lab/factory/power spawn com `getFreeCapacity(RESOURCE_ENERGY) > 0`,
  mesmo sem `factoryProduct`/`labReaction`. A factory acumula até a
  capacidade total de energia parada, sem cadeia que a use.
- `setLabReaction` escolhe 3 labs por alcance a cada chamada; não há papéis
  fixos de entrada/saída nem tabela de slots.
- O grid `rcl` do stamp de labs (`rooms/architect.js:239`) manda construir os
  dois labs centrais por último (RCL 8), de modo que sem eles nenhuma
  distribuição ótima de entradas/saídas existe antes do RCL 8.

## Desired outcome

Um planner (modo `test` por padrão) avalia, por sala, cadeias de fabricação em
factory e lab e só as executa quando o lucro conservador cobre o risco de preço
durante o tempo da cadeia. O preço usado é sempre o pior entre a mediana de 7
dias e o instantâneo do livro. Nada é comprado antes de o pré-voo provar que a
cadeia inteira é viável na sala; lab e factory são transitórios — recebem
exatamente o lote quando há cadeia/reação ativa e são drenados ao storage ao
fim. O flip instantâneo (0110) passa a usar o mesmo módulo de preço e as mesmas
regras de guardrail. Um ledger compara lucro realizado e estimado e dispara
disjuntores, de modo que o plano de lucro seja auditável, não um palpite.

## In scope

### Preço e lucro (módulo compartilhado)

- Novo `src/utils/marketPricing.js`, consumido pelo planner
  de craft e pelo `marketFlip`. Fonte única: histórico próprio de 7 dias
  (`temporalSnapshots` de `utils/market.js`: mediana ponderada de bid/ask,
  volume, σ relativo). `Game.market.getHistory` **não** é usado.
- Receita = `min(bid mediano 7d, bid instantâneo)`. Custo de insumo comprado =
  `max(ask mediano 7d, ask instantâneo)`. Insumo próprio = bid conservador
  (custo de oportunidade). Energia (taxa de entrega + energia de produção) pelo
  ask de energia.
- Margem exigida = `piso + zConf · σ_rel · √(T / 3600)`. `zConf` é derivado
  de `craft.confidence` (nível de confiança unilateral, default 0,95 →
  1,645); `piso` default 1% (só contra ruído). σ_rel vem do histórico; o
  escalonamento por `√(T/3600)` é extrapolação para `T` < 1h (amostras de 1h),
  e é o ledger que confere se a confiança está sendo atingida.
  `T` = cooldown × lotes + logística (viagens de hauler, fases em série,
  retenção), somado em todos os níveis; em labs, os lotes são divididos pelo
  número de labs de saída ativos da fase.
- Todos os parâmetros em `Memory.settings` / `utils/config.js` (`craft.*`),
  nenhum literal.

### Guardrails

- Compra barata (ask abaixo da mediana) nunca é barrada — vale no craft e no
  flip. Guardrails de liquidez/outlier valem na perna de venda e na compra cara.
- Liquidez do produto e dos insumos comprados: presença ≥ 90% das amostras com
  bid e ask; volume mediano do bid ≥ 2× o lote (ask idem para insumos
  comprados); spread ask/bid mediano ≤ 1,30; σ_rel ≤ 15%; ≥ 48 amostras (mesmo
  com a janela de 7d ainda `warming`).
- Capital: teto de 25% dos créditos em andamento (`committedCredits` único,
  compartilhado entre flip e craft), 5% por cadeia. **Revisado 2026-10-02:** o
  paralelismo é limitado pelas estruturas, não por um contador - uma cadeia por
  tipo de estrutura (factory, lab) por sala, salas independentes; `craft.maxActive`
  (0 = sem teto) é opcional.
- Cada descarte registra qual guardrail barrou.

### Pré-voo, compra e falhas

- Pré-voo sobre a cadeia **inteira** (todos os níveis) antes de gastar crédito:
  viabilidade, liquidez, margem com `T`, créditos livres. A sala é reservada;
  só então todos os insumos são comprados de uma vez; o pré-voo é rechecado
  antes de cada compra. Nunca se compra o que não dá para processar.
- Cadeia empacada depois da compra: reter os insumos até 3 dias, procurar
  processamento que agregue valor com eles, e então vender pelo bid conservador.
  A perda entra no ledger.
- Bid do produto abaixo do break-even na hora da venda: reter até 3 dias, depois
  ordem de venda no piso. Nunca vender no prejuízo.

### Lab e factory transitórios

- Só recebem recurso quando há cadeia/reação ativa, no tamanho exato do lote.
  Meta de energia da factory = `components.energy × lotes pendentes`; labs = 0
  (reação não gasta energia; não há boost automático).
- Ao fim/falha/cancelamento, o hauler drena tudo ao storage (energia, insumos,
  produto). Inclui o legado de energia já parada hoje. O dreno é um estado da
  máquina de estados da cadeia, não uma rotina solta.
- Produto vai ao storage e a venda o leva ao terminal. **Revisado 2026-10-02:** o
  "direto ao terminal" original foi retirado - `terminalOps` devolve ao storage todo
  estoque do terminal que nenhuma operação reclama, então o produto voltava. O
  produto final é vendido conforme sai (venda parcial), no piso de break-even.
- `labFactoryPowerSpawnNeedingEnergy` passa a respeitar essa meta; power spawn
  não muda.

### Labs

- Reordenar o grid `rcl` do stamp de labs em `rooms/architect.js`
  (`structures` e `ramparts` inalterados): RCL 6 → (2,3), (3,2), (1,2);
  RCL 7 → (2,1), (3,4), (4,3); RCL 8 → (1,1), (1,4), (4,1), (4,4)
  (linha, coluna do stamp).
- Slots fixos em árvore, derivados dos offsets do stamp (linha,coluna),
  resolvidos uma vez e guardados no heap. O stamp não tem rotação nem
  espelhamento, então os offsets bastam. Numerados na ordem de construção:

  | Slot | Posição | Papel | RCL |
  |---|---|---|---|
  | 1 | (2,3) | entrada A | 6 |
  | 2 | (3,2) | entrada B | 6 |
  | 3 | (1,4) | saída de 1+2 | 6 |
  | 4 | (1,1) | entrada C | 7 |
  | 5 | (2,1) | entrada D | 7 |
  | 6 | (1,2) | saída de 4+5 | 7 |
  | 7 | (3,4) | saída de 3+6 (2º nível) | 8 |
  | 8 | (4,3) | entrada do catalisador | 8 |
  | 9 | (4,4) | saída de 7+8 (3º nível) | 8 |
  | 10 | (4,1) | saída extra de 1+2 | 8 |

  Os slots 1 e 2 alcançam (alcance ≤ 2) todos os outros 8 labs: com a árvore
  ociosa, um produto de 1 nível pode usar o **modo largo** (1+2 alimentando
  todas as saídas). Verificado por script na geometria real
  (`runReaction`: o lab que reage fica a alcance ≤ 2 dos dois de entrada).
- Plano de fases por receita, escolhido pela menor quantidade de
  remanejamentos que cabe nos labs construídos, nesta ordem de preferência:
  (1) árvore sem mover nada (RCL 8); (2) reutilizar lab no lugar: o hauler drena
  os resíduos de um lab ocioso que alcance os dois intermediários e a reação
  seguinte roda nele (ex.: RCL 7, LH2O: 1+2→3, 4+5→6, depois drenar slot 1 e
  3+6→1; 3º nível: carregar o catalisador no slot 2 e 1+2→3); (3) estacionar o
  intermediário no storage entre fases (RCL 6, 3 labs: LH e OH em série com
  retenção no storage, depois LH no slot 1, OH no slot 2, saída no slot 3).
  Cada fase em série, drenagem, carga e estacionamento soma em `T`; remanejar
  nunca é de graça.
- Salas legadas com labs na ordem antiga do stamp: o usuário demole à mão; não
  há fallback no código. O gate descarta a sala com motivo quando não existe
  plano de fases que caiba nos labs construídos (inclui lab destruído).

### Viabilidade por sala (gate)

- Estrutura ativa (factory ou labs) + storage + terminal.
- `recipe.level === factory.level`; nível ≥ 1 exige operador, detectado
  dinamicamente (`Game.powerCreeps` com `PWR_OPERATE_FACTORY` e efeito ativo).
- Todo componente obtível (estoque próprio ou ask comprável com liquidez).
- Lote cabe na capacidade, hauler disponível, créditos livres.
- Níveis 0 e 1 habilitados na primeira entrega; o modelo de custo suporta
  qualquer profundidade. Por nó: fabricar vs comprar pelo menor custo
  conservador. Níveis em sequência na mesma sala, máquina de estados com stall
  guard.

### Destino de um material (vender ou processar)

- Índice reverso `material → receitas que o usam` (`COMMODITIES` e
  `REACTIONS`), construído uma vez e guardado no heap.
- Para um material M em estoque (sobra de cadeia, insumo retido por falha,
  produto de um nível): para cada receita que usa M, ganho esperado = lucro
  líquido (M ao bid conservador como custo de oportunidade, o que falta ao ask
  conservador, energia, margem com `T`, receita do produto ao bid
  conservador) menos o que se obteria vendendo M como está.
- Escolhe a opção de maior ganho que passa no gate, na liquidez e no pré-voo;
  se nenhuma superar a venda direta, vende M como está. Só compra o que falta
  depois que o pré-voo da receita passa.
- Um nível por decisão; o produto resultante reentra na decisão quando
  existir, formando cadeias longas sem busca em profundidade. Roda ao fim de
  uma cadeia, em insumo retido por falha e em sobras no storage. Usa o mesmo
  avaliador do planner principal.

### Operação

- Modo `test` por padrão (`craft.test`): só loga candidatos, lucro estimado e
  motivo de descarte; comando de status no estilo `marketFlipStatus`.
- Respeita `factoryProduct`/`labReaction` manuais; o que o planner define é
  marcado `factoryProductAuto` (e equivalente para lab) para trocar/cancelar sem
  tocar no pin manual.
- Ledger por cadeia: custo real (créditos, energia, insumos próprios a preço de
  oportunidade), receita real, realizado × estimado.
- Disjuntor por produto: 3 execuções negativas seguidas → suspenso 24h, depois
  reentra em `test`. Global: soma das últimas 10 execuções negativa → planner
  volta a `test` e loga.

### Flip (0110)

- Mantém as ordens instantâneas como preço de execução. Troca o guardrail
  `fairPrice × 1,05` por filtro de outlier só na perna de venda (preço dentro de
  `z·σ` da mediana de 7d), adiciona a margem de tempo com `T` curto e os
  guardrails de liquidez, e usa `marketPricing`.

## Out of scope

- Transferência de intermediários entre salas (um nível numa sala, outro em
  outra) — ROADMAP.
- Níveis 2–5 de commodity por padrão (modelo pronto, gate desligado até haver
  factory no nível e operador).
- Boost automático de creeps com compostos de lab.
- `Game.market.getHistory`.
- Comprar para estocar sem cadeia definida.
- Migração/fallback para salas com labs na ordem antiga do stamp.
- Alterar o power spawn.

## Acceptance criteria

1. The smoke test asserts receita = `min(bid mediano, bid instantâneo)` e custo
   comprado = `max(ask mediano, ask instantâneo)`; piorar só o instantâneo piora
   o lucro, melhorá-lo não melhora.
2. The smoke test asserts que a margem exigida cresce com `T` e com `σ_rel`.
3. The smoke test asserts que ask abaixo da mediana não é barrado por nenhum
   guardrail de compra (craft e flip), e que a perna de venda é barrada por
   cada guardrail de liquidez (presença, profundidade, spread, σ_rel, amostras).
4. The smoke test asserts que nenhuma compra ocorre quando o pré-voo falha em
   qualquer nível: sem operador para `level ≥ 1`, sem lab central, sem créditos,
   componente sem liquidez.
5. The smoke test asserts que `committedCredits` é único entre flip e craft e
   respeita 25% total / 5% por cadeia / 1 produto por sala.
6. The smoke test asserts que lab/factory sem cadeia ativa não recebem energia e
   que a energia legada é drenada ao storage; com cadeia ativa a meta é
   `components.energy × lotes pendentes`.
7. The smoke test asserts que fim, falha e cancelamento da cadeia passam pelo
   estado de dreno e deixam lab/factory vazios.
8. The smoke test asserts a tabela de slots em árvore: o grid `rcl`
   reordenado constrói 3/6/10 labs nas faixas RCL 6/7/8 na ordem da tabela, e
   toda aresta (saída ↔ duas entradas) tem alcance ≤ 2; os slots 1 e 2
   alcançam todos os outros 8 labs (modo largo).
9. The smoke test asserts que sala sem plano de fases possível nos labs
   construídos (ex.: lab central ausente) é descartada com motivo.
10. The smoke test asserts o plano de fases por faixa: reação de 2 níveis
    planejada em RCL 8 (árvore), RCL 7 (reutilização de lab) e RCL 6
    (estacionamento no storage); a ordem de preferência escolhe o plano com
    menos remanejamentos, e `T` cresce com cada fase/drenagem/estacionamento.
11. The smoke test asserts a margem `piso + zConf·σ·√(T/3600)` com `zConf`
    derivado de `craft.confidence` (0,95 → 1,645).
12. The smoke test asserts a decisão vender-ou-processar: escolhe a receita de
    maior ganho sobre a venda direta, vende como está quando nenhuma supera, e
    não compra o que falta antes de o pré-voo da receita passar.
13. The smoke test asserts o fallback de venda: bid abaixo do break-even retém
    até 3 dias e depois lista no piso; nunca vende no prejuízo.
14. The smoke test asserts os disjuntores: 3 negativos → produto suspenso 24h;
    10 execuções somando negativo → planner em `test`.
15. The smoke test asserts que em `craft.test = true` nenhuma compra, produção
    ou venda é aberta, e que o status lista candidatos e motivos de descarte.
16. The smoke test asserts que `factoryProduct`/`labReaction` manuais não são
    sobrescritos.
17. The smoke test asserts que o flip usa o filtro de outlier só na perna de
    venda e continua abrindo a operação em livro cruzado.
18. Em jogo, `node test/smoke.js` verde, `npx grunt` gera `dist/main.js`.

## Constitution check

- **CPU:** avaliação de cadeias em intervalo configurável, sobre dados já no
  heap (`temporalSnapshots`); sem novo `room.find` por tick (usa
  `utils/roomCache`) nem nova passada em `Game.creeps` (usa `utils/census`).
- **Memory:** só ids e estado compacto da cadeia/ledger; nunca objeto de jogo.
  Offsets de lab, medianas e σ são dados derivados → heap.
- **Fail-soft:** planner e dreno chamados via `guard()` em `main.js`; falha em
  um não derruba o tick.
- **Stall guard:** máquina de estados da cadeia com teto de ticks por estado;
  sem `while (true)`.
- **Config:** todos os números em `Memory.settings`/`config.js`.
- **Testável offline:** tudo coberto por `test/smoke.js` com mocks de
  `Game.market`, `COMMODITIES`, `REACTIONS`.

## Open questions

Nenhuma em aberto. Resolvidas no grilling: nome `marketPricing`; `z` derivado
de `craft.confidence` e piso de 1% (o ledger calibra o piso); slots de lab em
árvore com remanejamento por faixa de RCL; "processamento que agregue valor"
resolvido pela regra vender-ou-processar, um nível por decisão.
