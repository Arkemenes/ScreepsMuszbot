# 0001 — CPU & Memory foundation

- **Status:** done
- **Analysis refs:** C1, C2, C3, A1, A2, A3

## Problem

- O `main` não tinha `try/catch` por subsistema — uma exceção abortava o
  império inteiro naquele tick.
- `utils/memory.js` mantinha as variáveis de cache de Memory locais à função,
  então a otimização "pular `JSON.parse`" nunca disparava.
- `intel.js` guardava `terrainMatrix` (2500 números) + uma `CostMatrix` por
  sala na Memory, serializada todo tick.
- `intel.js` rodava ~13 `_.sum(Game.creeps, …)` por sala por tick.
- O profiler embrulhava todo método de prototype incondicionalmente.
- `isPlanned()` fazia varredura linear do array do plano por chamada.

## Desired outcome

O tick é resiliente a falhas de subsistema. A serialização de Memory por tick é
pequena e barata. `Game.creeps` e `room.find` são percorridos uma vez por tick.
Dado estático vive no heap.

## Acceptance criteria

1. Um erro lançado em qualquer subsistema de role/sala é logado e o resto do
   tick ainda roda. *(smoke: injetar `throw`, assertar que os outros rodam)*
2. `Memory` não contém `terrainMatrix` / `walkMatrix`. *(smoke asserta)*
3. `census` percorre `Game.creeps` uma vez; roles/intel leem contagens dele.
4. O profiler só carrega quando `Memory.settings.profiler` está setado.
5. `isPlanned` / `planEntriesAt` são O(1) via um índice `"x:y"` por tick.

## Outcome

Entregue. Módulos novos: `utils/census`, `utils/roomCache`, `utils/terrain`.
`utils/memory.js` usa estado em escopo de módulo + `global.Memory =`
(seguro sob strict). `utils/plan.js` constrói um índice cacheado por tick.
`main.js` `guard()` envolve toda chamada de subsistema.

## ARK-116 — revisão de custo recorrente (2026-10-13)

A proposta de indexar bloqueios do floodFill foi retirada do pacote após
questionamento do usuário. Nenhum código desse algoritmo foi alterado.
Leitura live confirmou cinco salas planned=true/planStep13: planCity retorna
antes do floodFill; o custo recorrente atual exige outra investigação.
visualizeForceInterval=1 força redesenho completo dos planos a cada tick.

Próximo pacote recomendado: cache da camada visual com reapresentação contínua,
previsão de combustível usando trabalho ativo e execução efetiva do builder.
Detalhes, riscos e critérios em docs/cpu-review-2026-10-13.md. A documentação
da proposta não constitui implementação nem ganho de CPU confirmado.
