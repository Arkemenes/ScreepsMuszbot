# 0171 — Verificação atual de propriedade antes de claimRoom — Tasks

Ordenadas. Cada tarefa é pequena, verificável de forma independente, e termina num check. Referencie critérios de aceitação como (AC#).

- [x] 1. Criar ARK-217 urgente, abrir spec/plano/tasks e mover para In Progress.
  - verify: issue ARK-217 está In Progress e vinculada a esta spec.
- [x] 2. Implementar decisão de propriedade pela visão atual e pedido de observação expirável em rooms/remotes.js. (AC1, AC2, AC4, AC5)
  - verify: node --check src/rooms/remotes.js
- [x] 3. Executar a retomada pendente uma vez por tick através de main.js e guard(). (AC3, AC6)
  - verify: node --check src/main.js
- [x] 4. Atualizar test/smoke.js para owner stale, controller atual, Observer, timeout e cancelamento. (AC1–AC6)
  - verify: smoke assertions com mensagens descritivas passam.
- [x] 5. Atualizar ARCHITECTURE.md e ROADMAP.md; executar validação de definição de pronto.
  - verify: node --check nos arquivos tocados, node test/smoke.js e npx grunt.
- [x] 6. Atualizar issue para Done quando a validação passar.

## Notes

A observação solicitada pelo claim deve coexistir com a fila global de observe requests. Não presumir que observeRoom fornece visão no mesmo tick.

Validação local em 2026-10-21: `node --check` nos arquivos JavaScript tocados, `node test/smoke.js` e `npx grunt` passaram. O Grunt gerou `dist/main.js`; a cópia opcional para o diretório local do cliente Screeps foi recusada pelo sistema com EPERM.
