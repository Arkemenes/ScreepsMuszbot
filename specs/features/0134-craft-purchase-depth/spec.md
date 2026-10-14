# Craft: disponibilidade quantitativa de compras (ARK-123)

## Problema
`shared-input:X` bloqueia globalmente novas cadeias quando outra cadeia está
comprando qualquer quantidade de X, inclusive quando essa compra já terminou.
W7N49 possui candidatos lucrativos e labs livres, mas não inicia produção.

## Resultado e critérios
- Reservar apenas o saldo de operações de compra ainda ativas, por volume de
  SELL orders elegíveis; recebimentos e compras concluídas não reservam mercado.
- Reavaliar quantidade, custo e lucro com a oferta restante antes de abrir cada
  cadeia. Duas aberturas no mesmo scan não usam o mesmo volume barato.
- Preço e limite do craft incluem frete efetivo; ofertas distantes não recebem
  limites calculados só pelo preço bruto. Preservar caps e margem econômica.
- Diagnóstico informa `purchaseQuotes` e motivos de profundidade/margem, sem
  bloquear globalmente pelo nome do insumo. Sem novos parâmetros de urgência.

## Review
Proposta autorizada pelo usuário em 2026-10-14: “Pode seguir com a proposta”.
Compatível com constituição: book derivado no heap, cache compartilhado de
orders, loops limitados e nenhum objeto de jogo persistido.
