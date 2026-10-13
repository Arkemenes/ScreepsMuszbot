# 0130 — Reservas por direção no terminal

- **Status:** done
- **Created:** 2026-10-12
- **Linear:** ARK-108; investigação ARK-103

## Problem

W7N49 não abre XLH2O x540: uma venda `swing` de 22324 O em `listed`
bloqueia a compra de O540. O estoque listado pertence à venda; comprar um
lote adicional não disputa esse estoque. Só retirar o lock é insuficiente:
as reservas de craft/flip incluem compras ainda não recebidas e podem
cancelar a venda existente como se sua carga tivesse sido comprometida.

## Desired outcome

Compras automáticas de material adicional convivem com vendas/transferências
do mesmo recurso. Reservas de estoque físico e de entradas futuras são
distintas. As operações disputam o cooldown físico do terminal normalmente,
sem cancelar/relistar ordens pagas nem consumir carga de outro dono.

## Acceptance criteria

1. `automaticPurchase` permite BUY concorrente com SELL/transfer do mesmo
   recurso, em ambas as ordens de criação. Dois BUYs automáticos comuns,
   dois SELLs e duas saídas continuam sujeitos aos locks existentes;
   reposição `swing` mantém sua regra própria. Chamadores manuais legados
   mantêm seus locks quando não há compra automática envolvida.
2. Reservas de craft/flip descontam somente o saldo não recebido de sua
   própria compra ativa. Após recebimento parcial, o material recebido é
   protegido; compras de outra cadeia não financiam esta reserva. Créditos
   e capacidade continuam protegidos pelas regras existentes.
3. Venda fixa de O22324 permanece ativa, com mesmo preço/ID/taxa, ao abrir
   produção com compra O540. A produção só usa estoque que não pertence à
   venda; recibos e cooldown continuam sendo executados pelo terminalOps.
   Reservas futuras de produção não cancelam uma ordem fixa já integralmente
   financiada no terminal. Haulers respeitam a carga de saída em storage/terminal,
   inclusive jobs antigos e múltiplos intents no mesmo tick. Ordens manuais
   sem operação gerenciada também protegem sua carga física.
4. Craft verifica locks de todas as compras antes de criar qualquer operação.
   Recusas identificam recurso e causa no `craftStatus` e no log. Uma recusa
   tardia ainda desfaz apenas as operações criadas para esta tentativa.
5. Smoke reproduz convivência, recebimento parcial/confirmado, reservas,
   conflitos reais e preservação de listing; check/build/grafo atualizados.

## Review

Escopo revisado contra a constituição: sem novos scans de creeps/room.find,
sem objetos em Memory, sem políticas de cancelamento ou thresholds novos.
O pedido do usuário autoriza corrigir a coordenação. Esta mudança não promete
execução quando mercado, orçamento ou capacidade não permitem operar.
