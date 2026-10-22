# 0176 — Limites próprios do raidSquad

- **Status:** done
- **Owner:** a definir
- **Created:** 2026-10-22
- **Linear:** [ARK-224](https://linear.app/arkemenes/issue/ARK-224/0176-limites-proprios-do-raidsquad-ate-1-torre-rcl-sem-teto)

## Problem

`raidRoom` e `raidSquad` usavam a mesma regra de sala fraca (`isWeakEnemyRoom`): nenhuma torre, nenhum hostil visto e RCL ≤ `raiding.maxTargetRcl` (3). A regra é adequada a um raider solo sem heal, mas rígida para um squad de 4 com 2 medics, que recusava uma sala com uma única torre e nenhum creep.

## Desired outcome

O `raidSquad` tem limites próprios e configuráveis; o raider solo e o `autoRaid` mantêm os atuais.

## In scope

- `isWeakEnemyRoom(room, {squad: true})`: até `raiding.squadMaxTowers` (1) torres e RCL até `raiding.squadMaxTargetRcl` (8). Hostil visto recusa sempre.
- `refusalReason(room, {squad: true})` usado pelo `raidSquad`, com mensagem que mostra o que foi visto e os limites aplicados.

## Out of scope

- Mudar a composição do squad ou a regra do raider solo.

## Acceptance criteria

1. "0176: one tower at RCL5 refuses a solo raid but is fair game for a squad"
2. "0176: more towers than raiding.squadMaxTowers (1) refuses a squad too"
3. "0176: a hostile creep seen still refuses a squad"

## Constitution check

- **Configuração:** limites em `Memory.settings.raiding`.
- **Offline test:** três asserções; os testes antigos de `isWeakEnemyRoom` seguem verdes.
