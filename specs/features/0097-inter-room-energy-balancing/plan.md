# 0097 — Balanceamento automático de energia entre salas — Plan

## Approach

`rooms/energyBalancing.js` calcula snapshots heap-only de storage + terminal,
filtra salas próprias operacionais e chama exclusivamente
`terminalOps.transfer(..., { automatic: true })`. Sala crítica é examinada em
todo tick; as demais respeitam o intervalo. Uma transferência pendente impede
nova decisão para a mesma origem/destino.

O ratio usa a capacidade agregada de storage + terminal, coerente com o ativo
que pode ser transferido. A busca do volume inclui a taxa de envio na reserva
da origem. Uma única transferência por destino/ciclo é a regra inicial, para
não lotar o terminal nem competir com recuperação de recebimento.

## Modules

### New

| Path | Responsibility |
|---|---|
| `src/rooms/energyBalancing.js` | Seleção determinística e criação de transferências 0098. |

### Changed

| Path | Change |
|---|---|
| `src/main.js` | Chama o balanceador sob `guard`. |
| `src/utils/config.js` | Defaults de intervalo, gap e volume. |
| `test/smoke.js` | Cobre gatilhos, volume, desempate e idempotência. |

## Data shapes

`Memory.energyBalancing = { lastRun, pending: { [targetRoom]: operationId } }`.
Snapshots, ratios e candidatos vivem apenas no heap.

## How it satisfies the constitution

- **CPU:** usa `Game.myRooms`, `resourceTiers` e um ciclo de 1000 ticks.
- **Memory:** persiste nomes, id e timestamps, nunca salas/terminais.
- **Fail-soft:** erros por candidato não impedem a próxima sala; `main` usa
  `guard`.
- **Offline test:** o smoke espiona `terminalOps.transfer` e não `send`.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Oscilação | intervalo, gap e uma operação pendente por destino. |
| Drenar origem | reserva + exclusão de estado crítico + teto de volume. |

## Rollback

`Memory.settings.logistics.balanceEnabled = false` interrompe novas operações.
