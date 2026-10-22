# 0169 — Coleta de recursos recuperáveis em salas conquistadas — Tasks

Ordenadas. Cada tarefa é pequena, verificável de forma independente, e termina num check. Referencie critérios como (AC#).

- [x] 1. Corrigir Pioneer para escolher energia da sala-alvo antes de harvest/retorno e usar pickup/withdraw de acordo com a fonte. (AC1–AC3)
  - verify: smoke cobre energia dropada, tombstone/ruin e fallback de harvest.
- [x] 2. Integrar salvage.enabled e manter energyPiles seguro e dentro do roomCache. (AC2, AC6)
  - verify: nenhum novo room.find por tipo/sala/tick.
- [x] 3. Integrar bootstrap sem rebaixar a prioridade dos links coletores e do spawn. (AC4)
  - verify: fixtures cobrem precedência e fallback.
- [x] 4. Expandir loot do hauler para drops não energéticos e Stores acessíveis; manter entrega via stockPolicy. (AC4, AC5, AC6)
  - verify: fixtures cobrem hostile rampart, perigo, reservas, destination e cargo conservado.
- [x] 5. Atualizar arquitetura/roadmap e executar node --check, node test/smoke.js e npx grunt.
  - verify: validações verdes e nenhum objeto de jogo em Memory.
- [x] 6. Registrar resultado em ARK-215 e fechar a issue após validação.
- [x] 7. Prioridade por decaimento: `salvage.closestDecayFirst` no bootstrap e no pioneer (sala-alvo), `salvage.byDecay` no `battlefieldLootJob` do hauler. (AC7)
  - verify: smoke verde.

## Notes

Manter o primeiro caminho de salvamento do Pioneer restrito a energia necessária à missão; recuperação de materiais diversos fica sob responsabilidade da logística de hauler.

Validação local em 2026-10-21: `node --check` nos arquivos JavaScript tocados, `node test/smoke.js` e `npx grunt` passaram. O Grunt gerou `dist/main.js`; a cópia opcional para o diretório local do cliente Screeps foi recusada pelo sistema com EPERM.
