# 0103 — Guarda de energia e conversão de upgraders em RCL 8

- **Status:** done
- **Created:** 2026-09-19

## Problem

O gate de `0102` só é aplicado quando builder/upgrader escolhem uma nova
pilha. Um estado `GetEnergy` persistido pode continuar retirando de um link
não-coletor depois que spawn/extensions ficam críticos. Além disso, builder
sem obra cai no fallback de `upgradeController`, inclusive em RCL 8, e um
controller máximo ainda deixa upgraders ativos.

## Desired outcome

Builders e upgraders abandonam imediatamente um saque persistido de link
não-coletor quando spawn/extensions não estão cheios. Nenhum builder/upgrader
retira energia para um controller RCL 8 completo. Em RCL 8 o teto absoluto
continua sendo um creep.

**Follow-up (2026-09-24, bug real reportado em produção)**: o critério de
aceite original ("Em RCL 8 a demanda de upgrader é zero") zerava a demanda
incondicionalmente — nenhum creep nunca mais chamava `upgradeController()`
depois de RCL8, e `ticksToDowngrade` só decaía, sem nunca ser resetado
(sala real presa em RCL8 há dias, timer caindo rumo a zero). Revertido em
`rooms/needs.js`: a demanda volta a depender de `ticksToDowngrade`, mas com
uma margem larga (`upgrader.rcl8UpkeepRatio`, 50% de
`CONTROLLER_DOWNGRADE[8]`) em vez do limiar apertado `< max` que motivou
zerar tudo aqui em primeiro lugar — ver ROADMAP 0103 e `specs/ARCHITECTURE.md`
("upgrader") para o raciocínio completo.

**Segundo follow-up (mesma sessão, 2026-09-24)**: o critério de aceite #2
("Builder não usa controller RCL 8 como fallback de gasto") ficou
incondicional ao nível, sem olhar `ticksToDowngrade` — um builder convertido
de upgrader (que `needs.js`'s dedução `convertedUpgraders` já conta como
cobrindo o upkeep) ficava travado em "zzz" com energia carregada mesmo com o
controller abaixo do low-water mark. `roles/builder.js` agora só bloqueia o
fallback quando `ticksToDowngrade` está no ou acima do mesmo
`upgrader.rcl8UpkeepRatio`; abaixo dele, o builder volta a upgradar.

## Acceptance criteria

1. Um builder/upgrader com estado `GetEnergy` apontando para link não-coletor
   não retira energia quando a economia da sala deixa de estar estável.
2. ~~Builder não usa controller RCL 8 como fallback de gasto~~ (ajustado pelo
   segundo follow-up acima — builder não usa um controller RCL 8 *topado e
   seguro* como fallback; usa quando `ticksToDowngrade` cai abaixo de
   `upgrader.rcl8UpkeepRatio`, mesmo limiar do upkeep upgrader de
   `rooms/needs.js`).
3. ~~RCL 8 completo deseja zero upgraders~~ (revertido pelo follow-up
   acima — RCL 8 deseja 1 upgrader de manutenção sempre que
   `ticksToDowngrade` cai abaixo de `upgrader.rcl8UpkeepRatio`, zero caso
   contrário). Override ou delta antigo continuam sem poder elevar o teto
   acima de um.
4. Upgraders excedentes são convertidos em builders derivados, sem deixar
   quatro upgraders ativos na sala.
5. Smoke, `node --check` e build continuam verdes.

## Constitution check

- **CPU:** reutiliza `census` e o estado já persistido; não cria nova varredura
  de `Game.creeps` ou `room.find`.
- **Memory:** o estado continua armazenando apenas IDs e a conversão apenas
  uma string primitiva.
- **Fail-soft:** alvos ausentes são descartados pelos estados existentes.
