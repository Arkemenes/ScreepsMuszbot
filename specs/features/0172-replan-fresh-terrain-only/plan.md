# 0172 — replanRoom fresh: plano só pelo terreno — Plan

Derivado de spec.md.

## Approach

Um helper `ignoresBuilt(roomName)` em `src/rooms/architect.js` lê `Memory.rooms[room].planFresh`. Os quatro pontos que olham estruturas construídas consultam o helper e, com a flag ativa, agem como se a sala estivesse vazia:

- passo 1: `spawn = null`, então `stampStep` escolhe a âncora pelo flood fill;
- `existingBuiltNear` devolve `undefined` (cobre containers de source/mineral, link e torre de source);
- `unclaimedBuiltTowers` devolve `[]` (torres de perímetro, passo 12);
- o filtro de tile ocupado na escolha do link (source e mineral) é ignorado.

`replanRoom(roomName, opts)` grava a flag com `opts.fresh` e a apaga sem ela.

## Modules

### Changed

| Path | Change |
|------|--------|
| src/rooms/architect.js | `ignoresBuilt`, opção `fresh` em `replanRoom`, exports para o smoke. |
| src/utils/console.js | Linha de ajuda de `replanRoom(roomName, {fresh: true})`. |
| test/smoke.js | Asserções AC1–AC4. |
| specs/ARCHITECTURE.md | Descrição da flag na linha do `architect.js`. |

## Data shapes

- `Memory.rooms[room].planFresh = true`, ausente fora do modo fresh.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Spawn/extensions antigos ocupam o cap do RCL e bloqueiam os novos sites. | Esperado e documentado: nada é demolido; o usuário remove o que ficar fora do plano. |
| A flag fica na Memory depois que o plano termina. | Inofensiva: só é lida durante o planejamento; o próximo `replanRoom` comum a apaga. |

## Rollback

Rodar `replanRoom(room)` sem a opção. No código, remover `ignoresBuilt` e as quatro chamadas a ele.
