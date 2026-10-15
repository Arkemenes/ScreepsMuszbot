# Plan

1. Reproduzir buscas frias e repetição de histórico com contadores offline.
2. Extrair índice leve compartilhado por terminalClaims/resourcePolicy e
   terminalOps; filtrar estado atual, invalidar por tick/fonte/nextId.
   GC continua na cadência existente e calcula vínculos uma única vez.
3. Memorizar estados fracassados já explorados por budget na busca labSlots;
   pré-calcular ordens/reachability da topologia fora da recursão.
4. Verificar planos, mudanças no mesmo tick e custo de consultas repetidas.
   Documentar antes/depois e validar build normal; live permanece explícito.
5. Separar política por tick da manutenção no intervalo configurado; eliminar
   consultas caras de venda quando o limite físico já prova lote insuficiente.
6. Compartilhar lista local dos generators em poll; revalidar warming logo após
   hidratação e expor amostras/prontidão para distinguir a espera de E1N47.
