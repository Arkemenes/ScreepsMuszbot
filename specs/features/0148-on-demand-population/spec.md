# 0148 — População sob demanda (builder e upgrader)

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15
- **Depende de:** 0154 (`energyReport` e framework de experimento)

## Problem

`rooms/needs.js` mantém **1 builder vivo por sala** mesmo sem obra (`builder = min(byBacklog, byEnergy, 1)`;
"keep one around for repairs") e 1–4 upgraders por energia em storage. Medição 2026-10-15: 5 builders custam
~1,7 CPU/tick (~0,33 por creep) mais `builder.opportunistic` 0,5–0,7 e `builder.pickPile` 0,1–0,5; 5 upgraders
~1,1–1,5. Cada ação do jogo custa ~0,2 CPU. A população já é quase mínima (miner 1/fonte, hauler 1 + fontes sem
link), então a folga está em builders e upgraders. Estimativa: 0,6–1,2 CPU (builder), 0,3–0,7 (upgrader).

Subir RCL é limitado pela **renda de energia** (2 fontes = 20 energia/tick; RCL3->4 pede 135 mil): mais upgraders só
aceleram se houver energia sobrando. A política de upgrader precisa de dado (`energyReport`), não de palpite.

## Desired outcome

O mesmo resultado de jogo (reparos em dia, obras concluídas, RCL/GCL avançando, sem downgrade) com menos creeps
ativos fora dos momentos de demanda, validado **por experimento automático com rollback**.

## In scope

1. **Builder sob demanda** (`population.builderOnDemand`, por sala): `builder = 0` quando não há construction site
   **nem** demanda de reparo que as torres não cubram; volta a 1+ ao surgir demanda. "Demanda de reparo" =
   estruturas que o builder repararia (`damagedStructures.sorted` filtrado por `rampartRepair.builderMayRepair`)
   em tier `critical` ou abaixo de limiar configurável, além do que a torre repara (`tower.criticalRatio`).
2. **Experimento** (framework 0154) numa sala por vez, sala de menor risco primeiro (sugestão: RCL3, sem inimigo,
   energia estável). Métricas: menor `hits/hitsMax` entre estradas, containers e ramparts; contagem abaixo de 50% e
   25%; energia de reparo das torres (`energyLedger`); idade do reparo pendente mais antigo. **Rollback automático**
   se container < 40%, estrada < 30%, rampart em tier `critical` por mais de `X` ticks ou torre sem energia.
3. **Upgrader por excedente** (nas salas sem RCL8): política decidida **depois** do `energyReport`: só mais
   upgraders onde há energia sobrando (container cheio, storage crescendo); piso para evitar downgrade.
4. Fundir builder+upgrader onde couber (avaliar com os mesmos experimentos).

## Out of scope

- Corpos (já escalam até 50 partes), boosts (0149), power (0150); contagem de miners e haulers.
- Reduzir cobertura de defesa ou reparo crítico.

## Acceptance criteria

1. The smoke test asserts a room with construction sites or repair demand gets its builder and a room with neither gets none (flag on), and the builder returns when demand appears.
2. The smoke test asserts the experiment rolls back by itself when a structure crosses the safety mark and prints its report without a console call.
3. The smoke test asserts no controller reaches the configured `ticksToDowngrade` safety mark with the new upgrader policy.
4. Live: `warmUsed` (`cpuReport`) lower in a comparable window; roads, containers and ramparts keep their hits over a full creep lifetime (relatório do experimento).
5. Cada política nova atrás de flag por sala, desligável sem deploy.

## Constitution check

Política em config (`Memory.settings.population.*`), sem literais; sem varredura nova por tick (census/roomCache/
damagedStructures já em cache); cada alteração sob `guard()`.

## Open questions

- Sala do primeiro experimento (sugestão: E5N41 ou E6N41, RCL3).
- Limiares de segurança (container 40%, estrada 30%) e `X` ticks para tier `critical`.
