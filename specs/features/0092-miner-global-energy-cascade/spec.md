# 0092 — Miner na cascata global de energia

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-17

## Problem

`src/roles/miner.js` trata a torre adjacente abaixo da reserva como prioridade
absoluta até atingir 50% (ou 90% sob ataque). Isso ignora o estado econômico
global: quando spawn/extensions ou controller são críticos, a energia coletada
deveria entrar no link/container compartilhado para alcançar o consumidor mais
urgente, em vez de ficar presa na torre de source.

## Desired outcome

O miner continua sendo o único responsável por manter a torre de source em sua
reserva durante uma emergência defensiva real, mas segue a cascata global nos
demais casos: consumidor crítico da sala recebe a energia pelo link/container;
a torre de source só vence quando a sala está estável/abundante, quando a defesa
está ativa ou quando não há destino compartilhado disponível.

## In scope

- Usar o snapshot de economia de `resourceTiers` na distribuição do miner.
- Priorizar link/container quando a sala estiver crítica por spawn, controller,
  reserva ou outro consumidor não-defensivo.
- Preservar a prioridade da torre durante `defenseActive`.
- Manter o fallback contra desperdício quando container e link não têm espaço.
- Atualizar assertions do smoke.

## Out of scope

- Alterar a coleta física da source ou a regra de assento do miner.
- Fazer o miner transportar energia diretamente para spawn, extensão ou storage.
- Alterar o hauler ou a arquitetura de transferências intersalas.

O hauler deve priorizar spawn/extensions famintos antes de uma torre de source
ou torre da base abaixo do threshold de refill; essa regra pertence à política
0091 e não é alterada pelo miner.

## Acceptance criteria

1. Com torre de source abaixo da reserva e spawn crítico, um miner com link ou
   container disponível deposita no destino compartilhado, não na torre.
2. Com torre abaixo da reserva e `defenseActive`, o miner continua alimentando
   a torre antes do link/container.
3. Com sala estável e torre abaixo da reserva, a torre continua sendo alimentada.
4. Com container cheio, sem link disponível e torre com espaço, o miner continua
   podendo alimentar a torre para evitar desperdício.
5. `node test/smoke.js "$(pwd)"`, `node --check` e `npx grunt` permanecem verdes.

## Constitution check

- **CPU:** reutilizar `resourceTiers.getEconomySnapshot(room)`, cacheado por
  sala/tick; não adicionar `room.find` por creep.
- **Memory:** nenhum novo estado persistente.
- **Fail-soft:** sem snapshot, storage, link ou tower, preservar os fallbacks
  atuais.
- **Spending cascade:** a distribuição segue `critical → satisfactory →
  fallback`, mantendo coleta física fora da política de gasto.

## Open questions

- Nenhuma para este ajuste; a exceção de `defenseActive` mantém a decisão
  explícita e compatível com a responsabilidade exclusiva do miner.
