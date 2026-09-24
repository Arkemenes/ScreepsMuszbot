# 0108 — Estrada do plano é reparada sem exigir tráfego

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-24

## Problem

`utils/traffic.js`'s `worthRepairing()` só considerava uma estrada abaixo de
`traffic.roadRepairFloor` (40%) se o tile dela também estivesse "quente"
(`isHot()`, `traffic.roadThreshold` = 50 contagens). O contador é 100% heap
(constitution §2), então todo global reset zera tudo, e ele sobe 1 por
creep/tick apenas no tile exato onde o creep está. Resultado real reportado
pelo usuário em produção (2026-09-24): várias estradas planejadas paradas em
`300/5000` hits (6%, tier `critical`) que nem builder nem tower jamais
enfileiravam — o gate é aplicado igualmente em `roles/builder.js` e
`structures/tower.js`, então a exclusão era simétrica e permanente.

Economicamente o gate estava invertido: reparar custa 1 energia / 100 hits
(0,01/hit); deixar morrer e reconstruir custa 300 energia / 5000 hits
(0,06/hit, ~6x mais), sem contar o tempo de builder e o ciclo
build → decay → build sobre um tile que o plano continua reservando.

## Desired outcome

Abaixo do piso de reparo, uma estrada que o plano da cidade reserva é sempre
elegível para reparo, independentemente do contador de tráfego. O piso
(`traffic.roadRepairFloor`) continua valendo: estrada saudável segue ignorada.
Onde o plano não diz nada (sala sem plano, ou tile que o plano não reserva
para estrada), a regra antiga permanece — só repara com tráfego recente.

## In scope

- `utils/traffic.js`: `worthRepairing()` consulta `utils/plan.js`'s
  `planEntriesAt()` antes de cair no `isHot()`.
- Assertions de smoke para os quatro casos (planejada fria, planejada
  saudável, não-planejada fria, sala sem plano).
- `ARCHITECTURE.md` e `ROADMAP.md`.

## Out scope

- Alterar `traffic.roadRepairFloor`, `traffic.roadThreshold`, `decayFactor`
  ou `decayInterval`.
- Persistir o contador de tráfego em `Memory` (segue heap-only por
  constituição).
- Tiers de reparo (`utils/rampartRepair.js`) e gates de energia de torre.
- Reparo de estradas em remotes — hoje nenhum papel repara estrada fora da
  sala própria (`roles/remoteMiner.js` só repara o próprio container); fica
  para uma feature própria.

## Acceptance criteria

1. Estrada abaixo do piso, em tile reservado pelo plano para `STRUCTURE_ROAD`,
   é `worthRepairing() === true` com zero tráfego registrado.
2. Estrada acima do piso continua `false` mesmo planejada.
3. Estrada abaixo do piso, em sala com plano mas tile não reservado, continua
   exigindo `isHot()`.
4. Sala sem plano nenhum (`planEntriesAt()` retorna `null`) mantém o
   comportamento antigo.
5. Ponta a ponta: `roles/builder.js` enfileira o reparo de uma estrada
   planejada e fria; segue ignorando uma estrada nem planejada nem quente.

## Notes

- **CPU:** `planEntriesAt()` usa o índice `"x:y"` por sala, reconstruído 1x
  por tick em `utils/plan.js` — O(1) por consulta, e ambos os chamadores já
  chamam `isPlanned()` no mesmo filtro, então o plano já está indexado.
- **Fail-soft:** sem plano na sala, `planEntriesAt()` retorna `null` e a
  política antiga é usada sem exceção.
- `require` novo `traffic → plan → planStore` não cria ciclo (`planStore` não
  importa nada do projeto).
