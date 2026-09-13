# 0044 — Cortesia de tráfego: "excuse-me" — Tasks

- [x] 1. Criar `src/utils/excuseMe.js` com `ask(mover, nx, ny)` (chain +
      free-tile lookup + say + move em cadeia).
  - verify: `node --check src/utils/excuseMe.js`
- [x] 2. Adicionar `excuseMe.maxChain` (default 4) em `src/utils/config.js`.
  - verify: `node --check src/utils/config.js`
- [x] 3. `src/utils/move.js`: `travel()` chama `excuseMe.ask()` no branch de
      bloqueio por creep parado, só cai no rodeio antigo se devolver
      `false`.
  - verify: `node --check src/utils/move.js`
- [x] 4. Atualizar `test/smoke.js` — trocar a assertion antiga ("never
      shoves") pelos três cenários do spec (AC1, AC2, AC3).
  - verify: `node test/smoke.js` verde
- [x] 5. `npx grunt` builda; atualizar `ROADMAP.md` (linha 0044, status
      done) e `ARCHITECTURE.md` (`utils/move.js` + entrada nova de
      `excuseMe.js`).
- [x] 6. Follow-up 1 (usuário pediu preferência por tile válida, AC4):
      `anchorsFor()` + `pickExitTile()` em `excuseMe.js` — prefere, entre
      as tiles livres candidatas, uma que mantenha o bloqueador a alcance
      do controller (upgrader) / container-link debaixo dele agora
      (qualquer role).
  - verify: `node --check src/utils/excuseMe.js` · `test/smoke.js` (AC4)
    · `npx grunt`
- [x] 7. Follow-up 2 (usuário: miner nunca deve aceitar excuse-me, AC5/AC6):
      `NEVER_ASKED = { miner: true }` em `chain()` — para a coleta da fila
      sem incluir o miner; ele nunca chega em `anchorsFor()`/`pickExitTile()`.
      Removida a âncora de source do miner em `anchorsFor()` (código morto
      depois desta mudança). `mkParked()` em `test/smoke.js` trocou de
      `role: "miner"` pra `role: "hauler"` (o "parked worker" genérico dos
      testes AC1-AC3 não podia mais ser um miner).
  - verify: `node --check src/utils/excuseMe.js` · `test/smoke.js`
    (AC5, AC6) · `npx grunt`

## Notes

- A cadeia é detectada em linha reta a partir da tile bloqueada, na mesma
  direção do movimento do solicitante — corredores em L/curva caem no
  comportamento antigo (rodear), por design (spec, out of scope).
- O encadeamento de movimento (último da fila pousa numa tile vazia,
  todo mundo antes dele anda uma casa) é resolvido pelo próprio motor do
  Screeps no mesmo tick — não precisou de nenhum swap 1:1 escrito à mão
  nem de estado em `Memory` pra coordenar isso.
- O teste antigo (`"travel never shoves a parked worker off its tile"`)
  media só a metade do comportamento (o caso "sem tile válida"). Virou o
  critério 2; os critérios 1 e 3 são novos.
- A preferência de âncora (AC4) só se aplica de verdade à tile de saída
  do **último** da fila — quem está mais perto do solicitante numa fila de
  2+ é forçado pelo próprio encadeamento a ocupar a tile que o de trás
  acabou de vagar, não uma tile escolhida pra ele. Na prática isso quase
  nunca importa: o caso motivador é sempre um único bloqueador (miner na
  seat, upgrader no link), e mesmo sem a âncora todo role já se
  autocorrige sozinho no próximo tick (`runUpgrade`/`runBuild` em
  `prototypes/creep.js`, re-seat do miner) — o pior caso é perder 1 tick
  de trabalho, nunca ficar quebrado.
