# 0101 — Gates de storage para reparo defensivo

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-19

## Problem

`utils/rampartRepair.js` permitia que builders reparassem ramparts/walls
saudáveis sem gate de storage e permitia hardening com apenas a reserva de 1%.
Isso deixava reparo defensivo competir com outras demandas econômicas e com o
balanceamento entre salas.

## Desired outcome

Crítico continua sendo reparado mesmo com storage baixo. Reparo saudável de
rampart/wall exige storage estritamente acima de 10%, e hardening exige storage
de pelo menos 70%. Builder e tower usam os mesmos gates defensivos, sem alterar
os gates de energia próprios da torre, as estruturas normais ou a política de
balanceamento intersalas.

## In scope

- Adicionar thresholds configuráveis específicos para reparo defensivo.
- Centralizar comparações de storage em `utils/resourceTiers.js`.
- Aplicar os gates a `builderMayRepair()` e `towerMayRepair()`.
- Atualizar smoke, `ARCHITECTURE.md` e esta documentação.

## Out of scope

- Alterar os thresholds de tier de hits (`0.1%`/`1%`).
- Alterar `logistics.storageSatisfactoryRatio` ou o balanceamento intersalas.
- Alterar estruturas normais ou a energia mínima própria das torres.

## Acceptance criteria

1. Crítico de rampart/wall continua elegível sem storage.
2. Saudável é bloqueado em exatamente 10% e permitido acima de 10%.
3. Ótimo/hardening é bloqueado abaixo de 70% e permitido em exatamente 70%.
4. Builder e tower aplicam os mesmos gates defensivos.
5. Estruturas normais e prioridade de tiers/tipos permanecem inalteradas.
6. A política de balanceamento continua usando suas reservas e thresholds
   próprios.
7. `node --check`, smoke e `npx grunt` passam.

## Constitution check

- **CPU:** apenas leituras O(1) do storage; nenhum `find` novo.
- **Memory:** nenhum dado novo persistente.
- **Fail-soft:** salas sem storage continuam retornando falso para gates não
  críticos, sem lançar.
- **Config:** thresholds ficam em `Memory.settings` via `utils/config.js`.
- **Offline:** smoke cobre os limites inclusivo/exclusivo e ambos os workers.

## Open questions

Nenhuma.
