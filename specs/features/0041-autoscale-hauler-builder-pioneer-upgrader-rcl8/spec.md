# 0041 — Autoscale: hauler, builder, pioneer + upgrader RCL8 guard

- **Status:** done
- **Depends on:** 0040

## Problem

0040 deixou o mecanismo genérico (`utils/autoscale.js`) com um único
consumidor (`upgrader`). O passo seguinte, combinado com o usuário: dar o
mesmo tratamento a `hauler`, `builder` e `pioneer`, cada um com seu próprio
critério de quando crescer/encolher, e fechar uma lacuna do `upgrader`: a
RCL8 nunca deveria acumular mais de 1 upgrader, mesmo que um delta grande
tenha sobrado de antes da sala chegar lá (a fórmula base já limita a **0/1**
em RCL8, mas o `shrink` do autoscale só devolve 1 por janela de cooldown —
com um delta grande isso levaria várias janelas de 30000 ticks pra
convergir).

## Desired outcome

- **`upgrader`**: guarda extra, incondicional — RCL8 nunca reporta mais de
  1 upgrader, **imediatamente**, independente do delta acumulado. Não
  precisa esperar o `shrink` drenar aos poucos.
- **`hauler`**: cresce quando os source containers estão cheios **mas**
  a própria economia da sala (spawn/ext, e storage se existir) ainda tem
  espaço — sinal de que o gargalo é vazão (hauler não dá conta), não
  destino (isso já é o critério do `upgrader`). Encolhe quando nenhum
  container chega perto de valer uma viagem (mesmo piso de
  `hauler.minContainerLoad` que o hauler já usa pra decidir se carrega).
- **`builder`**: cresce quando há canteiro pendente **e** a energia
  disponível pra pegar já passou do teto que a própria fórmula de tier usa
  (mesmo limiar do `byEnergy` máximo, 50000) — o autoscale só empurra além
  do que o tier já decidiu. Encolhe quando a energia disponível cai pro
  patamar baixo da fórmula (1500) **ou** não há mais canteiro nenhum
  (minimiza).
- **`pioneer`**: cresce **além** de `pioneer.maxConcurrent` enquanto a
  sala-mãe ainda tiver um alvo spawnless pendente de verdade (sinal
  "cru", sem o teto de `maxConcurrent` que `pioneersWanted()` já aplica) **e**
  a própria sala-mãe estiver com excedente de energia (mesmo critério do
  `upgrader`, sem o corte de RCL8 — pioneer não upgrada controller). Encolhe
  quando deixa de haver excedente em casa.
- Todo mundo ganha um teto (`<role>.autoscaleMaxCount`) pra nunca crescer
  sem limite.

## In scope

- `rooms/needs.js`:
  - `sourceContainersFull(room)` extraído como helper (reaproveitado por
    `roomEnergySurplus` e por `haulerBacklogEligible`).
  - `roomEnergySurplus(room)` extraído de `upgraderSurplusEligible` (sem o
    corte de RCL) — compartilhado agora por `upgraderSurplusEligible`
    (que adiciona o corte de RCL) e por `pioneerSurplusEligible`.
  - `haulerBacklogEligible(room)` / `haulerIdleEligible(room)`.
  - `builderSurplusEligible(room)` / `builderScarceEligible(room)`.
  - `pioneerSurplusEligible(room)` (usa `pioneering.hasPendingTarget`, novo,
    + `roomEnergySurplus`).
  - `autoscale.register(...)` pra `hauler`, `builder`, `pioneer`, com os
    critérios acima.
  - Guarda incondicional: depois de `autoscale.apply()`, `rcl >= 8` força
    `wanted.upgrader = Math.min(wanted.upgrader, 1)` — cobre tanto a
    fórmula base (que já respeita isso) quanto qualquer delta acumulado
    antes de chegar em RCL8.
- `rooms/pioneering.js`: `hasPendingTarget(motherRoom)` (novo, exportado) —
  "existe alvo spawnless em alcance" sem o teto de `maxConcurrent` que
  `pioneersWanted()` já teria aplicado.
- `config.js`: `hauler.autoscaleMaxCount` (8), `builder.autoscaleMaxCount`
  (6), `builder.autoscaleEnergyHigh`/`autoscaleEnergyLow` (50000/1500,
  mesmos limiares do tier de `byEnergy`), `pioneer.autoscaleMaxCount` (6).

## Out of scope

- Outros roles (miner, defender*, scout, reserver, raider, bootstrap) —
  cobertos na conversa anterior como "já tem número exato" ou "crítico
  demais pra esperar cooldown"; não entram no autoscale.
- Distribuir um pioneer "extra" autoescalado entre vários alvos
  spawnless de forma inteligente — `roles/pioneer.js`'s `nextTarget()`
  já lida com isso (primeiro alvo ainda sob o teto `maxConcurrent`, senão
  o primeiro da lista); um extra além do teto de todos simplesmente cai no
  fallback. Refinar a distribuição é um passo futuro, se necessário.
- Pontuação de urgência entre roles diferentes além de 0/1 (empate resolve
  pela ordem de registro — na época desta spec, `upgrader` > `hauler` >
  `builder` > `pioneer`; reordenado em [0042](../0042-autoscale-tiebreak-order/spec.md)
  pra `pioneer` > `hauler` > `builder` > `upgrader`) - nenhum critério aqui
  precisou de uma pontuação mais fina que "elegível
  ou não" ainda.

## Acceptance criteria

1. RCL8 nunca reporta mais de 1 upgrader mesmo com um delta de autoscale
   grande e recém-herdado (sem esperar o shrink drenar). *(smoke asserta,
   dois casos: base tier querendo 1 e querendo 0)*
2. Containers de source cheios com spawn/ext ainda com espaço → `hauler`
   sobe 1 além do tier; containers ociosos (abaixo de
   `hauler.minContainerLoad`) → volta. *(smoke asserta)*
3. Canteiro pendente com energia disponível acima do limiar alto → `builder`
   sobe 1 além do tier; energia cai pro limiar baixo (mesmo com canteiro
   ainda pendente) → o extra volta. *(smoke asserta)*
4. Sala-mãe com alvo spawnless pendente e excedente em casa → `pioneer`
   sobe além de `pioneer.maxConcurrent`; excedente acaba (alvo ainda
   pendente) → o extra volta. *(smoke asserta)*
5. Nenhum dos critérios novos rouba a vez de outro role por engano num
   cenário onde só um deveria estar elegível (verificado indiretamente:
   os testes de 0040 pro `upgrader` continuam verdes com os 3 novos roles
   registrados no mesmo processo).
6. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§1:** nenhuma varredura nova - todo helper novo reaproveita
  `roomCache`/`sourceContainers`/`pickableEnergy` já existentes.
- **§3:** todo helper novo lida com sala sem storage/containers sem lançar
  (`room.storage &&`, `containers.length > 0 &&`); a guarda de RCL8 nunca
  lança nem quando `wanted.upgrader` é `undefined` em teoria (`Math.min`
  com um valor sempre numérico vindo do cálculo acima).
- **§5:** critério de elegibilidade de cada role continua em
  `rooms/needs.js` (estratégia de sala); `pioneering.hasPendingTarget`
  mora em `rooms/pioneering.js`, mesma casa de todo o resto da lógica de
  elegibilidade de pioneer.
- **§6:** todo teto/limiar novo é `config.get`, não literal.

## Outcome

Entregue. `rooms/needs.js` ganhou `sourceContainersFull`/`roomEnergySurplus`
(refatorados de `upgraderSurplusEligible`, comportamento idêntico) e quatro
pares novos de `grow`/`shrink` registrados no `autoscale`:
`haulerBacklogEligible`/`haulerIdleEligible` (hauler),
`builderSurplusEligible`/`builderScarceEligible` (builder), e
`pioneerSurplusEligible` (pioneer, cresce/encolhe com o mesmo predicate nos
dois lados). `rooms/pioneering.js` ganhou `hasPendingTarget(motherRoom)`
exportado. `compute()` fecha com um clamp incondicional
(`rcl >= 8 → Math.min(wanted.upgrader, 1)`) depois do `autoscale.apply()`,
tornando a garantia de RCL8 imediata em vez de depender de várias janelas
de shrink. `config.js` ganhou `hauler.autoscaleMaxCount` (8),
`builder.autoscaleMaxCount`/`autoscaleEnergyHigh`/`autoscaleEnergyLow` (6 /
50000 / 1500) e `pioneer.autoscaleMaxCount` (6). Validado pelo smoke: 9
assertions novas (RCL8 ×2, hauler ×2, builder ×2, pioneer ×3 incluindo uma
sanity), mais a correção de duas assertions antigas de 0040 que, com os
novos roles competindo pelo mesmo slot de crescimento/encolhimento por
sala, precisaram isolar melhor seus cenários (container liberado antes de
testar o shrink do upgrader). `node --check` limpo em todo arquivo tocado,
`npx grunt` builda (62 arquivos), smoke inteiro verde.
