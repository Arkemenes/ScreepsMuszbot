# 0124 — Swing trade e valor-alvo por recurso/sala

- **Status:** spec
- **Owner:** Arkemenes
- **Created:** 2026-10-03
- **Relacionadas:** 0110 (market flip), 0111 (craft flip, `marketPricing`),
  0100 (preço direto), 0054 (logística/reservas), `terminalOps`

## Problem

`utils/marketFlip.js` (0110) faz **arbitragem instantânea**: acha um par
ordem-de-venda/ordem-de-compra com lucro líquido e executa as duas pontas
(horizonte `marketFlip.horizonTicks`, 60). Não há estratégia de **posição**:

- Comprar quando o preço está **abaixo do normal** e segurar até ficar **caro**
  (swing trade). `marketPricing` já mantém histórico de 7 dias (mediana, sigma,
  liquidez, `outlier`), mas só é usado como guarda-corpo, não como sinal de
  entrada/saída.
- Falta o conceito de **valor-alvo por recurso por sala**: quanto de cada
  recurso a sala *deveria* manter (para consumo próprio + folga), abaixo do
  qual comprar quando barato, e acima do qual vender o **excedente** quando
  caro. Hoje o excedente só sai por `terminalOps`/venda de excedente, sem
  critério de preço-alvo, e o estoque não é um orçamento por sala.
- Capital e risco: o bot precisa limitar crédito empatado (`committedCredits`
  já existe no flip) e tempo máximo de posição.

## Desired outcome

Uma camada de **posições** sobre `marketPricing`:

1. **Alvo por (sala, recurso):** `target.min` (piso: abaixo disso compra se o
   preço estiver barato) e `target.max` (teto: acima disso vende excedente se
   estiver caro), com defaults vindos do consumo real (labs, factory, boosts,
   energia) e *override* em `Memory.settings`.
2. **Sinal de preço:** "barato" = ask abaixo de `buyBelow` × mediana 7d
   (ajustado por sigma); "caro" = bid acima de `sellAbove` × mediana 7d.
3. **Posição aberta:** compra via `terminalOps.buy`, registra custo médio,
   quantidade e prazo; vende quando o preço-alvo (custo + margem líquida da
   energia de transação) é atingido ou o prazo expira (stop por tempo/perda).
4. **Orçamento:** teto de crédito em posições, teto por recurso, não compra
   o que o flip instantâneo já cobre.

## In scope

- Módulo `utils/swingTrade.js` (scanner + gerente de posições) em cima de
  `marketPricing`/`terminalOps`, sem alterar `terminalOps.js` (mesma restrição
  do flip).
- Cálculo do alvo por sala (`utils/roomTargets.js`) a partir de consumo e
  `Memory.settings.targets`.
- Flag `swing.test` (default **true**: só loga, igual ao `marketFlip.test`).
- Consoles: `swingStatus()`, `swingTargets(room?)`, `setTarget(room, res, min,
  max)`.

## Out of scope

- Mudar o flip instantâneo (0110) ou o cálculo de preço de commodities (0100).
- Arbitragem entre shards, opções/futuros, mercado de pixels/CPU.

## Acceptance criteria

1. Smoke: com histórico sintético (mediana 100), ask 85 abaixo do piso da sala
   abre posição; ask 105 não abre.
2. Smoke: posição aberta vende quando o bid cobre custo + `swing.minProfit`
   líquido de energia; stop por prazo vende (ou cancela) com a razão logada.
3. Smoke: excedente acima de `target.max` só sai quando `bid > sellAbove ×
   mediana`; abaixo disso não vende (aguarda).
4. Smoke: `committedCredits` somado (flip + swing) nunca passa do teto.
5. `swing.test=true` nunca chama `terminalOps.buy/sell` (assert).
6. `marketFlip` continua verde sem alteração (regressão).

## Constitution check

- §1: `getAllOrders` já é varrido pelo flip a cada `scanInterval` — reaproveitar
  o mesmo scan, nada novo por tick. §2: posições em `Memory.swing` (só ids/
  números). §3 guard. §6 todos os limiares em `config.swing.*`. §7: sem
  histórico suficiente para o recurso, no-op (bloqueia como o flip faz).

## Open questions

- Alvos: calculados do consumo ou fixos por tabela? Quais recursos entram na
  1ª versão (minerais base, compounds, energia, commodities)?
- Margem desejada e prazo máximo de posição? Perda máxima antes de stop?
- Orçamento: % do saldo em créditos?
- Pode competir com o excedente do `terminalOps` (conflito de dono do
  estoque)? Quem tem prioridade?
