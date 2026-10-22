# 0186 — Headroom de CPU com o conjunto completo de funcionalidades — Plan

Derivado de `spec.md`; mantém o contrato de salvage estabelecido em 0169.

## Approach

Usar `derived(room)`, que já limpa a estrutura por `Game.time`, para guardar a
lista combinada e ordenada das pilhas que podem ser consideradas pelo hauler e
a lista estrutural de drops de energia descobertos por `roomCache` e não
cobertos por containers.
A entrada inclui `minLoot` e `salvage.enabled`; uma alteração desses valores no
mesmo tick recompõe a lista. A ordenação estável é feita uma vez.
`biggestEnergyDrop()` e os dois ramos de `pickLoadNow()` compartilham a lista
de drops de energia, sem nova varredura da sala por creep. Cada creep continua
aplicando seus próprios thresholds, estimativa de chegada, reservas, perigo e
busca de caminho. Dentro de uma única chamada de `pickLoadNow()`, checks
repetidos do mesmo drop compartilham estimativa, disponibilidade e segurança
em cache local, descartado no retorno; a próxima decisão recalcula esses dados.
Em cada decisão de salvage, o código ainda aplica
`salvage.excludeProtected` e
`excludeDangerZone`, testa a quantidade atual e consulta um destino econômico
fresco. Filtrar uma lista já ordenada preserva prioridade e desempate porque
as operações de filtro preservam a ordem restante. Como só o primeiro pile é
atribuído, a zona perigosa para esse fluxo é pesquisada até o primeiro item
seguro, sem filtrar os itens posteriores.

Em `pickDeliverNow()`, percorrer a lista estrutural de spawns/extensions na
ordem original e retornar ao encontrar o primeiro candidato adjacente com
reserva disponível. Se nenhum for adjacente e elegível, manter a filtragem
completa de reservas e `findClosestByPath()`.

Em `builder.opportunisticWorkNow()`, substituir `inRangeOf()` seguido de
`sortBy()` pela seleção em uma passagem do maior ratio entre os candidatos no
range 3. A comparação estrita preserva o primeiro item em empates; reparos
críticos continuam antes de obras, e os tiers/limiares existentes seguem
inalterados.

Dentro de cada `pickDeliverNow()`, memoizar `availableDeliver` por ID de alvo
para que o fast path adjacente e a filtragem completa compartilhem checks se
não houver alvo adjacente elegível. O mapa é local à decisão, inclui a cascata
de consumidores opcionais e some ao retornar; chamadas seguintes consultam as
reservas novamente.

Dentro de cada `pickLoadNow()`, compartilhar `reservations.available` por ID
entre os tiers que podem examinar o mesmo link, terminal, container ou drop.
Esse cache também termina ao retornar da decisão, quando ainda não houve
intent que possa mudar a disponibilidade.

Para a próxima leitura live, adicionar subspans em `pickLoadNow()` nas buscas
de drop grande/comum, terminal, links (backlog/urgente/normal), verificação de
consumo essencial e busca de container. Eles só observam trabalho já feito e
permitem localizar a próxima otimização sem alterar a cascata.

No ponto em que `pickLoadNow()` precisa apenas saber se existe demanda
essencial, consultar se as listas cacheadas de produção ou torres críticas têm
itens, sem executar `findClosestByRange()`. Outros caminhos mantêm
`essentialConsumer(creep)` para obter o alvo concreto.

O próximo corte diagnóstico divide `pickDeliverNow()` nos ramos de produção,
torres críticas, consumidores opcionais e fallback. Os spans envolvem a cascata
na ordem existente para associar seu custo a cada classe de destino sem mexer
na seleção.

A janela indicou que o seletor de entrega soma menos de0,6 CPU/tick frente a
5,7 do papel hauler. O próximo diagnóstico mede os helpers de carregamento,
jobs de loot e ações de entrega, além de espera/idle e bootstrap, sem alterar
suas intents.

A janela de execução do hauler também mostrou `intel.transitSafety` em0,214
CPU/tick ao observar oito salas. `learnedPlayers()` enumera e expira o mesmo
registro em cada sala; a lista passa a ser heap por tick e invalida após cada
gravação/remoção interna e troca do objeto em Memory, para preservar decisões
imediatas.

Para miners, `nearbyTargets(near)` classifica containers, towers e collector
links em uma passagem; o mesmo resumo serve à checagem de capacidade e à
distribuição. Collector links mantêm menor cooldown e, no empate, menor
capacidade livre, com a ordem original como desempate estável. O índice
`energyDropTiles` mantém o primeiro energy drop de cada tile com seu índice na
lista `roomCache`; uma busca pelos nove tiles adjacentes retorna o candidato
mais cedo nessa ordem. O índice e os targets não persistem em `Memory`.
`miner.nearbyTargets` mede a classificação separadamente para que a leitura
live compare esse span somado a `miner.distribute` com a janela anterior.

Um span `hauler.battlefieldLoot` deixa visível o custo amortizado no medidor
existente. Depois do deploy, a janela de 60 ticks mostra o custo do caminho e a
de 600 ticks confirma se a tendência de bucket melhorou. Próximos cortes só
entram após o medidor mostrar onde o custo restante está.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| — | Reusar os caches heap existentes; nenhum módulo novo. |

### Changed

| Path | Change |
|------|--------|
| `src/roles/hauler.js` | Cachear candidatos de salvage e energy drops em `derived(room)`; conservar filtros/destino vivos; medir `battlefieldLootJob`. |
| `src/roles/miner.js` | Classificar targets adjacentes em uma passagem; indexar energy drops por tile no heap da sala/tick. |
| `src/roles/builder.js` | Selecionar reparos críticos e construction sites próximos em uma passagem estável. |
| `src/roles/hauler.js` | Reusar por decisão as reservas de entrega/retirada em `pickDeliverNow()` / `pickLoadNow()` e medir subcaminhos de carga. |
| `test/smoke.js` | Verificar reuso, invalidação e equivalência dos candidatos/decisões; validar ordem/índice do miner. |
| `specs/ARCHITECTURE.md` | Registrar o cache por sala/tick no fluxo de CPU/salvage. |
| `specs/ROADMAP.md` | Acompanhar ARK-235 e critérios live desta investigação. |

## Data shapes

- `derived(room).battlefieldPiles`: `{ minLoot, salvageEnabled, ordered: GameObject[], unownedContainers: Set<GameObject> }`.
- `derived(room).energyDrops`: `GameObject[]` descobertos por `roomCache`, com recurso `energy` e fora de tiles de container.
- `energyDropTiles[room.name]`: dicionário heap de tile (`y * 50 + x`) para `{ drop, index }`, descartado em cada `Game.time`.
- `nearbyTargets(near)`: `{ container, link, tower, hasLinkCapacity }`, calculado uma vez pelo miner e reutilizado no tick.
- Vive apenas no heap dentro do cache `derivedCache[room.name]`, descartado quando `Game.time` muda.
- `Memory` não recebe nenhuma nova chave nem referência de objeto de jogo.

## How it satisfies the constitution

- **CPU:** os arrays de `roomCache` são combinados/filtrados/ordenados uma vez por sala/tick/configuração; nenhuma passagem extra por `Game.creeps` ou `Room.find`.
- **Memory:** os candidatos ficam somente no heap, como os demais dados derivados.
- **Fail-soft:** ausência de entrada compatível recompõe a lista; os filtros de perigo/proteção e a disponibilidade atual continuam vivos.
- **Offline test:** fixtures exercitam prioridade, mudanças de config no mesmo tick, segurança após cache hit e reset do tick.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| A lista cacheada muda a ordem de prioridade. | Ordenar de forma estável uma vez; filtros preservam a ordem; smoke compara a escolha original em empates e tiers. |
| Um cache antigo ignora ajuste de config feito no mesmo tick. | Comparar `minLoot` e `salvageEnabled` em toda chamada antes do reuso. |
| Segurança ou destino ficam obsoletos entre haulers. | Não cachear `excludeProtected`, `excludeDangerZone`, quantidade nem destino; a atribuição continua aplicando reservas. |
| O ganho é pequeno frente ao custo total. | Usar os spans `hauler.battlefieldLoot` / `hauler.pickLoad` e CPU live para escolher a próxima hipótese; manter ARK-235 aberta até AC7. |
| O cache de drops muda uma seleção de caminho. | Passar a mesma lista de `roomCache` à mesma API de busca e manter o filtro dependente de cada creep; os fixtures preservam prioridades e limites. |
| O índice adjacente escolhe outro drop ou fica obsoleto. | Preservar o menor índice original por tile, pesquisar os mesmos nove tiles e descartar o mapa a cada `Game.time`. |
| A seleção do builder muda a prioridade entre candidatos igualmente completos. | Manter a ordem de entrada em empate e cobrir reparo, construção e limites de alcance no smoke. |
| A reserva muda durante a seleção e um valor local fica desatualizado. | Nenhum intent ocorre dentro de `pickDeliverNow()`; descartar o mapa no retorno e testar uma nova decisão com disponibilidade alterada. |
| Um alvo perde/ganha disponibilidade entre decisões de carga. | O mapa de retirada é local a `pickLoadNow()`; smoke altera a disponibilidade antes da chamada seguinte e confirma nova seleção. |
| Os novos subspans distorcem a CPU observada. | Comparar spans com a mesma janela de 60 ticks e considerar que a instrumentação tem pequeno custo; removê-la depois de localizar o ramo dominante. |
| O teste de presença muda a prioridade urgente. | Consultar as mesmas listas `spawnExtNeedingEnergy`/`criticalTowers` já usadas por `essentialConsumer`; smoke garante que o caso urgente continua sendo detectado. |

## Rollback

Restaurar as seleções anteriores em `builder.js` e remover caches/memoizações/spans em `hauler.js`; não há migração nem configuração persistente.
