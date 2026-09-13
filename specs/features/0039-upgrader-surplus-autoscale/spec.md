# 0039 — Upgrader surplus autoscale

- **Status:** done (superseded by [0040](../0040-generic-incremental-autoscale/spec.md))
- **Depends on:** 0015, 0038

## Problem

0038 deu um jeito **manual** (`setWanted`/`clearWanted`) de forçar a
contagem de um role numa sala. Mas o pedido original é automático: numa
sala nova onde tudo já está construído (sem canteiro) e os containers/
storage estão cheios e sobrando, a sala deveria sozinha mandar mais
`upgrader`, e sozinha voltar ao normal quando canteiros reaparecerem — sem
o jogador precisar lembrar de rodar um comando toda vez.

O gap concreto na fórmula de `upgrader` (0015): ela só escala com
`storageEnergy` (`> 400000` → 4, `> 150000` → 2, senão 1). Uma sala jovem
que ainda não tem `STRUCTURE_STORAGE` (comum logo após terminar de
construir tudo do RCL atual) fica **presa em 1** mesmo com os source
containers cheios e o hauler sem para onde levar energia — exatamente o
caso relatado.

## Desired outcome

`rooms/needs.js`'s `compute()` detecta sozinho quando uma sala não tem
mais onde gastar energia — sem canteiro pendente **e** todo sumidouro
(spawn/extensions, source containers, e storage se existir) já cheio — e
sobe `upgrader` até o mesmo teto que a sala já usaria com storage gordo
(4). Assim que qualquer um desses sumidouros tiver espaço de novo (um
canteiro aparece, um container esvazia) o valor cai sozinho no próximo
tick — `compute()` já roda do zero a cada tick, então não existe estado
para "desligar" manualmente.

## In scope

- `rooms/needs.js`'s branch de `upgrader` (RCL < 8): depois do tier normal
  por `storageEnergy`, aplica um bump se **todos** forem verdade:
  - nenhum `FIND_MY_CONSTRUCTION_SITES` pendente (`sites.length === 0`,
    mesmo array já usado pelo `builder`)
  - `room.energyAvailable >= room.energyCapacityAvailable` (spawn/ext já
    no teto)
  - todo source container está com `getFreeCapacity(RESOURCE_ENERGY) ===
    0` (há pelo menos um), **ou** o storage (se existir) está com
    `getFreeCapacity(RESOURCE_ENERGY) === 0`
  - resultado: `upgrader = max(tier atual, upgrader.surplusCount)`
    (`config.js`, default 4 — mesmo teto do tier de storage gordo)
- `config.js`: `upgrader.surplusCount` (default 4).
- `sites` (canteiros) passa a ser calculado uma vez só em `compute()` e
  reaproveitado pelo `builder` (era recalculado ali, mesma chamada
  cacheada pelo `roomCache`, sem custo extra de CPU).

## Out of scope

- RCL 8 continua com a lógica própria (`ticksToDowngrade`) — não faz
  sentido empilhar upgrader ali, o controller não sobe de nível.
- Aplicar o mesmo autoscale a outros roles (`builder` já escala com
  backlog/energia sozinho; `hauler`/`miner` não têm esse problema). Se
  aparecer um caso análogo em outro role, é spec própria.
- Any tuning fino de threshold "quão cheio é cheio" além do que já existe
  (`getFreeCapacity() === 0`, binário) — se um limiar mais suave for
  necessário, ajusta depois com dado real de jogo.
- `setWanted`/`clearWanted` (0038) continuam existindo, intactos, pra
  qualquer caso que esse heurístico não cubra.

## Acceptance criteria

1. Sala sem `storage`, sem canteiro, com `energyAvailable ===
   energyCapacityAvailable` e todo source container cheio →
   `roomNeeds(room).upgrader === upgrader.surplusCount` (4). *(smoke
   asserta)*
2. Um container com espaço de novo → `upgrader` volta ao tier normal no
   próximo tick, sem chamar nenhum comando. *(smoke asserta)*
3. Com um canteiro pendente, o bump não dispara mesmo com todo o resto
   cheio. *(smoke asserta)*
4. Os critérios de aceitação de 0038 continuam valendo — `setWanted`/
   `clearWanted` seguem funcionando por cima do valor calculado
   (autoescalado ou não).
5. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§7:** "spawnar a população mínima viável" — o ponto aqui é o oposto
  de desperdiçar: energia que já não tem pra onde ir é melhor investida em
  upgrade do que ficar parada/decaindo num container cheio.
- **§1:** nenhuma varredura nova — `sites`/`srcContainers` já eram
  calculados por `compute()`, só passaram a ser reaproveitados.
- **§3:** sala sem storage nunca lança (`room.storage &&` antes de ler
  `.store`); container list vazia (`containers > 0 && ...`) nunca conta
  como "cheio" por vacuidade.
- **§6:** teto do bump é `config.get("upgrader.surplusCount", 4)`, não um
  literal novo.

## Outcome

Entregue nesta forma originalmente, depois **substituído por 0040** a
pedido do usuário: em vez de pular direto pro teto (`Math.max(tier,
upgrader.surplusCount)`), o ajuste agora sobe/desce **de 1 em 1**, com um
cooldown por sala (`utils/autoscale.js`, `autoscale.cooldown`), escolhendo
entre roles concorrentes quando o cooldown abre — mecanismo pensado pra
generalizar a outros roles no futuro, o que um pulo direto pra um alvo fixo
não permitia. O critério de elegibilidade em si (sem canteiro, spawn/ext
cheios, containers/storage cheios) sobrevive intacto, extraído para
`rooms/needs.js`'s `upgraderSurplusEligible()` e reaproveitado pelos
`grow`/`shrink` registrados em 0040. `upgrader.surplusCount` foi removido
do `config.js` (substituído por `upgrader.autoscaleMaxCount`). Ver 0040
pro comportamento e os critérios de aceitação atuais.
