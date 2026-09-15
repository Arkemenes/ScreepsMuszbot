# 0072 — Sistema unificado de reparo em 3 tiers (crítico/satisfatório/ótimo)

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Depois da revisão geral de reparo (ROADMAP 0070/0071), o usuário pediu uma
reformulação mais profunda do sistema de prioridade:

1. **Torre e builder devem seguir exatamente a mesma lógica de reparo** —
   sempre resolver tudo que for crítico, depois tudo satisfatório, depois
   tudo ótimo. Antes disso, `structures/tower.js` e `roles/builder.js`
   tinham mecanismos parecidos mas não idênticos (pools/predicados
   diferentes, `roles/builder.js` nunca cobria estruturas normais com
   tiers de verdade).
2. **Desempate dentro de um tier**: "rampart tem menor prioridade e wall
   menor ainda" — dentro do mesmo tier, uma estrutura normal sempre vence
   um rampart, que sempre vence um wall, independente do ratio exato.
3. **Limiares diferentes por categoria**: rampart/wall usam uma fração
   pequena do próprio `hitsMax` (0.1%/1%, já existente); outras estruturas
   precisam de limiares bem mais altos (`hitsMax` pequeno demais pra usar
   a mesma fração).
4. **Gates de energia da torre por tier**: crítico gasta com a torre a
   partir de 50% de energia própria (já existente); satisfatório a partir
   de 70% (novo); ótimo só quando a sala tem storage abundante — pedido
   explícito de cruzar esse número com as regras de coleta/depósito já
   existentes antes de travar (ver Outcome).
5. **Zona morta do hauler**: `tower.satisfactoryRatio` (0.8) do
   `roles/hauler.js` sentava FORA da faixa que a nova regra de reparo
   satisfatório da torre (70%) precisa — uma torre podia ficar muito tempo
   parada bem acima de 50% sem o hauler ativamente empurrá-la mais, porque
   o único caminho de entrega pra essa faixa era o último recurso da
   cascata (só dispara quando literalmente nada mais precisa de energia).

## Desired outcome

Um único sistema de classificação (`utils/rampartRepair.js`, mantém o nome
do arquivo por histórico apesar de agora cobrir toda estrutura) usado por
`structures/tower.js` **e** `roles/builder.js`:

- `tier(structure)` → `"critical" | "satisfactory" | "optimal"`, usando
  `tower.rampartCriticalRatio`/`rampartSatisfactoryRatio` (0.1%/1%) pra
  rampart/wall, e `repair.normalCriticalRatio`/`normalSatisfactoryRatio`
  (10%/50%) pra qualquer outra estrutura.
- `priority(structure)` → chave de ordenação `[tierRank, typeRank, ratio]`
  — tier primeiro, tipo em segundo (normal < rampart < wall, dentro do
  MESMO tier, não só em empate numérico exato), ratio ascendente por
  último.
- `builderMayRepair(structure, room)` — crítico/satisfatório sempre vale;
  ótimo só é gated (por `resourceTiers.aboveReserve`, 1%) se for
  rampart/wall — estrutura normal em tier ótimo continua sempre elegível
  (reparo limitado/barato, sem risco de virar sorvedouro infinito).
- `towerMayRepair(structure, tower)` — depende da energia da PRÓPRIA
  torre: crítico precisa de `tower.repairEnergyRatio` (50%);
  satisfatório/ótimo precisam de `tower.satisfactoryRepairEnergyRatio`
  (70%); ótimo, se for rampart/wall, precisa ADICIONALMENTE de
  `resourceTiers.isStorageAbundant` (storage com pelo menos 50% de
  fill, via `logistics.storageSatisfactoryRatio` — reaproveitado do
  `structures/link.js`, não um número novo).

`structures/tower.js`'s `findRepairTarget` vira um único pool
tier+tipo+ratio-ordenado (substitui os dois pools sequenciais do ROADMAP
0070). `roles/builder.js`'s cascata build-vs-repair continua igual (não
tocada, a pedido do usuário), só a escolha de QUAL alvo reparar dentro
disso passa a usar o mesmo `priority()`/`tier()` da torre — inclui o
antigo fallback "dead-last" de rampart/wall, agora desnecessário como pool
separado (o pool único já ordena tudo corretamente).

`roles/hauler.js`'s `tower.satisfactoryRatio` cai de 0.8 pra 0.7,
alinhado com `tower.satisfactoryRepairEnergyRatio` — fecha a zona morta
real entre "quando o hauler ajuda a torre" e "quando a torre consegue
gastar em reparo satisfatório".

## In scope

- `src/utils/resourceTiers.js`: `isStorageAbundant(room)` novo.
- `src/utils/config.js`: `tower.satisfactoryRepairEnergyRatio` (0.7),
  `tower.rampartSatisfactoryRatio` (renomeado de `rampartHealthyRatio`),
  `repair.normalCriticalRatio`/`normalSatisfactoryRatio` (0.1/0.5),
  `tower.satisfactoryRatio` 0.8→0.7.
- `src/utils/rampartRepair.js`: reescrito — `tier`, `isCritical`,
  `priority`, `builderMayRepair`, `towerMayRepair`. Remove
  `isHealthy`/`worthHardening`/`worthHardeningByTower` (substituídos).
- `src/structures/tower.js`: `findRepairTarget` usa pool único; gate de
  energia da torre passa a viver dentro de `towerMayRepair` (tier-
  dependente), removido do `run()`.
- `src/roles/builder.js`: pool principal usa `priority()`/
  `builderMayRepair()`; fallback dead-last de rampart/wall removido
  (redundante com o pool único).
- `src/roles/hauler.js`: `tower.satisfactoryRatio` fallback 0.8→0.7,
  comentários atualizados.
- `test/smoke.js`: fixtures D4 reescritas pro novo modelo de 3 tiers +
  gates por energia/storage; testes novos de desempate por tipo (torre e
  builder); teste de estrutura normal em tier ótimo sem exigir storage.
- `specs/ARCHITECTURE.md`: seções de `tower`, `builder`,
  `rampartRepair.js`, `hauler.js` atualizadas.

## Out of scope

- Mudar a lógica de build-vs-repair do builder (ordem canteiro vs. reparo
  crítico) — mantida exatamente como estava, a pedido do usuário.
- Gate de storage abundante pra estrutura NORMAL em tier ótimo — só
  rampart/wall têm esse gate (risco de sorvedouro ilimitado é exclusivo
  deles, dado o `hitsMax` de até 300M).
- `miner.towerReserve` (alimentação direta da torre de defesa de source) —
  investigado, já tem uma válvula própria de "além da reserva, se sobrar"
  (branch 4 do `distribute()`) que evita o mesmo tipo de zona morta sem
  precisar de mudança.
- Reivindicação de alvo entre múltiplos builders na mesma sala/tick
  (equivalente ao ROADMAP 0071 pra torres) — não pedido, builder já tem
  seu próprio ciclo de state machine por creep.

## Acceptance criteria

1. Crítico (torre): repara com energia própria ≥50%, não importa o
   storage. *(smoke)*
2. Satisfatório (torre): repara com energia própria ≥70%, sem exigir
   reserva de storage nenhuma (substitui o gate do ROADMAP 0069). *(smoke)*
3. Faixa 50%-70% de energia da torre: nada satisfatório é reparado — zona
   morta real, mas estreita e só sobre a energia da própria torre.
   *(smoke)*
4. Ótimo, rampart/wall (torre): só repara com storage ≥50% de fill
   (`isStorageAbundant`) E energia da torre ≥70%. *(smoke)*
5. Ótimo, estrutura normal (torre): repara só com energia ≥70%, sem
   exigir storage abundante. *(smoke)*
6. Com os três tiers presentes simultaneamente, a ordem de resolução é
   sempre crítico → satisfatório → ótimo. *(smoke)*
7. Dentro do mesmo tier, normal vence rampart vence wall, mesmo quando o
   ratio do rampart/wall é objetivamente pior. *(smoke, torre e builder)*
8. `roles/builder.js` cobre reparo de rampart/wall no tier ótimo com o
   mesmo gate de reserva de sempre (`aboveReserve`, inalterado); estrutura
   normal em tier ótimo sempre elegível. *(smoke)*
9. `node test/smoke.js "$(pwd)"` verde.
10. `npx grunt` builda sem erro.

## Constitution check

- Nenhuma varredura nova de `Game.creeps`/`room.find` — `tower.js` mantém
  o cache por sala/tick (ROADMAP 0071); `builder.js` reaproveita
  `roomCache.structures` já memoizado.
- Nenhum objeto de jogo em Memory.
- Fail-soft preservado — `isStorageAbundant`/`aboveReserve` continuam
  null-safe sem `room.storage`.
- Testável offline — smoke reescrito e ampliado, sem depender do motor.

## Open questions

Nenhuma — usuário confirmou os três limiares (tiers pra estrutura normal,
significado de "sala cheia", escopo do desempate por tipo) antes da
implementação, todos via as opções recomendadas.

## Outcome

Entregue. Sistema de 3 tiers unificado em `utils/rampartRepair.js`,
consumido igualmente por `structures/tower.js` e `roles/builder.js`. Gate
de energia da torre tier-dependente (50%/70%/storage-abundante).
`roles/hauler.js`'s zona morta de entrega pra torre estreitada (0.8→0.7,
alinhada ao novo gate satisfatório). `node test/smoke.js` verde (760
assertions), `npx grunt` gerou `dist/main.js` sem erro.
