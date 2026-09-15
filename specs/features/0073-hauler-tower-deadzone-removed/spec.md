# 0073 — Zona morta de entrega da torre no hauler removida por completo

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

O ROADMAP 0072 apenas *estreitou* a zona morta de entrega do
`roles/hauler.js` (alinhando `tower.satisfactoryRatio` de 0.8 pra 0.7, o
mesmo valor do novo gate de reparo satisfatório da torre). Ainda sobrava
uma faixa real (50%-70% de energia da torre) sem nenhum caminho ativo de
entrega — só o último recurso da cascata (`pickDeliver`, dispara só quando
literalmente mais nada na sala precisa de energia). O usuário pediu pra
matar essa zona morta de vez, não só encolher.

Revendo a razão original de existir uma faixa "satisfatória" separada
(ROADMAP 0054): a torre tinha um TERCEIRO estado (nem crítica, nem no
"alvo ideal") que nenhum outro consumidor opcional da cascata (lab,
factory, container do controller) tem — esses são sempre "opcionais,
liberados por `resourceTiers.aboveReserve`" sem uma segunda barreira no
meio. Não havia razão real pra torre ser diferente.

## Desired outcome

`isTowerCritical`/`towerDeliverable` particionam toda torre em exatamente
dois estados, sem faixa intermediária:

- **Crítica** (`< tower.criticalRatio`, 50%): essencial, incondicional,
  mesma prioridade de spawn/extension.
- **Opcional** (qualquer torre não-crítica com mais que
  `hauler.toppingOffThreshold` de capacidade livre): mesma prioridade de
  lab/factory/container do controller — liberada por
  `resourceTiers.aboveReserve`, sem chão adicional.

`tower.satisfactoryRatio`/`satisfactoryRatioUnderAttack` (config) e
`towerSatisfactoryRatio()` (hauler.js) removidos por completo — não fazem
mais sentido sem uma terceira faixa pra medir.

## In scope

- `src/roles/hauler.js`: `towerDeliverable` perde o piso de
  `satisfactoryRatio`, passa a exigir só `!isTowerCritical(s, room)` +
  capacidade livre acima de `hauler.toppingOffThreshold`.
  `towerSatisfactoryRatio()` removida. Comentários atualizados (inclusive
  os que ainda citavam "ideal band"/"satisfactory band" em `pickLoad`).
- `src/utils/config.js`: `tower.satisfactoryRatio`/
  `satisfactoryRatioUnderAttack` removidos; comentário do bloco `tower`
  reescrito pra descrever a partição binária crítico/opcional.
- `test/smoke.js`: dois comentários/mensagens de teste que citavam a faixa
  "satisfactoryRatio" antiga corrigidos pra descrever o que realmente é
  testado (torre quase cheia, abaixo do piso de `toppingOffThreshold` —
  conceito diferente, não tocado por este fix). Teste novo provando que
  uma torre a 55% (que ficaria presa na zona morta antiga) agora vence por
  proximidade uma torre mais distante a 90% (já elegível antes) — se a
  zona morta ainda existisse, a de 55% seria invisível e a distante
  ganharia mesmo estando mais longe.

## Out of scope

- O gate de reparo da PRÓPRIA torre (`tower.repairEnergyRatio`/
  `satisfactoryRepairEnergyRatio`, `utils/rampartRepair.js`) — esse
  continua tendo uma faixa 50%-70% onde a torre não gasta em reparo
  satisfatório, mas é uma decisão de gasto da própria torre (ROADMAP
  0072), não uma lacuna de entrega do hauler; não pedido pra mudar aqui.
- `miner.towerReserve` — já investigado no 0072, tem válvula própria.

## Acceptance criteria

1. Uma torre com energia entre `criticalRatio` e o antigo
   `satisfactoryRatio` (ex.: 55%) é um alvo válido de entrega opcional
   (mesma prioridade de lab/container do controller), não precisa mais do
   último recurso da cascata. *(smoke)*
2. Com duas torres candidatas (uma perto a 55%, outra longe a 90%), o
   hauler entrega na mais perto — prova de que as duas são igualmente
   elegíveis agora. *(smoke)*
3. Uma torre quase cheia (abaixo de `hauler.toppingOffThreshold` de
   capacidade livre) continua não sendo alvo dedicado, só capturada pelo
   último recurso quando não sobra mais nada — comportamento inalterado
   desde o ROADMAP 0043. *(smoke, cobertura já existente)*
4. `node test/smoke.js "$(pwd)"` verde.
5. `npx grunt` builda sem erro.

## Constitution check

- Nenhuma varredura nova de `Game.creeps`/`room.find`.
- Nenhum objeto de jogo em Memory.
- Fail-soft preservado.
- Testável offline via smoke.

## Outcome

Entregue. `towerDeliverable` agora é uma partição binária simples
(`!isTowerCritical`, sem piso extra) — qualquer torre não-crítica com
espaço livre relevante é um alvo de entrega opcional, mesma prioridade de
lab/factory/container do controller. `tower.satisfactoryRatio` e
`satisfactoryRatioUnderAttack` removidos do config. `node test/smoke.js`
verde (761 assertions), `npx grunt` gerou `dist/main.js` sem erro.
