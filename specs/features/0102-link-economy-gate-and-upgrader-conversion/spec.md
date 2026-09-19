# 0102 — Gate econômico para links e conversão de upgrader

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-19

## Problem

Builder e upgrader podiam retirar energia de links não-coletores enquanto
spawns ou extensions ainda estavam incompletos. A conversão de um upgrader em
builder também não era refletida na demanda desejada de upgraders.

## Desired outcome

Links não-coletores ficam reservados para a economia local até spawns e
extensions estarem cheios. Depois da conversão, o upgrader passa a ser tratado
como builder e reduz em um a demanda final de upgraders da sala.

## In scope

- Aplicar `reservations.economyStable(room)` ao saque de links não-coletores.
- Preservar os requisitos próprios de energia e fallbacks do upgrader.
- Marcar a conversão e descontar builders convertidos em `rooms/needs.js`.
- Cobrir os gates e a conversão no smoke test.

## Out of scope

- Bloquear links coletores ou alterar `storageSatisfactoryRatio`.
- Alterar prioridade de spawn, hauler ou balanceamento intersalas.
- Alterar a regra de conversão quando o controller ainda pode progredir.

## Acceptance criteria

1. Builder e upgrader não retiram de link não-coletor quando spawn/extension estão incompletos.
2. Builder e upgrader retiram de link não-coletor quando a economia está estável, respeitando requisitos já existentes.
3. A conversão marca o creep como builder derivado de upgrader.
4. Um builder com `memory.convertedFrom === "upgrader"` reduz em 1 a demanda final de upgraders, sem reduzir abaixo de zero.
5. Estruturas coletoras, fallbacks e balanceamento intersalas permanecem.
6. `node --check`, smoke e `npx grunt` passam.

## Constitution check

- **CPU:** reutiliza `reservations` e `census`; não cria buscas adicionais.
- **Memory:** usa apenas a string primitiva da origem da conversão.
- **Fail-soft:** sem link elegível, os roles seguem seus fallbacks.

## Open questions

- Nenhuma.
