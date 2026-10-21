# 0163 — Utilização do terminal (terminalReport)

- **Status:** in-progress — `terminalReport` publicado em 2026-10-21; aceite live (≥ 48h) pendente.
- **Issue:** ARK-202 (filha de ARK-137, 0150).
- **Created:** 2026-10-21.
- **Contexto:** item pendente do handoff de 2026-10-21 ("medir o terminal para a decisão de power"); contraparte do [labReport](../0155-lab-utilization/spec.md) para a 0150 T7 ("frete próprio evitado / fluxo útil / cooldown no terminal").

## Problem

O `labReport` mostra as três salas limitadas pela reação (busy 93–99%), evidência a favor de OPERATE_LAB. Para comparar com OPERATE_TERMINAL falta saber quanto o nosso terminal paga de frete em transferências úteis e quanto trabalho útil espera pelo cooldown. Sem esse dado a escolha seria por suposição, e a decisão do usuário é escolher por dados.

## Desired outcome / In scope

- Contadores cumulativos por sala em `Memory.terminalReport[sala]`, que sobrevivem a resets: `ticks`, `cooldown` (ticks em cooldown), `blocked` (ticks em que uma operação pronta esperou só pelo cooldown), `freight` (energia de frete paga pelo nosso terminal), `amount` e `transfers`.
- O frete vem do ledger confirmado de `terminalOps.record` e é pago por `op.sourceRoom` (send/deal iniciados por nós). Listagem passiva atendida por outro jogador registra frete 0 e não conta: ela não gera economia própria (0150 §Terminal operado).
- `blocked` vem dos pontos em que `terminalOps` estaciona uma operação por "terminal em cooldown". Conta uma vez por sala e tick.
- Estimativa descritiva de OPERATE_TERMINAL por nível: frete/tick × `POWER_INFO.duration` × (1 − fator), por aplicação e por op. Não autoriza operador, não compara sozinha com o lab e não considera o alívio de cooldown além da fração `blocked`.
- Console `terminalReport(sala)` / `terminalReset(sala)`; stats `rooms[sala].terminalReport` {ticks, busy, blocked, freightPerTick, amountPerTick, transfers, operateSavedL1, operateSavedL5}; painéis Grafana. `terminalReport.enabled` (padrão true) desliga a coleta.

Fora de escopo: decisão do operador (0150 T7/T9), confirmação por delta de store, frete de relay aliado além do que o ledger registra.

## Acceptance criteria

1. Uma amostra por sala e tick; cooldown e espera por cooldown contados uma vez por tick; sala sem terminal fica de fora.
2. Só transferências com frete pago pelo nosso terminal entram em `freight`/`amount`/`transfers`.
3. A estimativa por nível usa os valores de `POWER_INFO`; sem as constantes ela é `null`, sem chute.
4. Custo de CPU desprezível (um laço por sala própria, sem `find`), publicado antes de `cpuMeter.endTick`; desligável.
5. LIVE: ≥ 48h de janela antes de comparar com o labReport na decisão de power.

## Constitution check

Sem scan novo (`Game.myRooms` e `room.terminal`), sem objetos de jogo na Memory, contadores pequenos e cumulativos (mesmo contrato do labReport), observe sob `guard()`, config em `Memory.settings`.
