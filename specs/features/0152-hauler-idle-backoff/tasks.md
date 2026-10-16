# 0152 — Buscas repetidas — Tasks

Estado em 2026-10-15: **implementado, publicado e dado como validado pelo dono** (o A/B foi abandonado e removido).
Defaults **ligados**: `hauler.idleRecheckTicks` 5, `builder.idleRecheckTicks` 5, `hauler.deliverRepickTicks` 5.

- [x] 1. `hauler`: busca ao ficar ocioso e depois a cada 5 ticks (`idleSkip`/`markIdle`); exceções (spawn com fome, carga, sala, reset)
- [x] 2. `builder`: mesma regra para o builder vazio sem pile
- [x] 3. `hauler.pickDeliver`: alvo mantido até 5 ticks enquanto válido, com prioridade (ranks 0, 1, 2, 4 mantidos; 3 e 5 nunca)
- [x] 4. Testes: padrão `true x4, false`, exceções e regras de prioridade (`test/steadyStateCases.js`, `test/idleRepickCases.js`)
- [x] 5. Validação: decisão do dono de testar direto em produção (sem A/B)
- [ ] 6. Acompanhar em produção: contadores `hauler.idleSkip`, `builder.idleSkip`, `hauler.deliverKept` no `cpuReport` e as invariantes
  (energia entregue, produção por cadeia, spawn sem atraso, nenhum creep ocioso novo); se algo piorar, `1` na config correspondente

## Notes

- Medição inicial (sem A/B): spans-alvo caíram ~1,9 CPU; o total do hauler variou por carga.
