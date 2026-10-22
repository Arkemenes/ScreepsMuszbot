# 0184 — Plan

1. Centralizar elegibilidade por recurso em `rooms/looting`: mínimo apenas
   para energia, usado tanto em `lootablePiles` quanto no `withdraw` do role.
2. Resolver destino no mesmo módulo: salas próprias visíveis por distância;
   storage com capacidade para toda a carga restante, senão containers via
   `roomCache` sob o mesmo requisito (ARK-234). Resolver objetos
   no heap e conferir capacidade viva a cada uso.
3. Role mantém `home`/`lootId`; descarrega em destino independente, calcula
   TTL até esse destino e volta ao alvo depois de esvaziar. Reciclagem na mãe.
4. Regressões no smoke, documentação, syntax checks, build e grafo.
