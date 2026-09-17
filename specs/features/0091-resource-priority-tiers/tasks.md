# 0091 — Tarefas de implementação

## 1. Base de estado econômico

- [x] Criar `src/utils/resourceTiers.js` com a API pública:
  - `aboveReserve(room)`
  - `isStorageAbundant(room)`
  - `controllerCritical(room)`
  - `getEconomyState(room)`
  - `getEconomyReason(room)`
  - `getCriticalConsumers(room)`
- [x] Resolver o estado com pares de razão e consumidor crítico, sem acessar objetos do jogo em `Memory`.
- [x] Garantir fallback seguro para `room.storage`, `controller`, `spawns`, `towers`, `links` e `jobs` ausentes.

## 2. API declarativa de seleção

- [x] Criar `src/utils/priority.js` com `pick(candidates)`.
- [x] Ordenar em ordem: `critical` primeiro, depois `satisfactory`, depois `optimal`.
- [x] No empate, preferir a maior prioridade, depois `minimumEnergyCost` e depois a ordem original.
- [x] Em caso de `candidates` vazios, devolver `null` sem exceção.

## 3. Consumidores migrados

- [x] Ajustar `src/roles/hauler.js` para não iniciar `mineralJob` quando houver consumidor crítico.
- [x] Ajustar `src/roles/remoteHauler.js` para classificar entregas pela criticidade da sala-mãe.
- [x] Ajustar `src/roles/bootstrap.js` para considerar a sala crítica antes do caminho de link/container.

## 4. Observabilidade e smoke

- [x] Expor `Memory.stats.rooms[name].economyState`, `economyReason` e `criticalConsumers` em `src/utils/stats.js`.
- [x] Adicionar assertions em `test/smoke.js` para:
  - estado `critical`/`stable`/`abundant`
  - `pick()` com desempate determinístico
  - ausência de `mineralJob` sob consumidor crítico
  - `remoteHauler` usando a ordem correta de prioridade
  - bootstrap preferindo consumidor crítico
- [x] Cobrir `remoteHauler` entregando primeiro ao spawn crítico da sala-mãe.
- [x] Cobrir a preempção de `mineralJob` antes da retirada e a conclusão após
  a retirada do recurso.
- [x] Adicionar assertion para bloquear abastecimento opcional durante
  criticidade do controller, sem interromper entrega já carregada.
- [x] Rodar `node --check` nos arquivos alterados.
- [x] Rodar `node test/smoke.js "$(pwd)"` e corrigir regressões.
- [x] Rodar `npx grunt` para reconstruir `dist/main.js`.

## 5. Finalização

- [x] Atualizar `specs/ROADMAP.md` para `ready`/`done` conforme o cenário do repositório.
- [x] Confirmar que a mudança é focada em política global de reserva e tier, sem entrar em transferências inter-sala ou terminal.
