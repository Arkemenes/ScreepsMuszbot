# 0094 — Energy structures mais próximas do anchor de spawn — Tasks

- [x] 1. Registrar spec e plano da ordenação de `energyStructures`.
  - verify: critérios de aceitação definidos em `spec.md`
- [x] 2. Passar `energyStructures` ordenada no `dryRun` e no spawn real.
  - verify: `node --check src/rooms/spawning.js`
- [x] 3. Atualizar `test/smoke.js` com as assertions de storage e ausência de
      storage.
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 4. Rodar `npx grunt` e marcar a feature como `done`.
  - verify: build gera `dist/main.js`

## Notes

- A mudança apenas fornece a ordem de structures aceita por `spawnCreep`; não
  altera o `hauler` nem move energia fisicamente.
