# 0186 — Headroom de CPU com o conjunto completo de funcionalidades

- **Status:** in-progress
- **Owner:** Codex / ARK-235
- **Created:** 2026-10-22
- **Linear:** [ARK-235](https://linear.app/arkemenes/issue/ARK-235/cpu-critico-bucket-0-com-57-creeps-no-limite-20-shed-por)

## Problem

No shard com limite 20, a consulta live em 2026-10-22 encontrou bucket 2.617,
média de script 16,341 CPU/tick em 60 ticks e média inferida 19,447 em 600
ticks. O saldo de +0,553/tick deixa o bucket abaixo da faixa `normal` por
muito tempo. Na faixa `low`, o tier T0–T1 já está ativo e `cpu.throttle`
alterna builder, upgrader e looter; mesmo assim, o headroom restante é pequeno.
Os intents são 3,973 CPU/tick, principalmente movimento, harvest e upgrade,
por isso reduzir essas ações afetaria produção ou progresso.

O caminho de salvage do hauler reutiliza os resultados de `Room.find`, mas
recombina, filtra e ordena as mesmas pilhas a cada hauler vazio da sala no mesmo
tick. O cache atual `derived(room)` já oferece um heap limitado por sala/tick
que pode reaproveitar essa seleção estrutural.

## Desired outcome

O bucket sobe pelas faixas `low` e `normal`, chega a pelo menos 9.250 e se
mantém próximo do máximo com os tiers e funcionalidades existentes habilitados.
As otimizações removem trabalho repetido sem mudar decisões, segurança,
reservas, intents ou prioridades dos roles.

## In scope

- Reutilizar, em `derived(room)`, a lista de pilhas de salvage combinada e
  ordenada por decaimento, por sala/tick e pelos valores atuais de
  `hauler.minLootLoad` e `salvage.enabled`.
- Como `battlefieldLootJob()` só atribui o primeiro pile válido, interromper
  `excludeDangerZone` no primeiro candidato seguro em ordem de prioridade;
  reavaliar esse caminho em cada decisão.
- Reutilizar em `derived(room)` os drops descobertos por `roomCache` e
  elegíveis estruturalmente como fontes de energia, sem guardar no cache a
  elegibilidade de quantidade, reservas ou perigo que depende do tick/creep.
- Dentro de uma única chamada de `pickLoadNow()`, reutilizar a estimativa de
  quantidade, disponibilidade reservada e segurança por drop ao testar as
  prioridades `bigDrop` e comum; descartar esses dados ao retornar da decisão.
- Dentro de `pickLoadNow()`, reutilizar o resultado de `reservations.available`
  por ID entre tiers que examinam o mesmo link/terminal/container; recalcular
  em cada nova decisão.
- Instrumentar os caminhos caros de `pickLoadNow()` com subspans para medir
  buscas por drops, links e containers e as verificações de terminal/consumo.
- Em `pickLoadNow()`, verificar presença de consumidor essencial nas listas
  cacheadas quando o resultado só decide a prioridade da fonte; manter a
  busca do alvo mais próximo nos caminhos que realmente precisam do objeto.
- No role miner, classificar `near` em uma passagem e reutilizar o resumo em
  `hasDepositTarget` e `distribute`; indexar os energy drops por tile uma vez
  por sala/tick, preservando a ordem original de `roomCache.droppedResources`.
- Reavaliar em cada chamada os filtros de zona perigosa, hostile rampart, a
  disponibilidade atual do recurso e `stockPolicy.destination`; a atribuição
  continua aplicando as reservas existentes.
- Em `pickDeliverNow()`, verificar primeiro em ordem estável se existe um
  spawn/extension elegível adjacente. Só sem um alvo assim filtrar todas as
  reservas de produção e executar a busca de caminho existente.
- Em `builder.opportunisticWorkNow()`, selecionar reparos críticos e obras em
  alcance 3 com uma passagem estável, preservando o candidato de maior razão
  `hits/hitsMax` ou `progress/progressTotal` sem criar listas ordenadas.
- Em `pickDeliverNow()`, reutilizar a disponibilidade de reserva do mesmo alvo
  durante uma decisão quando o fast path adjacente cai na filtragem completa;
  descartar o mapa local ao retornar para consultar valores novos na próxima
  decisão.
- Medir o custo do caminho de salvage pelo `cpuMeter` e comparar com a mesma
  janela live usada no baseline.
- Continuar a investigação de outros gargalos apenas com evidência do medidor,
  mantendo funcionalidades e tarefas de T0–T3 ativas conforme a política
  existente.

## Out of scope

- Reduzir contagens-alvo, desativar features, remover roles ou mudar o volume
  necessário de movimento, harvest, upgrade e defesa.
- Aumentar a cadência de `cpu.throttle` ou alterar faixas/tiers de CPU nesta
  etapa.
- Cachear segurança, estoque disponível, reservas ou destinos entre decisões.
- Guardar objetos de jogo ou listas de objetos em `Memory`.

## Acceptance criteria

1. The smoke test asserts `0186: salvage candidate cache preserves decay priority`: drops continuam antes de tombstones/ruins, que continuam antes de Stores; o primeiro candidato elegível e a ordem entre empates permanecem iguais.
2. The smoke test asserts `0186: salvage candidate cache refreshes dynamic safety and stock checks`: hostile ramparts, quantidade atual e destino são consultados novamente em cada chamada; `excludeDangerZone` permanece no caminho vivo e a atribuição preserva as reservas existentes. `0186: first-safe danger filter stops after selecting the first safe pile` e `0186: first-safe danger filter skips dangerous piles in priority order` garantem a mesma seleção com menos checks. Mudanças de `salvage.enabled`, `hauler.minLootLoad` ou `Game.time` invalidam a entrada.
3. The smoke test asserts `0186: pickLoad reuses room energy drop candidates`: candidate sets from `roomCache` preservam as prioridades `bigDrop` e drop comum, exclusão sob container, thresholds, reservas, danger e quantidade atual; a busca de caminho continua usando a posição de cada creep. `0186: drop range estimate is reused across priority checks within a decision` confirma cache só dentro da chamada. `0186: adjacent production target avoids checks on farther reservations` confirma que um alvo adjacente mantém a ordem e encerra a verificação de reservas de produção sem buscar caminho; sem alvo elegível adjacente, o conjunto completo e o caminho permanecem ativos.
4. The smoke test asserts `0186: miner distribution keeps target and first-drop choices`: a primeira container/tower/link e a ordenação cooldown/capacity dos collector links permanecem iguais; o primeiro energy drop adjacente em ordem de `roomCache` é escolhido, e o índice de tile não é reconstruído entre miners no mesmo tick.
5. Os caches vivem apenas no heap por sala/tick/configuração e não adicionam chamadas diretas de `room.find`; `Game.creeps` continua com uma varredura por tick e `Memory` não recebe objetos do jogo.
6. Após deploy, um meter window completo confirma a mudança nos spans/roles sem reduzir intents úteis nem mudar resultados dos fixtures. A comparação de bucket usa `stats.cpu.accounting` com pelo menos 600 ticks válidos, limite 20, sem reset, saturação ou alteração externa de CPU.
7. Live: a tendência atravessa `low` e `normal`, chega a bucket ≥9.250/10.000 e permanece nessa faixa durante uma janela válida de 600 ticks com os tiers e as funcionalidades previstas ativos.
8. Smoke confirma `0186: opportunistic repair selects the most complete in-range candidate`, `0186: opportunistic repair preserves input order for equal ratios` e `0186: opportunistic construction selects the most complete in-range site`; repair-before-build, alcance e limiares continuam iguais.
9. Smoke confirma `0186: delivery reservation checks are reused within one pick decision` no fallback de alvo adjacente bloqueado para alvo distante e `0186: delivery reservation checks refresh on the next pick decision`; prioridade e resultado da seleção permanecem iguais.
10. Smoke confirma `0186: load decision reuses a link reservation across priority checks` e `0186: load decision rechecks link reservation on its next call`; a mesma disponibilidade é compartilhada apenas no caminho síncrono atual e a próxima chamada pode escolher o link após a reserva mudar.
11. Um meter window pós-deploy expõe a divisão de custo dos subspans `hauler.pickLoad.*` sem alterar os alvos ou as ações do hauler; a próxima otimização é escolhida pela medição.
12. Smoke confirma `0186: load checks essential target presence without nearest-target search`; a prioridade urgente continua acionada pelos mesmos candidatos de `spawnExtNeedingEnergy` e `criticalTowers`.
13. Um meter window pós-deploy divide `hauler.pickDeliver` em produção, torres críticas, consumidores opcionais e fallback; a instrumentação envolve as operações atuais sem alterar ordem, elegibilidade ou alvo selecionado.
14. Um meter window divide trabalho fora da seleção de alvo em `hauler.run`: carregamento, execução de loot, bootstrap, espera por energia, aproximação ao ponto ocioso e ação final de entrega. A instrumentação não muda intents nem destinos.
15. Smoke confirma `0186: learned-player cache refreshes when incident memory is replaced in the same tick` e `0186: learned-player cache refreshes when incident memory is cleared in the same tick`; a lista ativa é reutilizada só dentro de `Game.time` e invalida em mutações internas.

## Constitution check

- **CPU:** reusa `derived(room)` e `roomCache`; não faz nova varredura de creeps ou chamadas de `Room.find`.
- **Memory:** a lista ordenada guarda referências apenas no heap descartável do tick; a memória persistente continua com IDs e campos primitivos.
- **Fail-soft:** os filtros de perigo/proteção e a seleção de destino continuam executados por chamada; falha ou invalidação do cache recompõe os candidatos.
- **Testável offline:** smoke verifica ordem, empate, invalidadores de configuração/tick e frescor das decisões vivas.
- **Configuração:** `hauler.minLootLoad` e `salvage.enabled` continuam sendo lidos do `config` em cada decisão.

## Review — 2026-10-22

Revisada contra o contrato concluído em 0169: a ordenação estável por decaimento
é separável dos filtros de segurança, que permanecem vivos. As entradas de
configuração fazem parte da chave e a escolha de destino não é cacheada. Não há
questão de produto em aberto.

## Review — 2026-10-22 (pickLoad follow-up)

A janela live pós-deploy mediu `hauler.pickLoad` em 0,753 CPU/tick e 2,917
chamadas/tick. `pickLoadNow` procura drops nas faixas >500 e >100 usando
`FIND_DROPPED_RESOURCES`, enquanto `biggestEnergyDrop()` já lê o resultado de
`roomCache`. A otimização compartilha só a lista-base de energia descoberta e
fora de container; thresholds, quantidade estimada, reservas, danger e caminho
permanecem por creep. O alvo e o movimento continuam independentes por hauler.

## Review — 2026-10-22 (miner follow-up)

A janela live mostrou `miner.distribute` em 0,584 CPU/tick e 14,433 chamadas/tick.
O helper repete vários `_.find`/`_.filter` e `_.sortBy` sobre o mesmo `near`,
e volta a percorrer todos os drops para localizar um energy drop adjacente. O
plano passa um resumo de targets à verificação de depósito e à distribuição,
substitui alocações/sort por uma passagem e usa um índice por tile com a ordem
de `roomCache` para a escolha de drop. As intents existentes permanecem iguais.

## Open questions

Nenhuma.
