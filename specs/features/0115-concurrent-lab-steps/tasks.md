# 0115 — Tarefas

- [x] T1 `labSlots.planPhases` por ondas + fallback sequencial + testes
- [x] T2 `utils/labReactions.js` e consumidores (lab, hauler, nonEnergyLogistics, transientStock) + testes
- [x] T3 `craftChain`: grupos de onda (fila, início, progresso, conclusão, limpeza) + testes
- [x] T4 `marketPricing`/`craftPlanner`: `T` por caminho crítico + testes
- [x] T5 ROADMAP, ARCHITECTURE; definição de pronto (check, smoke, grunt)

## Notas de execução (2026-10-03)

- Renumerada de 0114 para 0115: já existia `0114-consolidated-miner` (criada em paralelo).
- **Centro reservado.** A busca de slots passou a ordenar os labs centrais (1 e 2) por último
  para as etapas intermediárias e primeiro para a final (e para a saída das que a alimentam).
  Antes a etapa final do XLH2O caía nos slots 7 e 8, que só alcançam 3 labs de saída; agora
  usa 1 e 2, que alcançam os outros 8.
- **Custo da busca.** O plano por ondas é uma segunda busca (além da sequencial): ~60 ms com 6
  labs, ~1 ms com 10. Roda no scan do planner (a cada 300 ticks, memoizado por scan) e uma vez
  ao abrir a cadeia.
- **Cadeias já em andamento** (sem `wave` na fila) continuam uma etapa por vez; só cadeias
  abertas depois do deploy usam ondas.
- **Não feito (fora do escopo, ver spec):** vários labs de saída em etapas intermediárias
  (o produto teria de voltar a um lab de entrada pelo storage), pipelining entre ondas e
  pré-carga do reagente da onda seguinte. A segunda é o maior ganho que sobra: hoje a etapa
  seguinte só começa quando as duas anteriores terminaram.
- **Efeito no hauler:** com duas reações ativas o reabastecimento dos reagentes passa a ter
  mais destinos ao mesmo tempo (um job por reagente e destino, `feedTaken`).
