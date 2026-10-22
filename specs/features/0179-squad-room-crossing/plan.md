# 0179 — Plan

## Approach

`utils/squadCrossing` possui a passagem; `squad.advance` o chama após staging
e decisões de recuo, antes de navegar ou aplicar slots. Planejar o próximo
salto com PathFinder de duas salas, guardar a saída, a entrada e duas âncoras
no estado da squad; `moveTo` usa somente essas salas e a porta escolhida.

`gather` espera proximidade/fadiga; `cross` leva o líder ao interior e deixa
espaço para os seguidores. Se alguém já cruzou, retomar diretamente `cross`.
Só encerrar quando todos estiverem no interior e próximos à âncora. Falhas
retentam com cadência e timeout; avanço impossível vira recuo, sem blacklist.

## Changed

- `src/utils/squad.js`: integração e desmobilização conjunta no recuo.
- `src/utils/squadCrossing.js`: estado compartilhado, planejamento e stall guard.
- `src/utils/config.js`: limites operacionais.
- `test/smoke.js`: regressões e atualização da expectativa antiga de staging.
- `specs/ARCHITECTURE.md`, `specs/ROADMAP.md`: comportamento e estado novos.

## Data shapes

`squad.crossing`: salas `from/to`, destino da missão `destination`, `phase`,
âncoras `{x,y}` e porta `{x,y}` em cada lado; timestamps e assinatura das
posições. `squad.crossingFailure`: salas, tick e motivo da última falha.
Nenhum PathFinder path é serializado. Caches nativos de movimento são
invalidados na adoção/conclusão; limpeza de blacklist exige evidência local.

## Review

A implementação foi autorizada após a proposta de travessia compartilhada.
Manter isolamento do routing geral e os guards existentes de combate; não
liberar bordas na formação normal. Testar também leader-first, follower-first,
fadiga, timeout e recuo antes de encerrar a implementação local.
