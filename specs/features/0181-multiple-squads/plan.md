# 0181 — Plan

`utils/squadAssembly` centraliza IDs, fila, migração e população por pedido,
sem depender dos roles/squad (evita require circular). Um contador persistente
com tick no prefixo gera IDs; promoção conserva o ID da montagem.

`raiding.raidSquad` valida o alvo e mãe como antes, cria e retorna ID, sem
exclusão global. `spawnPendingSquad` seleciona o primeiro pedido da mãe com
role faltando, contando creeps vivos/registrados/spawning do mesmo ID. Mortos
durante montagem liberam sua própria vaga. `registerPending` associa somente
população daquele pedido; todas as partes da receita precisam terminar o
spawn antes da promoção. Grupo completo deixa a fila livre para o seguinte.

Migração: singleton vira entrada com `legacyRoom` temporário, permitindo
resolver também um marcador antigo que apareça depois da primeira migração.
Esse alias pertence somente ao pedido legado; novos grupos usam IDs desde
o nascimento. A remoção do pedido na promoção remove também o alias.

`squad.maintain` migra a fila, poda registros mortos e limpa squads ativas via
pruneDeadMembers; main chama sob `guard("squads", ...)` antes de spawn.
O cache de ociosidade do spawning consulta se há montagem naquela mãe.

Revisão: preservar grupos ativos, não gerar esquadrões automáticos, manter
ordem de receita (combat começa por striker) e limpar apenas o pedido que
foi promovido. Tests verificam isolamento com destino igual e duas mães,
receitas diferentes, mortes, IDs e migração; smoke integra o guard.
