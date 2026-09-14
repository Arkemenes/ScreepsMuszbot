# 0059 — Universal critical→healthy→optimal spending fallback — Tasks

- [x] 1. Adicionar princípio #9 na `specs/constitution.md` (cascata de gasto
      crítico→saudável→ótimo, sempre com fallback; isenção da coleta),
      referenciando `specs/features/0059-spending-tier-fallback/spec.md`.
  - verify: leitura manual — o texto não contradiz os princípios 1-8
    existentes.
- [x] 2. `src/roles/remoteHauler.js`'s `pickDeliver()` ganha fallback de
      torre com `getFreeCapacity(RESOURCE_ENERGY) > 0` (AC2).
  - verify: `node --check src/roles/remoteHauler.js`
- [x] 3. Atualizar `test/smoke.js` — assertion `"remoteHauler tops off a
      tower when storage and spawn/extension are both full (ROADMAP 0059)"`
      (AC2).
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 4. `npx grunt` builda; atualizar `ROADMAP.md` status → done (AC6).

## Notes

O bug irmão em `roles/hauler.js` (torre na faixa morta sem fallback) já
tinha sido corrigido antes desta spec existir, na mesma sessão — tratado
como pré-requisito/motivação, não como tarefa desta spec (ver "Out of
scope"). A auditoria do resto do código (`upgrader`, `miner`, `bootstrap`,
`builder`, `tower`, `link`, `spawning`, `rampartRepair`, defesa, combate,
factory/lab/powerSpawn) não achou outra lacuna real — só a janela teórica de
`miner.distribute()` documentada em "Out of scope" do `spec.md`, que é
coleta com limite físico, não gasto.
