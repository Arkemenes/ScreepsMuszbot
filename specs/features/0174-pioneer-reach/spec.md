# 0174 — Alcance de pioneers por tempo de viagem

- **Status:** done
- **Owner:** a definir
- **Created:** 2026-10-21
- **Linear:** [ARK-222](https://linear.app/arkemenes/issue/ARK-222/0174-alcance-de-pioneers-por-tempo-de-viagem-maes-mais-proximas-e)

## Problem

O único limite para uma sala-mãe mandar pioneers era `pioneer.maxDistance` = 30 salas de rota (`Game.map.findRoute`), e toda mãe dentro do raio mandava até 2. Um pioneer carregado anda 2 ticks por tile em plain (~100 ticks por sala) e vive 1500 ticks. Live (2026-10-21): mães a 15–16 salas (E5N41, E6N41) mandaram pioneers para W9N49, e eles morrem no caminho.

## Desired outcome

Só mandam pioneers as mães que conseguem entregá-los com vida útil, e só as mais próximas. Um pioneer em trânsito segue para a base filha sempre que chega lá a tempo. É a preferência do usuário: ele é um trabalhador maior do que a filha consegue spawnar. Se não chega, trabalha numa sala própria que alcança, em vez de morrer na estrada.

## In scope

- Alcance: `hops ≤ pioneer.maxDistance` e `hops × pioneer.tilesPerHop (50) × pioneer.ticksPerTile (2) ≤ CREEP_LIFE_TIME − pioneer.minWorkTicks (500)`.
- Mães: só as ao alcance com até `pioneer.motherSlackHops` (2) salas a mais que a mais próxima.
- Em trânsito, uma vez por sala: segue se chega à filha com `pioneer.minUsefulTicks` (150) de vida, mesmo que a filha já tenha spawn. Senão desvia para a sala própria com spawn mais próxima que alcança a tempo e vira bootstrap lá. Se nenhuma é alcançável, segue para a filha.
- `pioneerStatus()` mostra os parâmetros novos.

## Out of scope

- Medir o terreno real da rota (a estimativa usa plain e 50 tiles por sala).
- Mudar o corpo do pioneer.

## Acceptance criteria

1. "0174: 11 hops (~1100 ticks loaded) leaves less than minWorkTicks of a 1500-tick life - no rescue"
2. "0174: 9 hops (~900 ticks) is still within reach"
3. "0174: a mother more than motherSlackHops (2) farther than the nearest one doesn't send pioneers"
4. "0174: mothers within motherSlackHops of the nearest one all still help"
5. "0174: a pioneer that can still reach the child room with useful life keeps going (preferred)"
6. "0174: a pioneer that can't reach the child room in time diverts to the nearest reachable owned room"
7. "0174: with nowhere reachable in time, it keeps heading to the child room"

## Constitution check

- **CPU:** `remotes.roomDistance` já cacheia por tick; em trânsito a checagem roda uma vez por sala (`memory._reachCheckRoom`).
- **Memory:** `divertTo` e `_reachCheckRoom` são nomes de sala.
- **Configuração:** todos os limites em `Memory.settings.pioneer.*`.
- **Offline test:** sete asserções no smoke.

## Open questions

Nenhuma.
