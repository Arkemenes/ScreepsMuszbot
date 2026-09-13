# 0027 — Nuker/observer join the tower stamp

- **Status:** done
- **Depends on:** 0003 (base defense layout — dono do stamp da torre)

## Problem

`layoutKey` (o decodificador de stamp em `architect.js`) já sabia traduzir
`N` → `STRUCTURE_NUKER` e `O` → `STRUCTURE_OBSERVER`, e ambos já tinham
entrada na fila de prioridade de canteiro (`createConstructionSites`) — mas
**nenhum stamp jamais usava essas letras**. Nuker e observer nunca entravam
em `plan.buildings`, então nunca viravam canteiro, nunca apareciam no mapa,
em RCL nenhum. Achado ao investigar um relato do usuário de "sinto falta de
um stamp com observer/nuker, ele existe?".

## Desired outcome

O stamp da torre (`case 3`, hoje `.E./ETE/.E.`) troca as extensions de
cima/baixo por nuker e observer:

```
.N.
ETE
.O.
```

Como esse `case` roda uma única vez (`stampStep`, não em loop), garante
exatamente 1 nuker + 1 observer — o teto real do jogo pros dois. As 2
extensions removidas são repostas organicamente pelo `case 9` (stamp solo de
extension, já em loop até um teto bem acima de qualquer cap real de RCL) —
não precisa de lógica nova pra isso.

## In scope

- `architect.js` `case 3`: troca as 2 extensions verticais do stamp por
  `N`/`O`; grade `rcl` correspondente marcada `8` (nuker/observer só existem
  no jogo a partir do RCL8, teto de 1 cada).

## Out of scope

- `STRUCTURE_WALL` (`W` no `layoutKey`, também nunca usado por nenhum
  stamp) — fica de fora por pedido explícito do usuário; o perímetro
  continua só por rampart (mincut).
- Lógica de execução do nuker/observer (lançar nuke, `observeRoom`) — fora
  do escopo, planejamento só.

## Acceptance criteria

1. Um plano completo tem exatamente 1 `nuker` e 1 `observer`. *(smoke)*
2. Ambos com `minimalRCL` 8. *(smoke)*

## Constitution check

- **§1/§2:** mudança é só na grade do stamp — mesmo custo de planejamento de
  antes, nenhum find novo.

## Outcome

Entregue. `architect.js` `case 3`: stamp vira
`["  .  ", " .N. ", ".ETE.", " .O. ", "  .  "]`, grade `rcl` com `8` nas
posições de `N`/`O` (resto inalterado — torre e extensions laterais
continuam RCL3, anel de estrada RCL2). Validado pelo smoke (181 assertions
no total, 2 novas: exatamente 1 nuker + 1 observer no plano completo, ambos
`minimalRCL` 8) + confirmado que a assertion de presença falha revertendo o
stamp pro original + `npx grunt`.
