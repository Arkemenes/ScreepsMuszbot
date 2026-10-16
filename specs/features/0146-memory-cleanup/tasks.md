# 0146 — Limpeza de Memory e migrações encerradas — Tasks

- [x] 1. `memoryCleanup.js`: apaga `walkMatrix`/`terrainMatrix`, idempotente, versão em settings (AC1)
  - verify: smoke `"0146: orphan matrices removed, second run no-op"`
- [x] 2. `mapExits.js` + migrar os leitores de `exits` (AC2)
  - verify: smoke `"0146: exits readers match describeExits cold and warm"`
- [x] 3. `memoryCleanup`: apagar `Memory.rooms[*].exits` legados (depende da 2)
  - verify: smoke `"0146: exits field gone from Memory after cleanup"`
- [x] 4. Auditar leitores dos campos de intel e omitir padrões provados (AC4)
  - verify: smoke `"0146: intel default omission is behaviour-neutral"`
- [x] 5. Remover migrações de `planStore` (AC5); `craftLedger.migrateOwners` mantida por decisão (ver Notes)
  - verify: casos antigos do smoke ajustados; `"0146: removed migrations are gone"`
- [ ] 6. Compactar operações finais retidas (AC7) — **adiada**: ganho ~0,06 CPU, exige lista de leitores
- [x] 7. `test/smoke.js` — AC3: contrato de `Memory.stats` inalterado
  - verify: `node test/smoke.js "$(pwd)"` verde
- [ ] 8. Definition of done: `node --check`, smoke, `npx grunt` (publica), `graphify update .`, `ROADMAP.md`/`ARCHITECTURE.md`; medir `cpuAuditMemory` pós-deploy (AC6)

## Notes

- 2026-10-15: implementado. Auditoria dos leitores: `builds` não tem leitor (removido); `enemies`, `enemyStructures`, `numberOfTowers`, `hasInvaderCore` só são lidos com `> 0`, `|| 0` ou `!x`, logo omitir 0/false é neutro. `hasController`, `mineral`, `sourceNumber` ficam (gatilho `== undefined`).
- `exits`: o roteamento só considerava vizinhos de salas já vistas; por isso `mapExits.known()` devolve `exits` só para salas com `lastVisit` (ou com o campo legado), preservando a semântica. Diferença aceita: o valor deixa de ficar congelado da primeira visita e passa a vir do mapa a cada reset do global.
- Chaves em `fieldsChars` não incluem o nome do campo; o ganho real dos padrões omitidos é maior que o estimado (~39 KB, não 15–25 KB).
- **Decisão (autônoma): `craftLedger.migrateOwners` fica.** O teste 0135 o trata como comportamento (ids duplicados de cadeias legadas) e não provei que o planner atual nunca os cria; custo ~0. `reconcileLegacy` e `terminalOrderRetry` também ficam. Removidas: migração de `settings.planSegments` e `migrateFromMemory`.
- `memoryCleanup` é por si só uma migração: roda uma vez por global (5 ticks após o boot). Remover o módulo depois de um deploy que confirme `removed = 0`.
- Tarefa 6 (compactar operações finais) adiada, ganho ~0,06 CPU.
