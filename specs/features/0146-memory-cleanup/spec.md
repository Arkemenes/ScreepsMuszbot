# 0146 — Limpeza de Memory e migrações encerradas

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15

## Problem

`Memory` tem 288 KB (cpuAuditMemory) e é serializada a cada tick: ~1,7 CPU
(0,006 CPU/KB, ordem de grandeza). Parte do volume é morta ou derivável:

- `Memory.rooms[*].walkMatrix` (23,4 KB) e `terrainMatrix` (5,1 KB) em uma sala,
  sem escritor em `src/`; a spec 0001 e o smoke proíbem.
- `Memory.rooms[*].exits` (18 KB, 459 salas), derivável de `Game.map.describeExits`.
- `Memory.rooms` guarda 459 salas com ~15 campos de intel cada; boa parte são
  valores padrão repetidos (`builds:{}`, `enemies:0`, `hasInvaderCore:false`,
  `numberOfTowers:0`, `my:false`...), chaves incluídas na serialização.
- `Memory.stats` é recriado todo tick, mas o custo medido do módulo inteiro é
  0,10 CPU; `stats.market` (16,7 KB) tem conteúdo que não muda por tick.
- Migrações concluídas ainda no código (`planStore.segmentMap`,
  `planStore.migrateFromMemory`, `craftLedger.migrateOwners`); live:
  `settingsPlanSegments=false`, `roomsBuildings=0`, todas as cadeias sem id
  duplicado (cpuAuditLegacy).

## Desired outcome

Memory menor, sem dado morto nem derivável, e menos código de migração, com
comportamento idêntico. O formato lido pelo exporter/Grafana não muda.

## In scope

- Remover `walkMatrix`/`terrainMatrix` órfãos de `Memory.rooms` (limpeza única,
  versionada, idempotente).
- `exits`: helper único com cache no heap sobre `Game.map.describeExits`; migrar
  os 6 leitores (scout, architect, remotes, routing, squad, intel); depois apagar o campo.
- Intel: não gravar valores padrão em `Memory.rooms[*]` (omitir campo = valor
  padrão), após auditar cada leitor de cada campo; salas existentes são
  normalizadas uma vez (idempotente). Meta ~15–25 KB.
- Remover `planStore.segmentMap` (migração de settings) e `planStore.migrateFromMemory`,
  após confirmar estado live com `cpuAuditLegacy`. `craftLedger.migrateOwners` **fica** (ver notes.md/tasks Notes).
- Compactar operações finais retidas por cadeias, mantendo accounting/fees/
  recebimentos (ver docs seção 13.1), só se os leitores forem listados.

## Out of scope

- `craftLedger.reconcileLegacy`, `terminalOrderRetry` (também servem de recuperação
  pós-reset); cancelar ordens esgotadas do mercado (getter custa 0,008/acesso,
  sem ganho de CPU).
- Stubs `Memory.rooms[vizinho] = {}`: ficam (ver Decisões).
- `Memory.stats`/`stats.market`: sem mudança (ver Decisões).
- Mover intel de 459 salas para segmentos + heap: candidata a spec 0147, decidida
  depois de medir 0146 (~0,5–0,7 CPU, risco médio: segmentos exigem hidratação
  assíncrona após reset).
- Mudar retenção de `craft.stranded/recovered*` ou `recoveredAdoptions`.

## Acceptance criteria

1. The smoke test asserts no `walkMatrix`/`terrainMatrix` in Memory after the cleanup runs, and the cleanup is idempotent.
2. The smoke test asserts every former `exits` reader returns the same value as `Game.map.describeExits` with a cold and a warm heap.
3. The smoke test asserts `Memory.stats` published fields and values are equal before/after (exporter contract).
4. The smoke test asserts intel records omit default values and every reader returns the same result for an omitted field as for the old default, for each field.
5. The smoke test asserts a hydrated world with legacy shapes is handled without the removed migrations only where the live check proved them extinct.
6. Memory chars drop by at least 28 KB (orphans) and the post-deploy `cpuAuditMemory` confirms it; paired CPU measured against the 0145 baseline.
7. Nothing from accounting (cost, fees, receipts, balances) is removed.

## Constitution check

Dado estático/derivado vai para o heap, não Memory; nada de objeto de jogo em
Memory; limpeza com stall guard; configuração não vira literal.

## Decisões (perguntas fechadas)

**Stubs de `Memory.rooms` ficam.** Há só 67 stubs (526 entradas − 459 com
`lastVisit`), ~270 chars: não pesam. Dependem da chave existir: `scout.js:157`
(grava `scoutBlacklistUntil` na sala alvo sem checar) e `routing.js:428` (apaga
`routeDeadEndUntil`); a seleção de sala do scout já tolera ausência, e
architect/hauler/labPolicy/needs usam só salas próprias, que sempre têm dado.
O custo de varrer `Memory.rooms` (0,026 CPU) só ocorre em comandos de console e
em `findWeakTarget`, que roda no `main.js` apenas com autoRaid opt-in: não é
varredura por tick. Remover stubs ganharia ~0 e arriscaria `scout.js:157`.

**`stats.market` não entra.** Todo o módulo `stats` custa 0,10 CPU/tick; o
conteúdo de `market` não muda por tick (`credits` só muda com negócio,
`transactions` com eventos da janela de 60 ticks, `fairPrice` com o snapshot do
mercado, que vem de cache no heap), mas **precisa estar em Memory todo tick**
porque o exporter lê `Memory.stats`, e os campos extras viram métricas
genéricas no Grafana. Reaproveitar o objeto economizaria só alocação (~0,05),
nunca serialização, e reduzir campos tiraria dado do Grafana. Fica como está.

## Open questions

- Quais campos de intel podem ser omitidos sem mudar comportamento (auditar
  leitores de `enemies`, `builds`, `numberOfTowers`, `hasInvaderCore`, `my`...).
