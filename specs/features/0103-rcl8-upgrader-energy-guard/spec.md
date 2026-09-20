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
retira energia para um controller RCL 8 completo. Em RCL 8 a demanda de
upgrader é zero; durante qualquer estado legado que ainda exija manutenção,
o teto absoluto continua sendo um creep.

## Acceptance criteria

1. Um builder/upgrader com estado `GetEnergy` apontando para link não-coletor
   não retira energia quando a economia da sala deixa de estar estável.
2. Builder não usa controller RCL 8 como fallback de gasto.
3. RCL 8 completo deseja zero upgraders e não permite que override ou delta
   antigo eleve o teto acima de um.
4. Upgraders excedentes são convertidos em builders derivados, sem deixar
   quatro upgraders ativos na sala.
5. Smoke, `node --check` e build continuam verdes.

## Constitution check

- **CPU:** reutiliza `census` e o estado já persistido; não cria nova varredura
  de `Game.creeps` ou `room.find`.
- **Memory:** o estado continua armazenando apenas IDs e a conversão apenas
  uma string primitiva.
- **Fail-soft:** alvos ausentes são descartados pelos estados existentes.
