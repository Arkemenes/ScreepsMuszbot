# 0103 — Plan

1. Revalidar o estado `GetEnergy` de builder/upgrader antes de invocá-lo;
   limpar apenas links não-coletores quando a economia estiver crítica.
2. Bloquear o fallback de upgrade do builder em controller RCL 8.
3. Fazer `rooms/needs.js` aplicar overrides antes do clamp de RCL 8 e tratar
   controller máximo como sem demanda de upgrader.
4. Fazer upgraders legados respeitarem a demanda/teto efetivos e converter os
   excedentes em builders.
5. Adicionar regressões no smoke e atualizar arquitetura/roadmap se o formato
   do sistema mudar.
