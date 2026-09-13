# 0044 — Cortesia de tráfego: "excuse-me" — Plan

## Approach

`travel()` (`utils/move.js`) já sabe distinguir um creep parado (`isParked`)
de um em trânsito na tile seguinte do caminho cacheado. Hoje esse caso só
força `repath` com `avoidCreeps`. Trocamos essa reação por uma tentativa de
pedir licença primeiro: um módulo novo, `utils/excuseMe.js`, caminha em
linha reta a partir da tile bloqueada na mesma direção do movimento,
coletando qualquer fila de creeps aliados parados (corredor de 1 tile é o
caso real que motivou o pedido), até achar uma tile livre de verdade para o
último da fila. Se achar, move a fila inteira nesse tick (o motor do
Screeps resolve o encadeamento "todo mundo anda uma casa" nativamente,
contanto que o último pouse numa tile vazia no início do tick — mesma
mecânica de um trem de creeps andando em fila). Se não achar, devolve
`false` e `travel()` cai no comportamento antigo.

**Follow-up 1 (a pedido do usuário):** a tile de saída do último da fila não
é só "a primeira livre" — `pickExitTile()` monta a lista de candidatas
(reta à frente primeiro, depois as 8 vizinhas do bloqueador) e prefere
qualquer uma que bata com uma "âncora" de trabalho do bloqueador
(`anchorsFor()`): controller a alcance 3 pra um upgrader, ou o
container/link debaixo dele agora (qualquer role — mesma checagem que
`isParked()` já faz). Nenhuma candidata batendo com nenhuma âncora → cai
pro comportamento sem preferência (primeira da lista, reta à frente
antes).

**Follow-up 2 (a pedido do usuário):** o miner não deve *nunca* aceitar
excuse-me — seu único objetivo é ficar em cima do container. `chain()`
ganhou `NEVER_ASKED = { miner: true }`: ao encontrar um creep com
`memory.role === "miner"` na coleta da fila, para ali mesmo sem incluí-lo
(a tile dele nunca é considerada livre, nem pra quem vem atrás — não dá
pra "atravessar" um miner). Se o miner for o próprio bloqueador imediato,
a fila fica vazia e `ask()` devolve `false` na hora, sem nunca chegar a
calcular âncora ou tile de saída pra ele — `travel()` cai no rodeio de
sempre, exatamente como antes desta feature existir. Quem estiver entre o
solicitante e o miner ainda pode sair sozinho pro lado (a âncora dele é
calculada normalmente).

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/excuseMe.js` | `ask(mover, nx, ny)` — detecta a fila de creeps aliados parados em linha reta a partir de `(nx, ny)`, acha uma tile de saída pro último da fila, e move a fila inteira (com `say()` de cortesia) se achar. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/move.js` | `travel()`: no branch que detectava bloqueio por creep parado, chama `excuseMe.ask(creep, nx, ny)` antes de forçar `repath`/`blockedByParked` — só rodeia se `ask()` devolver `false`. |
| `src/utils/config.js` | Novo bloco `excuseMe: { maxChain: 4 }` nos `defaults`. |

## Data shapes

Nenhum dado novo em `Memory` ou no heap — tudo recalculado por chamada a
partir de `room.lookForAt`/`room.getTerrain`, os mesmos primitivos que
`isParked()`/`findPath()` já usam. `config.get("excuseMe.maxChain", 4)` é o
único tunable, seguindo o padrão de `utils/config.js`.

## How it satisfies the constitution

- **CPU:** só executa dentro do branch que `travel()` já usa para detectar
  bloqueio (nenhum `room.find`/varredura de `Game.creeps` novo); a busca em
  linha reta é limitada por `excuseMe.maxChain` (default 4), não uma busca
  de grafo.
- **Memory:** nada persistido — mesmo princípio de `rooms/raiding.js`'s
  `findWeakTarget()` (recalcula do zero, sem estado de atribuição).
- **Fail-soft:** `ask()` só fala/move depois de confirmar a tile de saída
  pra toda a fila — nunca movimento parcial. A chamada inteira já vive
  dentro do try/catch de `Creep.prototype.moveTo` (`prototypes/move.js`),
  que cai pro `moveTo` nativo em qualquer exceção.
- **Offline test:** `test/smoke.js` stuba `room.lookForAt`/`room.getTerrain`
  para os seis cenários do spec (tile livre, sem tile válida, fila de 2,
  âncora do upgrader, miner nunca aceita, miner no meio da fila).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Um bloqueador não em linha reta (corredor em L) não é detectado | Fora de escopo — cai no comportamento antigo de rodear, nunca trava. |
| Fila mais funda que `maxChain` | Limite configurável; além dele, `ask()` para de coletar e tenta a saída a partir de quem já foi encontrado — se não achar, cai pro rodeio de sempre. |
| `say()` chamado num objeto sem `.room` (só acontece em fixtures de teste, nunca em jogo real) | Coberto pelo try/catch existente em `prototypes/move.js` — nunca derruba o tick. |

## Rollback

Reverter para o `repath`/`blockedByParked` incondicional: remover a chamada
a `excuseMe.ask()` em `utils/move.js` (voltar ao branch antigo). Nenhuma
migração de `Memory` envolvida.
