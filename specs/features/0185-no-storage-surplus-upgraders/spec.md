# 0185 — Sala sem storage: hauler por demanda, sobra vira upgrader

- **Status:** done (local)
- **Owner:** agente (proposta aprovada pelo usuário em 2026-10-22)
- **Created:** 2026-10-22
- **Linear:** [ARK-236](https://linear.app/arkemenes/issue/ARK-236/0185-sala-sem-storage-hauler-por-demanda-e-sobra-vira-upgrader)

## Problem

Em salas de RCL baixo (sem `storage` e sem rede de links) o usuário observou com frequência 3 haulers parados. A base de `rooms/needs.js` é `min(hauler.maxCountNoLinks, containers + 1)` — 3 com dois containers de fonte — e não depende de haver trabalho. O autoscale só desfaz o próprio crescimento (`shrink` exige `delta > 0`) e `haulerIdleEligible` só dispara com containers *vazios*; aqui os containers estão cheios e o hauler para porque não há destino (spawn/extensions cheios, sem storage). A sobra deveria virar upgrade, mas o upgrader só cresce +1 a cada `autoscale.cooldown` (30000 ticks).

Um role genérico novo foi considerado e descartado: hauler não tem WORK, um híbrido carrega pior, e `roles/upgrader.js` já busca a própria energia em container/fonte/drop. Mais um role é mais CPU por tick num império limitado a 20 CPU.

## Desired outcome

Sala sem storage e sem links mantém só os haulers que a demanda medida justifica e converte uma sobra duradoura em upgraders, gastando a energia parada e reduzindo creeps ociosos.

## In scope

- `rooms/noStorageEconomy.js`: dois sinais suavizados (EMA, `noStorageEconomy.alpha`) amostrados a cada recomputação de `needs`:
  - **pressure**: spawn/extensions com espaço **e** algum container de fonte com ≥ `hauler.minContainerLoad`.
  - **surplus**: spawn/extensions cheios **e** todos os containers de fonte cheios.
- Hauler = `1 + extra`, extra = 1 quando pressure ≥ `pressureHigh` (0,5) e 0 quando ≤ `pressureLow` (0,2); nunca acima da fórmula antiga.
- Upgrader: +1 a cada `surplusCooldown` (500; era 1500 até 2026-10-23) enquanto surplus ≥ `surplusHigh` (0,6), até `maxUpgraders` (5, base incluída); −1 por cooldown quando surplus ≤ `surplusLow` (0,2). Não cresce na banda de CPU critical.
- Hauler excedente ocioso recicla no spawn: o de menor `ticksToLive`, um por vez (`creep.memory.recycle`). Ocioso = vazio sem nada a carregar **ou** cheio sem destino de entrega (fix 2026-10-23: na sobra os haulers ficavam cheios e nunca chegavam à checagem).
- Hauler só saca do storage/buffer para um consumidor opcional (container do controller, torre, lab) enquanto os haulers que já estão carregando ali não cobrem a necessidade (`reservations.claimedLoad`) — antes todos sacavam carga cheia para a mesma necessidade pequena e devolviam ao buffer (ping-pong).
- `Memory.rooms[name].noStorageEco` guarda só números (`p`, `s`, `h`, `up`, `upTick`).
- Desliga com `noStorageEconomy.enabled = false`.

## Out of scope

- Salas com storage ou rede de links (fórmulas atuais intactas).
- Role novo; mudança no autoscale genérico.

## Acceptance criteria

1. Smoke: `0185: a storage-less room without hauler pressure wants 1 hauler`.
2. Smoke: `0185: lasting pressure adds the extra hauler`, `0185: one calm sample keeps the extra hauler (hysteresis`, `0185: the extra hauler goes once pressure stays low`.
3. Smoke: `0185: no upgrader before surplusCooldown elapses`, `0185: a lasting surplus adds one upgrader per cooldown up to maxUpgraders`, `0185: without surplus the extra upgraders step back one per cooldown`.
4. Smoke: `0185: with more haulers than wanted only the one closest to dying recycles, one at a time`.
5. Smoke: `0185: only rooms without storage (and without links) use the rule`, `0185: Memory keeps only numbers`.
6. Live: em W4N49/W9N49 (RCL2) o número de haulers cai para 1–2 e upgraders crescem enquanto houver sobra (ARK-203 para janelas longas).

## Constitution check

- **CPU:** amostra só na recomputação de `needs` (cacheada), poucos lookups; menos creeps ociosos.
- **Memory:** só números por sala no escopo; nenhum objeto de jogo.
- **Config:** todos os limiares em `noStorageEconomy.*`.
