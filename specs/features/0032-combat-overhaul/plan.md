# 0032 — Combat overhaul — Plan (Fase 1: D1 + D4)

Derivado de `spec.md`. Escopo: só a Fase 1 (reordenar corpo do defender +
rampart/wall escalando por RCL). Fases 2–4 ganham seu próprio plan.md
quando chegar a vez — não faz parte deste documento.

Durante o planejamento, o D1 da spec foi corrigido (ver "Decisões da
revisão" no `spec.md`): a ordem certa pro kiter atual é `MOVE` por
**último** (protege a fuga), não na frente como a heurística genérica de
"descartável primeiro" sugeriria — essa é a heurística certa pro tanque
estático da Fase 2 (D3), não pro kiter de hoje.

## Approach

**D1** é só reordenar os arrays de `getBody()` em `roles/defender.js` —
mesmas partes, mesma contagem, mesmo custo, só a ordem muda (`MOVE` por
último). Zero mudança de comportamento fora do dano acumulado degradar a
arma/cura antes da mobilidade.

**D4** substitui os limiares absolutos e fixos de "rampart crítico"
(`tower.rampartCriticalLimit`/`*UnderAttack`, 10k/100k) por uma **fração
do `hitsMax` real da estrutura** — que já escala com RCL via o próprio
motor do jogo (`RAMPART_HITS_MAX` por RCL, `WALL_HITS_MAX` fixo mas só
construível a partir do RCL2). Um limiar absoluto de 10k é ~3% do teto em
RCL2 mas uma fração desprezível (0,003%) em RCL8 — por isso ramparts
"grandes" paravam de receber prioridade de reparo bem antes de estarem
realmente robustas. A nova versão também considera storage cheio (energia
sobrando, nada melhor pra gastar) como gatilho pro alvo mais agressivo,
igual a estar sob ataque.

Nenhum dos dois toca spawn queue, `needs.js`, ou qualquer outro role —
mudança isolada em `defender.js` e `tower.js`.

## Modules

### New

Nenhum módulo novo.

### Changed

| Path | Change |
|------|--------|
| `src/roles/defender.js` | `getBody(energy)`: reordena as 3 variantes pra `MOVE` por último (`[RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE, MOVE, MOVE]` a partir de 700; `[RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE]` a partir de 400; `[RANGED_ATTACK, MOVE]` abaixo disso, inalterado - já só tem 1 de cada). Nenhuma outra mudança nessa função. |
| `src/structures/tower.js` | `findRepairTarget`: a seleção de "rampart crítico" troca de `structure.hits < limiteAbsoluto` pra `structure.hits < structure.hitsMax * ratio`. `ratio` escolhido por `defenseActive` **ou** storage quase cheio (`tower.stockpileTrigger`) — qualquer um dos dois usa o ratio "agressivo". Remove o uso de `tower.rampartCriticalLimit`/`*UnderAttack`. |
| `src/utils/config.js` | Remove `tower.rampartCriticalLimit` / `tower.rampartCriticalLimitUnderAttack` (absolutos). Adiciona `tower.rampartTargetRatio` (0.02), `tower.rampartTargetRatioUnderAttack` (0.2), `tower.stockpileTrigger` (0.1 - storage com menos de 10% de capacidade livre conta como "cheio"). |
| `test/smoke.js` | Novas assertions (nenhuma cobertura direta existia pra `getBody()`/`findRepairTarget`'s critical-rampart hoje - ver "Riscos"): ordem exata do corpo do defender nas 3 faixas de energia; `tower.run()` escolhe um rampart abaixo do ratio-alvo antes de um normal-mas-menos-urgente, ratio agressivo quando `defenseActive` ou storage cheio, ratio normal caso contrário. Reaproveita o padrão `mkRampart` já existente (bloco "rampart opens for an approaching ally"). |

## Data shapes

| Chave | Onde | Forma |
|-------|------|-------|
| `config.get("tower.rampartTargetRatio")` | `defaults` (`config.js`) / `Memory.settings.tower.rampartTargetRatio` | `number`, fração de `hitsMax` (default 0.02) |
| `config.get("tower.rampartTargetRatioUnderAttack")` | idem | `number` (default 0.2) |
| `config.get("tower.stockpileTrigger")` | idem | `number`, fração de capacidade **livre** de storage abaixo da qual conta como "cheio" (default 0.1) |
| corpo do defender (`getBody`) | não persiste - computado no spawn | `BodyPartConstant[]`, mesma contagem de hoje, ordem nova |

Nenhuma chave nova de `Memory.rooms`/`Memory.creeps` - `defenseActive` já
existe (`rooms/intel.js`), só passa a ser lido também por `tower.js` (já
era, pro gate de energia sob ataque de outros pontos do arquivo).

## How it satisfies the constitution

- **CPU:** ambas as mudanças são O(1) a mais por chamada (uma multiplicação
  `hitsMax * ratio` em vez de comparar com uma constante) - sem novo
  `room.find`, sem novo loop.
- **Memory:** nenhuma chave nova de `Memory.rooms`/`Memory.creeps`; só
  `config.get()` (Memory.settings, já do padrão 0012).
- **Fail-soft:** `tower.room.storage` pode ser `null` (sala sem storage
  ainda) - o gatilho de storage cheio precisa tratar isso (`storage &&
  ...`), nunca lançar.
- **Offline test:** ver linha do `test/smoke.js` acima - cobertura nova,
  não só atualização de assertion existente.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `getBody()`/`findRepairTarget`'s critical-rampart nunca tiveram assertion direta - risco de a mudança "passar" no smoke sem provar o comportamento novo | Tasks escrevem a assertion **antes** de confirmar a mudança visualmente (checar que falha na ordem antiga, passa na nova) |
| Renomear `tower.rampartCriticalLimit*` quebra um `Memory.settings.tower.rampartCriticalLimit` que alguém já tenha setado manualmente | Ninguém depende disso hoje (bot solo, sem histórico de override em produção conhecido) - aceitável; se importar, é só re-adicionar a chave antiga como alias depois |
| Ratio agressivo (0.2 sob ataque) pode direcionar reparo de rampart bem acima do que o `tower.repairEnergyRatio` (70% de energia própria) permite gastar rápido | Não muda o gate existente - só troca QUAL rampart é "crítico"; reparo continua condicionado ao mesmo teto de energia de sempre |
| `storage.store.getFreeCapacity(RESOURCE_ENERGY)` pode não existir no smoke mock atual pra todo fixture de `storage` | Checar o mock existente (`store()` helper) antes de escrever a task - se faltar, é um ajuste pequeno no harness, não no código de produção |

## Rollback

Reverter os 3 arquivos de produção (`defender.js`, `tower.js`,
`config.js`). Nenhuma migração de dado envolvida - `getBody()` só afeta
creeps spawnados depois da mudança (os já vivos mantêm o corpo que já
tinham); `findRepairTarget` é recalculado do zero todo tick, sem estado
persistido que precise desfazer.
