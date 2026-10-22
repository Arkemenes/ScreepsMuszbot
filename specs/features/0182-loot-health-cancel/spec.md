# 0182 — Saque cancela por vida, não pela presença de ameaça

- **Status:** done (local; sem publicação)
- **Created:** 2026-10-22
- **Linear:** ARK-231

## Problem

Torre ou creep armado pausava o saque preventivamente. O usuário quer continuar
saqueando e cancelar somente ao observar um looter com 50% de vida ou menos.

## Desired outcome

Sem examinar torre/intel/creep armado para pausar, o saque segue até terminar
normalmente, ser cancelado manualmente ou qualquer looter da missão atingir
`hits / hitsMax <= loot.cancelHpRatio` (default 0.5). O cancelamento é global
para a missão, não um cooldown: sobreviventes voltam, entregam e se retiram.

## In scope

- Remover isDangerous/isPaused/pause, avisos preventivos e `loot.pauseTicks`.
- Ignorar/limpar `pausedUntil` legado sem exigir novo comando.
- Checar vida antes de coletar, viajar ou gerar reposição. Usar census para
  observar todos os looters da missão e não depender da ordem dos roles.
- Exigir destino e mãe correspondentes: um looter antigo de outra missão não
  pode cancelar a nova por estar ferido.
- Navegação do looter não usa bloqueio preventivo de salas hostis.
- Preservar coleta/entrega, filtros de recursos, término por sala vazia, TTL
  de retorno e política geral de spawn da mãe sob defesa.

## Acceptance criteria

1. `0182: towers and armed creeps do not stop a healthy looter`.
2. `0182: 51 percent continues and exactly 50 percent cancels the mission`.
3. `0182: cancellation stops replacement and survivors return with cargo`.
4. `0182: health is checked before unloading, travel and role iteration order`.
5. `0182: a damaged looter from another mission does not cancel this one`.
6. `0182: legacy pausedUntil no longer prevents looting or replacement`.

## Constitution check

Vida e marcadores primitivos; sem objeto em Memory. Census/roomCache continuam
centralizando leituras. Threshold em config, sem subsystem novo no main.
Smoke cobre fronteira inclusiva, carga, retorno, população e navegação.
