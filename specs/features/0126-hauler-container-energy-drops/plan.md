# 0126 — Hauler container drops — Plan

## Approach

Adicionar `dropUnderContainer(room, drop)`, que monta lazy um Set de posições
`y * 50 + x` em `derived(room)`, usando todos os containers de
`roomCache.structuresByType(room, STRUCTURE_CONTAINER)`. Não restringir o índice
a source containers nem eliminar containers dentro da danger zone.

Usar o predicate em `biggestEnergyDrop`, nos filtros de grandes/pequenos drops
e ao revalidar `last.src.act === "pickup"` em `pickLoad`. O fast gate passa
a refletir apenas drops elegíveis, preservando a janela de cache de outros
alvos quando há uma grande pilha excluída. O índice expira com `derivedTick`.

## Modules and validation

`src/roles/hauler.js` e `test/smoke.js`; docs ARCHITECTURE/ROADMAP.
Smoke simula source container/link cheio, drops descobertos/cobertos e dois
haulers compartilhando o índice. Verificar o comportamento antes/depois, além
de `node --check`, smoke completo, `npx grunt`, `graphify update .`.

## Risks and rollback

Uma pilha ignorada pode continuar acumulando sob container; isso é a política
explicitamente pedida. A coleta de energia em terreno sem container continua
prioritária. Índice no heap é reconstruído por tick, inclusive após construção
ou destruição de container. Reverter predicate e suas chamadas restaura a
política anterior sem migração de Memory.
