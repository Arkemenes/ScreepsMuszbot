# 0153 — Revisão da política de listagens de venda (com tratamento de pixel)

- **Status:** spec (aprovada pelo dono em 2026-10-15; implementação por outro agente)
- **Owner:** ARK-128 (issue ARK-138)
- **Created:** 2026-10-15
- **Regra de mercado do dono (obrigatória):** todas as taxas sempre na conta; nada fica "indefinidamente vendendo";
  não perder taxa já paga sem necessidade (ver `docs/roadmap-otimizacao-e-capacidades-2026-10-15.md` §3b)

## Mecânica de taxas (referência para todo o spec)

| Operação | Taxa | Observação |
|---|---|---|
| Criar ordem | **5% x preço x quantidade total** | paga na criação; **não volta** ao cancelar nem ao vender por outro caminho |
| `changeOrderPrice` **para baixo** | **0** | só reduz o preço; a taxa já paga continua valendo para a ordem |
| `changeOrderPrice` **para cima** | 5% x (aumento de preço) x quantidade restante | o código já documenta isso (`terminalOps.listResidual`) |
| `extendOrder` (acrescentar quantidade) | 5% x preço da ordem x quantidade acrescentada | a ordem mantém o id |
| `cancelOrder` | 0, mas **perde** a taxa paga sem venda | |
| `deal` em ordem existente (bid) | **sem taxa de listagem** | recursos de sala pagam frete em energia; **pixel não tem sala** (sem frete) |

Consequência para "não perder a taxa": a taxa de uma listagem existente é **afundada**. Ela só é "perdida" se a ordem for
**cancelada sem vender**. Manter a ordem e **baixar o preço** (grátis) aproveita a taxa já paga; vender por `deal` em um bid a
deixa sem uso. Para quantidade nova, `extendOrder` paga 5% de novo só sobre o acrescentado.

## Problem

Auditoria `ordersAudit()` (2026-10-15 23:06, tick 83674040):

- 89 ordens próprias: **30 ativas, 59 esgotadas** (`remaining 0`; cancelar é grátis).
- Taxa estimada (5% x preço atual x total): **7,66 M** no total, **5,34 M** nas ativas.
- **19 ativas acima do melhor concorrente em mais de 5%**: taxa **3,88 M**, valor travado **74,6 M** de créditos.
- **Pixel:** 997 unidades a 62.947 contra o melhor ask de 56.000 (+12,4%), idade 0d: **3,15 M da taxa (81%)**, 62,8 M travados.
- **Oxigênio (O):** 4 listagens (186 mil unidades) a 38,9 contra ask 22,9 (+69% a +106%); taxa ~0,5 M; uma com 22 dias.
- Outras entre +7% e +23% (`lemergium_bar`, `utrium_bar`, `keanium_bar`, `UH2O`, `GO`).

Causa: o piso é `limit / 0,95` com `limit` derivado de uma **referência histórica** (janela 7200 ticks); com o mercado em
queda o piso fica acima do mercado, a ordem paga a taxa e espera. Prazo: `swing.listingLifetime = 1.209.600` ticks (o código
assume 1 tick = 1 s; a ~4,1 s/tick são **~57 dias**). O estoque listado fica reservado (claims) e não serve a outras frentes.

## Desired outcome

Listar só quando a ordem tem chance real de vender; nada parado por semanas; taxa já paga aproveitada (baixar preço em vez de
cancelar); pixels vendidos sem criar taxa nova desnecessária.

## In scope

1. **Listar só se competitiva** (`swing.listOnlyCompetitive`, padrão true). Cria a listagem só se
   `preço <= melhor ask - passo` (ou não há asks) **e** `preço >= piso`. Senão **mantém o estoque, sem taxa**, e reavalia no
   próximo scan (120 ticks). Vale para `swingTrade.tick` (ramo `eligible-listing`) e `terminalOps.listResidual`.
   *Valor esperado:* ~3,9 M de taxa evitada só neste snapshot.
2. **Descida de preço grátis para listagens existentes** (`swing.descent`, desligado por padrão até o dono fixar os pisos):
   a cada `repriceInterval`, uma listagem acima do melhor ask por mais de `swing.descent.afterTicks` desce `swing.descent.stepRatio`
   (ex. 2%) em direção ao melhor ask, **nunca abaixo do piso configurado do recurso** (`swing.descent.floor[resource]`, ou o piso
   atual). Descer **não paga taxa**. Cancelar só no prazo (item 4).
3. **Limpar ordens esgotadas** (`market.cancelFinished`, padrão true): cancela as com `remaining 0` (grátis; reduz ruído).
   **Não** cancela listagens ativas antes do prazo.
4. **Prazo em tempo real:** `swing.listingLifetimeDays` (padrão 7) convertido por um estimador de segundos por tick
   (`tickRate.js`, `Date.now`, média móvel, fallback 4,1 s). Ao vencer, cancela (a taxa é perdida, e a decisão é registrada).
5. **Pixel** (seção própria abaixo).
6. **Orçamento diário de taxa de listagem** (`market.listingFeeDailyBudget`), condicional: só se, depois de 1–2, a taxa ainda
   for relevante.
7. `ordersAudit()` (já publicado) passa a contar também `descended` e `cancelledFinished` no resumo.

## Pixel (decisão do dono: não perder a taxa; vão entrar ~1.000 pixels da Steam)

Pixel é `marketOnly` (`terminalOps`, intershard): não há sala nem frete, então **`deal` em bid não paga taxa nem energia**.

- **Listagem existente (997 a 62.947):** **não cancelar.** Se o dono definir `pixel.minPrice`, ativar a descida grátis (item 2) até
  esse mínimo para aproveitar a taxa já paga. Sem `pixel.minPrice` definido, não mexe.
- **Quantidade nova (1.000 da Steam e os gerados pelo bot):** em ordem de preferência:
  1. **`deal` em bids existentes** com `bid >= pixel.minBid` (sem taxa, sem frete), na profundidade disponível;
  2. o restante entra na **ordem existente por `extendOrder`** (paga 5% x preço x acrescentado, **sem criar uma segunda ordem
     de pixel**), **somente se** `0,95 x preço da ordem >= melhor bid x (1 + pixel.listMargin)`; senão **mantém em estoque** e
     reavalia no próximo scan;
  3. nunca criar ordem nova de pixel enquanto houver uma ativa.
- **Fórmula de decisão por unidade:** `valor_listar = 0,95 x P_ordem - B_bid`. Se `<= 0` (ou a margem exigida), vender por `deal`.
  Para 1.000 pixels a ~63 mil, a taxa de estender é ~3,15 M: só compensa se o ganho esperado sobre o bid for maior que isso.
- Preços de pixel flutuam: usar o `marketPrice("pixel")`/snapshot com **bid e ask executáveis**, não o fair (regra §3b).

## Out of scope

- Mudar a margem do swing; cancelar listagens ativas por decisão automática antes do prazo; criar ordens de compra de qualquer tipo.

## Acceptance criteria

1. The smoke test asserts no sell listing is created when its price is above the best competing ask, and that the stock stays free (no claim, no fee).
2. The smoke test asserts a competitive listing (<= best ask - step, >= floor) is created exactly as before, with the same price, amount and fee.
3. The smoke test asserts a price **decrease** on a live listing charges no fee and keeps the order id, and an **increase** charges 5% x increase x remaining.
4. The smoke test asserts the descent never goes below the configured floor and only runs for listings above the best ask for longer than `afterTicks`.
5. The smoke test asserts finished orders (`remaining 0`) are cancelled and active listings are not.
6. The smoke test asserts the lifetime is expressed in real time (days) and `swing.listingLifetimeDays` overrides it.
7. The smoke test asserts new pixels go first to existing bids >= `pixel.minBid` (no listing fee), then to `extendOrder` of the existing order only when `0.95 x P >= bid x (1 + listMargin)`, never to a second pixel order, otherwise stay in stock.
8. The smoke test asserts the existing pixel listing is never cancelled by the policy.
9. Live: `ordersAudit()` after the deploy shows `feeOnAboveMarket` ~0 for orders created after it and the finished orders gone.

## Constitution check

Config em `Memory.settings` (`swing.*`, `pixel.*`, `market.*`); sem varredura nova por tick (usa `orderBook.byResource`);
`guard()` por subsistema; nenhuma Memory nova por tick; stall guard na descida (um passo por ordem por intervalo).

## Decisões com padrão proposto (o dono não tem número; valem até ele ajustar)

Todos os padrões são **relativos ao mercado do momento** (preços flutuam), nunca valores absolutos. `R` = `fairPrice` suavizado do
`market.snapshot()` (janela longa, com confiança); bids e asks são **executáveis** (profundidade real).

| # | Parâmetro | Padrão proposto | Argumento |
|---|---|---|---|
| 1 | `pixel.minBid` (vender por `deal` num bid) | `R x 0,95` | Segurar pixel **não custa nada** (sem taxa, sem decaimento), então não há razão para vender com mais de 5% de desconto sobre a média histórica; o custo de esperar é só capital (o caixa é de 142 M). Se o bid estiver abaixo disso, mantém em estoque e reavalia. |
| 2 | `pixel.listMargin` (estender a ordem) | `3%` | Listar rende `0,95 x P - bid` por unidade só **se vender**, e demora. 3% (~1,7 mil por pixel, ~1,7 M por 1.000) cobre a incerteza de preço de uma semana e evita pagar ~3,15 M de taxa por um ganho marginal. Se o spread ask/bid for menor que ~8%, vender por `deal` é melhor que listar. |
| 3 | Piso de descida das **listagens já pagas** | `limit` (não `limit / 0,95`) | O `/ 0,95` do piso existe para **recuperar a taxa de 5%**; numa listagem existente a taxa já foi paga e é **afundada**: o piso correto é o preço que ainda atende referência + margem (`limit`). Para o pixel: 62.947 -> ~59.800, **sem custo de taxa**. Abaixo disso só com decisão do dono. |
| 4 | Piso por tipo de recurso | **custo** para o que o bot produz ou minera; **referência** para o que compra | O swing usa uma média histórica como piso para tudo; para mineral minerado (custo marginal ~0, como o oxigênio, 186 mil unidades) isso trava estoque sem motivo: a 38,9 contra ask 22,9 a ordem **nunca** vende e paga 5%. Para produto com custo conhecido (barras, XLH2O), o piso é custo + margem (a cadeia já faz isso: "vendendo no piso 870"). Para o que foi **comprado para revenda**, a referência histórica continua sendo a defesa certa contra vender em queda. |
| 5 | Prazo da listagem | 7 dias reais (`swing.listingLifetimeDays`) | Ao vencer perde-se a taxa; ao esperar demais trava-se estoque. 7 dias dá uma semana de variação de preço para a ordem se tornar competitiva (com a descida grátis) sem prender estoque por ~2 meses (hoje ~57 dias reais). Renovável por recurso. |

Como o agente usa isso: os padrões 1–2 e 4 entram como **valores calculados em tempo de execução** (`R x 0,95`, custo, referência);
o dono pode sobrescrever qualquer um em `Memory.settings.pixel.*` / `swing.*` sem deploy.

## Open questions (dono)

- Confirmar ou ajustar os padrões acima depois de ver o primeiro `ordersAudit()` pós-implementação.
- Preço-alvo manual para a listagem de pixel existente (se quiser um valor absoluto em vez de `limit`).
