# 0147 — Estado estacionário do planejamento — Tasks

- [ ] 1. Reprodução offline do custo: contar alocações/visitas de `activeLabs`+`labSlots.resolve` com 3/6/10 labs (baseline)
  - verify: asserts de trabalho determinístico, sem tempo de máquina
- [x] 2. `labSlots.resolve` e `labPolicyRuntime.activeLabs` sem alocação (AC1)
  - verify: smoke `"0147: allocation-free lab signature matches the reference"`
- [x] 3. `probe.js` + probes em `assignments` e `listResidual` (AC2)
  - verify: smoke `"0147: probes never alter decisions"`
- [x] 4. `printCpuTop` com hit-rate dos probes
  - verify: smoke (saída contém `probe`)
- [x] 5. Definition of done do pacote 1: `node --check`, smoke, `graphify update .`, `npx grunt` **só depois** do relatório da 0146 sair (um deploy reinicia a janela de medição)
- [x] 6. Ler o hit-rate live, registrar nas Notes e decidir (AC3)
- [ ] 7. (aprovado pelo probe: ~96%)  cache de decisão de `assignments` / ocioso de `listResidual` com oráculo (AC4)
- [x] 9. `orderBook.byResource` + scan do `swingTrade` e `listingPrice` (oráculo: observações idênticas)
  - verify: smoke `"0147: per-resource book index leaves the swing scan observations identical"`
- [x] 10. Spans temporários `claims.reserve.*` (diagnóstico)
- [ ] 8. Medir `warmUsed` contra a baseline da 0145 (AC5); `ROADMAP.md` → done

## Notes

- 2026-10-15: tarefas 2–4 implementadas e com smoke verde (11.554 asserts); **ainda não publicadas**: um deploy reinicia a janela de medição da 0146, então esperamos o `cpuReport` dela. A tarefa 1 (baseline offline de alocações) ficou implícita: o ganho de 2 é medido live (`labPolicy.resolve` 0,145/tick hoje).
- Probes: `terminalOps.listResidual` e `labPolicy.assignments` publicam o hit-rate em `cpuTop` (linha `[probe]`). O hash de `assignments` é um limite superior (estados dos labs e posição do plano, não toda entrada).
- Medição (cpuReport(150), boot 83667521, após o pacote 1): **probe `assignments` 96,1% de 304 chamadas, `listResidual` 96,8% de 403**. `labPolicy.resolve` 0,144 -> 0,110 (ganho 0,034, menor que o esperado: sobra `Game.getObjectById` de 10 labs e o filtro de reservas). `warm` 16,78, resíduo 1,69. A janela de 150 intervalos varia ~±0,4 entre medições por mudança de carga (hauler.pickLoad foi de 0,97 para 0,33 entre duas janelas), então o ganho de 0,03–0,5 não se valida por `warm` isolado: usar os spans.
- `swingTrade`: spike de 25–33 CPU a cada 120 ticks. Causa: o scan chama `quote()` ~75 vezes passando o livro inteiro e cada cotação o filtra. Corrigido com `orderBook.byResource`.
- Medição 3 (boot 83667791): `swingTrade` média 0,593 e **pico 18,22** (era 0,961 e 25–33): o índice por recurso tirou ~30–40% do pico, restam ~18 CPU por scan. `claims.reserve.craft` 0,119 (1,6 chamadas/tick, pico 1,56 = `craftLedger.warehouse`), `claims.reserve.orders` 0,071, `.ops` < 0,05 (fora do top 25). `warm` 16,93 (ruído de carga: creeps 35,7 chamadas/tick contra 32). Adicionados spans temporários `swing.scan.{quote,observe,internalSource,policy}` para achar o resto do pico.
- Decisão: **não** indexar `Game.market.orders` em `physicalReservations`: os testes mutam a lista na mesma tick (cancelOrder apaga a ordem) e o ganho seria ~0,06; a exigência de nunca reter reservas entre decisões (0138) pesa mais.
- 2026-10-15 (noite): **L1 feito e publicado**: `craftLedger.warehouseMany` (um scan de estruturas por cadeia) usado por `resourcePolicy.commitments`; oráculo compara com N chamadas de `warehouse` e com o `commitments` completo. Medição pendente (`fuel.plan.commit` era 0,37). Spans `claims.*`/`fuel.plan.*` agora **desligados por padrão** (`claimsSpans(true)` liga). `cpuReport` automático após cada deploy (`stats.autoReportIntervals`).
- Pendentes para o próximo agente (ver `docs/roadmap-otimizacao-e-capacidades-2026-10-15.md`): L2 listings ociosas (probe 99,1%), L3 `labPolicy` (probe 91,8%), O3 remoção dos spans temporários. Decisões de cache de decisão exigem oráculo/fuzz; não foram implementadas por risco.
