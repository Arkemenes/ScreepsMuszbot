# 0093 — Builder aguarda estabilidade econômica

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-17

## Problem

`src/roles/builder.js` pode iniciar `build()` enquanto a sala está em estado
`critical`. Isso acontece tanto no reparo oportunístico de um construction site
em alcance quanto na seleção principal de `targetConstructionSite`, desviando
energia de spawn/extensions, controller, defesa ou reserva.

## Desired outcome

O builder aguarda a economia sair de `critical` antes de construir novos sites.
Reparos críticos de estruturas continuam permitidos durante instabilidade, pois
impedem perda imediata. Quando a sala está `stable` ou `abundant`, o fluxo atual
de construção permanece inalterado.

## In scope

- Consultar `resourceTiers.getEconomySnapshot(room)` no fluxo do builder.
- Bloquear `build()` de construction sites enquanto `economyState === "critical"`.
- Preservar reparo crítico durante criticidade.
- Preservar fallback de energia e seleção de sites quando a economia estabiliza.
- Adicionar assertions ao smoke para construção oportunística e principal.

## Out of scope

- Alterar a política do upgrader.
- Alterar prioridades de hauler, miner ou spawning.
- Bloquear reparos críticos, coleta física ou movimentação do builder.

## Acceptance criteria

1. Um builder com energia, site em alcance e spawn crítico não chama `build()`.
2. Um builder com energia, site em alcance e economia estável chama `build()`.
3. Um reparo crítico continua sendo iniciado mesmo com economia crítica.
4. `node test/smoke.js "$(pwd)"`, `node --check` e `npx grunt` permanecem verdes.

## Constitution check

- **CPU:** reutilizar o snapshot econômico cacheado por sala/tick.
- **Memory:** nenhum estado novo persistente.
- **Fail-soft:** ausência de snapshot ou de site preserva o fluxo atual sem lançar.
- **Spending cascade:** construção é gasto satisfatório e espera `stable`;
  reparo crítico continua sendo consumidor crítico.

## Open questions

- Nenhuma.
