# 0132 — Lotes do terminal e custo efetivo

- **Status:** done
- **Linear:** ARK-120; relacionada ARK-108
- **Review:** plano revisado e implementação autorizada pelo usuário em 2026-10-14.

## Problem

A swing `terminal-12010` reserva XLH2O110 em W7N49 e bloqueia produto novo
do craft. Vendas parciais confundem produção nos labs com carga listada no
terminal. Compras manuais usam limite bruto e teto de frete 5%, e uma compra
manual de energia impede compras de insumos do craft.

## Desired outcome

Reservas quantitativas por proprietário/lote, agregação idempotente, compra
imediata antes de listing. Não adicionar `urgency`. O máximo informado em
`terminalBuy` inclui frete e taxas; quantidade solicitada continua bruta.

## Acceptance criteria

1. Swing110 permanece protegida; craft não vende produto ainda nos labs nem
   carga de outro proprietário. Ao transportar produto novo, pode vendê-lo.
2. Novos itens entram em vendas compatíveis sem duplicação em retentativas;
   pisos incompatíveis não são impostos a outros lotes. Reservas, haulers,
   cancelamento, recebimentos e reset preservam propriedade quantitativa.
3. Energia usa `price*q/(q-fee)`; outros recursos incluem valor da energia.
   Limite é inclusivo, energia líquida não positiva é recusada. Teto de frete
   opcional, desativado por padrão. Compra manual e automática convivem com
   alocação independente de créditos/recebimentos.
4. SELL elegível é sempre preferida para compra imediata; BUY listing somente
   com `createListing=true`. Taxas pagas, inclusive cancelamento, entram no
   custo do pedido. Cancelamento de BUY é confirmado antes do negócio direto.
5. Extensão/reprecificação preservam ID e contabilizam taxa incremental;
   falha não cancela/recria automaticamente. Swing segue referência atual
   válida. Listings concorrentes têm lastro integral; binding é exclusivo.
6. Diagnóstico usa a avaliação da seleção e mostra bruto/líquido, frete,
   custo, taxa, proprietário e bloqueadores. Repetição automática é limitada.
7. Smoke/check/grunt/diff/grafo verdes; validação live após publicação.

## Review — ARK-124 (2026-10-14)

Reprecificação BUY desconta as taxas ainda atribuídas ao saldo da ordem,
além das taxas perdidas em cancelamento. Se o preço sobe, conta também
`max(0, novo - antigo) * saldo * 0.05`; baixar o preço não devolve taxa.
Extensão conta as taxas anteriores e a taxa incremental sobre o saldo
ampliado. O teto efetivo permanece inclusivo e o ID da listing é preservado.
Smoke reproduz baixar/subir, fill parcial e extensão após taxas acumuladas.
