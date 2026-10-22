# 0171 — Verificação atual de propriedade antes de claimRoom — Plan

Derivado de spec.md. A issue ARK-217 foi priorizada como urgente e está em execução.

## Approach

Separar o comando em duas fases. Quando a sala está visível, validar o controller atual e continuar pela política existente. Quando não está visível, verificar se há Observer no alcance, gravar um pedido curto em Memory.observeRequests e uma intenção claimCheck. Um processador pequeno, chamado uma vez por tick sob guard em main.js, aguarda visão, limpa somente a solicitação de observação criada por essa intenção e chama claimRoom novamente. Se não houver visão antes do prazo, remove o estado e não despacha um claimer.

Não usar Memory.rooms.owner para decidir propriedade. O intel salvo ainda pode servir ao restante da lógica remota, mas não representa confirmação de claim. A retomada chama o mesmo comando, de modo que distância, status e verificações existentes continuem sendo a única rota para criar Memory.claimTarget.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| — | Não será criado subsistema novo; a retomada pertence a rooms/remotes.js. |

### Changed

| Path | Change |
|------|--------|
| src/rooms/remotes.js | Decidir pelo controller visível, solicitar visão pelo Observer e expor processPendingClaimCheck. |
| src/main.js | Executar processPendingClaimCheck uma vez por tick, dentro de guard. |
| test/smoke.js | Cobrir owner stale, confirmação atual, solicitação/retomada, timeout e ausência de Observer. |
| specs/ARCHITECTURE.md | Documentar o fluxo e o estado serializável temporário. |

## Data shapes

- Memory.claimCheck = { room, from?, requestedAt, expiresAt, observeUntil, previousObserveUntil? }.
- Memory.observeRequests[room] permanece no formato existente, número de tick de expiração.
- Memory.claimTarget permanece { room, from, creepSeen? }; só é criada após validar visão atual.
- Nenhum Room, Controller ou Structure é persistido.

## How it satisfies the constitution

- **CPU:** uma consulta a Game.rooms e ao helper de observer; sem novas pesquisas de estruturas por room.find.
- **Memory:** estado compacto e temporário; limpeza em confirmação, timeout ou cancelamento.
- **Fail-soft:** sem visão ou sem Observer não há claim; owner stale jamais é tratado como fato atual.
- **Offline test:** stubs de controller, Game.rooms, observeRequests e Observer verificam o caminho síncrono e o retomado.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Uma solicitação observe já existente poderia ser apagada ao concluir o claim. | Guardar a expiração anterior e restaurá-la se a entrada ainda pertencer ao pedido do claim. |
| Observer pode atender outro pedido antes do claim check. | Manter expiração curta com renovação já definida pelo scheduler existente; falhar sem claim quando vencer. |
| Mudança de ordem em main pode atrasar a retomada. | Executar a verificação antes dos scans/intel e cobrir visão observada no smoke. |

## Rollback

Reverter a decisão de controller fresco e o processador em main.js. O fluxo anterior volta a depender da última intel; a issue permanece aberta caso a regressão seja necessária.
