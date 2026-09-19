# 0098 — Operações de compra, venda e transferência pelo terminal — Plan

## Approach

`utils/terminalOps.js` será a fronteira única para operações declarativas. As
APIs `transfer`, `buy` e `sell` validam e persistem somente metadados; `tick()`
reserva um terminal por operação, agenda no máximo um hauler por etapa e só
emite `send`/`deal` depois de a carga estar confirmada no terminal. O hauler
executa um `terminalJob` de ida/volta, mas não decide política nem reserva.

Os comandos globais serão `terminalTransfer`, `terminalBuy`, `terminalSell`,
`terminalOperations` e `cancelTerminalOperation`. `buy`/`sell` selecionam
ordens existentes pelo custo/retorno líquido (energia pelo preço de mercado) e
criam/reusam a ordem pública só para o saldo restante. Recebimentos externos e
saldo inicial não reservado vão para storage; o terminal só comporta carga
rastreada de saída, buffer de venda e recebimento pendente.

## Modules

### New

| Path | Responsibility |
|---|---|
| `src/utils/terminalOps.js` | API, estados, reservas, despacho, execução e recebimentos de terminal. |
| `src/rooms/energyBalancing.js` | Política idempotente que escolhe origem/destino e usa somente a API 0098. |

### Changed

| Path | Change |
|---|---|
| `src/main.js` | Chama operações de terminal e balanceador sob `guard`. |
| `src/utils/index.js` | Expõe os dois módulos. |
| `src/roles/hauler.js` | Executa `terminalJob` antes da logística normal. |
| `src/utils/config.js` | Defaults de terminal e balanceamento. |
| `src/utils/console.js` | Documenta os comandos de terminal. |
| `src/utils/stats.js` | Publica resumo pequeno das operações. |
| `test/smoke.js` | Exercita transições, exclusão mútua e decisão do balanceador. |
| `specs/ARCHITECTURE.md`, `specs/ROADMAP.md` | Registra a forma e conclusão das duas features. |

## Data shapes

`Memory.terminalOps = { nextId, operations: { [id]: TerminalOperation }, seenIncoming:
{ [transactionId]: true } }`. Uma operação guarda somente strings, números e
estados: `{id, kind, sourceRoom, targetRoom?, resourceType, amount, orderId?,
state, loadedAmount, sentAmount, haulerName?, automatic?, createdTick,
updatedTick, error?}`. `terminalJob` no creep guarda ids e quantidade; nunca
objetos de jogo. Locks, snapshots de terminal e listas de candidatos são heap.

O balanceador mantém apenas `Memory.energyBalancing`
com a última avaliação e o id pendente; a verdade operacional continua em
`Memory.terminalOps`.

## How it satisfies the constitution

- **CPU:** `census` fornece haulers; não há varredura nova de creeps nem
  `room.find`. O balanceador roda por intervalo, exceto destino crítico.
- **Memory:** só metadados serializáveis, ids e contadores; locks e cálculos são
  heap-only.
- **Fail-soft:** cada intent vira `waiting`/`failed` conforme o retorno; `main`
  envolve ambos os módulos em `guard`.
- **Offline test:** mocks de store, terminal, hauler, mercado e distância
  verificam as transições e que 0097 não chama `send` diretamente.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Saldo externo ser drenado errado | Toda carga não registrada como saída é recebimento e volta ao storage; o ledger de operação preserva saída. |
| Dois jobs usam a mesma carga | Reserva por operação/recurso e um lock por terminal. |
| Creep morre carregado | Job fica em recuperação e só é cancelado antes da retirada. |
| Origem sacrifica a economia | Reserva local, estado crítico e excedente são gates obrigatórios. |

## Rollback

`Memory.settings.terminalOps.enabled = false` e
`Memory.settings.logistics.balanceEnabled = false` pausam novos intents; jobs
já carregados apenas devolvem a carga ao storage.
