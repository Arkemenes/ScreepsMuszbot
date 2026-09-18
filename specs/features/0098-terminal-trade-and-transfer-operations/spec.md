# 0098 — Operações de compra, venda e transferência pelo terminal

- **Status:** spec
- **Owner:** usuário + assistente
- **Created:** 2026-09-18

## Problem

O bot já calcula preços de mercado, mas não possui uma API operacional para
comprar, vender ou transferir recursos. Também não existe uma máquina de
logística que transforme uma intenção em uma operação física completa: retirar
o recurso do storage, levá-lo ao terminal, aguardar condições do terminal,
executar a ação nativa e retirar do terminal os recursos que chegam ou que
sobram da operação.

Sem esse fluxo, uma transferência automática do ROADMAP 0097 teria de
implementar sua própria logística, uma venda poderia deixar material parado no
terminal e recursos recebidos de outro jogador ou de outra sala poderiam nunca
ser levados ao storage.

## Desired outcome

O console e o balanceador criam operações declarativas de terminal. Cada
operação valida seus pré-requisitos, aloca no máximo um hauler por etapa e
persiste progresso suficiente para sobreviver a ticks e reinicializações. Para
transferir ou vender, o hauler busca o recurso no storage e o entrega no
terminal quando esse for o fluxo pedido; para comprar, receber uma transferência
ou receber uma venda liquidada, o hauler retira o recurso do terminal e o leva
ao storage. O módulo executa a ação nativa somente quando o terminal estiver
pronto e deixa a operação observável e cancelável.

## In scope

- Criar um módulo único de operações de terminal, responsável por estados,
  validação, concorrência e despacho de haulers.
- Expor comandos de console, com nomes finais definidos no plano, para:
  - transferir um recurso entre duas salas próprias, recebendo `fromRoom`,
    `toRoom`, `resourceType` e `amount`;
  - vender um recurso a partir de uma sala/terminal, recebendo sala, recurso,
    quantidade e ordem/preço conforme a estratégia aprovada;
  - comprar um recurso para uma sala/terminal, recebendo sala, recurso,
    quantidade e ordem/preço conforme a estratégia aprovada;
  - cancelar e consultar operações pendentes.
- Para transferência de saída, alocar um hauler da sala de origem para:
  1. retirar o recurso do `storage`;
  2. transportar a carga até o `terminal`;
  3. depositar no terminal;
  4. executar `terminal.send(resourceType, amount, toRoom, description)`.
- Para transferência de entrada, alocar um hauler da sala de destino para:
  1. reconhecer o recurso que chegou ao terminal;
  2. retirar o recurso do terminal;
  3. transportar a carga até o `storage`;
  4. depositar no storage.
  Isso vale tanto para uma transferência iniciada pelo próprio bot quanto para
  uma transferência recebida de outra sala ou de outro jogador.
- Para venda, usar o fluxo de retirada definido pela operação: o hauler deve
  buscar a carga no `storage`, levá-la ao terminal e só então executar a venda,
  salvo quando a operação for explicitamente criada como `sellFromTerminal`.
  A forma padrão será definida na revisão desta spec; não misturar carga do
  storage com saldo já reservado no terminal.
- Para compra, executar a compra no terminal e depois alocar um hauler para
  retirar o recurso recebido do terminal e armazená-lo no `storage`.
- Detectar entradas por estado da operação e por transações/variação observável
  do terminal, sem guardar objetos de jogo em `Memory`; usar ids, nomes,
  `resourceType`, quantidades e timestamps.
- Tratar como carga recebida e elegível para retirada qualquer recurso que
  chegue por `Terminal.send` de sala própria, `Terminal.send` de outro jogador
  ou liquidação de compra, desde que não esteja reservado por outra operação.
- Respeitar `terminal.cooldown`, capacidade livre, custo de transação,
  quantidade disponível, saldo de créditos e reservas locais antes de criar
  intents. A operação deve recuar para `waiting` em vez de falhar em loop.
- Manter uma máquina de estados mínima e idempotente, por exemplo:
  `queued`, `loading`, `toTerminal`, `atTerminal`, `executing`,
  `awaitingReceipt`, `unloading`, `completed`, `failed` e `cancelled`.
- Impedir que dois haulers retirem a mesma carga ou que uma operação automática
  do 0097 e uma operação manual usem o mesmo terminal simultaneamente.
- Liberar a reserva quando uma operação falhar antes da retirada; depois que a
  carga estiver no hauler, concluir a entrega ou devolvê-la ao storage antes de
  marcar falha, salvo risco de morte do creep.
- Registrar em `Memory.stats` operações e transferências efetivadas, incluindo
  direção, sala de origem/destino quando aplicável, recurso, quantidade,
  custo, estado e erro final, sem guardar objetos de jogo.
- Permitir que o 0097 use a função de transferência desta feature sem
  conhecer a máquina de estados nem chamar métodos de terminal diretamente.

## Out of scope

- Balanceamento automático entre salas; a política e os gatilhos pertencem ao
  0097.
- Criar ordens públicas persistentes, manipulação de mercado ou arbitragem
  avançada; a primeira versão pode preencher ordens existentes com
  `Game.market.deal()`.
- Venda sem uma política aprovada de seleção de ordem/preço.
- Usar creeps de uma sala diferente da sala da operação para carregar a carga.
- Retirar automaticamente recursos que o jogador colocou no terminal se eles
  estiverem marcados como reserva manual explícita; o mecanismo dessa marcação
  deve ser definido na revisão.
- Colocar recursos recebidos diretamente em `Memory`; somente ids, contadores e
  metadados pequenos podem persistir.

## Acceptance criteria

1. `test/smoke.js` asserts que criar uma transferência persiste origem,
   destino, recurso, quantidade e estado inicial sem chamar `Terminal.send()`.
2. `test/smoke.js` asserts que o hauler da origem retira do `storage`, entrega
   no `terminal` e só então a operação chama `terminal.send()` uma vez.
3. `test/smoke.js` asserts que a transferência recebida cria/avança a etapa de
   entrada e que o hauler do destino retira do terminal e entrega no storage.
4. `test/smoke.js` asserts que a etapa de entrada aceita recursos recebidos por
   uma sala própria ou por outro jogador, sem depender exclusivamente de uma
   operação de saída local.
5. `test/smoke.js` asserts que uma venda não tenta retirar do terminal no fluxo
   padrão antes de preparar a carga no storage e que uma compra retira do
   terminal depois da liquidação.
6. `test/smoke.js` asserts que cooldown, capacidade, custo de transferência,
   saldo/quantidade e ausência de hauler colocam a operação em `waiting` sem
   duplicar intents.
7. `test/smoke.js` asserts que uma operação manual e uma automática não
   reservam o mesmo terminal nem a mesma carga simultaneamente.
8. `test/smoke.js` asserts que uma operação cancelada antes da retirada libera a
   reserva, enquanto uma operação com carga no hauler a devolve ao storage ou
   mantém uma etapa de recuperação.
9. `test/smoke.js` asserts que `terminalTransfer(...)`, `terminalBuy(...)` e
   `terminalSell(...)` falham de forma legível para sala, recurso, quantidade
   ou ordem inválidos.
10. `test/smoke.js` asserts que nenhum objeto de jogo é persistido na operação
    ou em `Memory.stats`.
11. Em jogo, uma transferência automática do 0097 usa somente a API desta
    feature e executa a sequência storage → terminal → `Terminal.send()` na
    origem e terminal → storage no destino.
12. Em jogo, uma transferência recebida de qualquer jogador e uma compra
    liquidada são eventualmente retiradas do terminal por um hauler, respeitando
    reservas e capacidade.
13. `node test/smoke.js "$(pwd)"`, `node --check` nos arquivos tocados e
    `npx grunt` permanecem verdes quando a implementação for feita.

## Constitution check

- **CPU:** operações são máquinas de estado, sem procurar hauler/terminal por
  creep repetidamente; estruturas, census e salas usam caches existentes.
- **Memory:** persistem apenas a operação mínima e métricas pequenas; o
  terminal e o hauler são resolvidos novamente por sala/id no tick de uso.
- **Fail-soft:** cada intent (`withdraw`, `transfer`, `send`, `deal`, `deposit`)
  valida retorno, registra o erro e transita para `waiting`/`failed` sem abortar
  o tick; a chamada no `main` fica sob `guard`.
- **Testável offline:** o smoke usa mocks de terminal, mercado, storage,
  transações e haulers para verificar cada transição.
- **Roles thin:** o hauler executa transporte; o módulo de terminal mantém
  política, reservas e máquina de estados.
- **Config over hardcode:** cooldowns, timeout de operação, reserva, quantidade
  mínima e política de retirada ficam em `utils/config.js`.
- **Prefer the no-op:** nenhuma operação cria spawn dedicado; sem terminal,
  capacidade ou hauler disponível, ela espera ou falha de forma explícita.
- **Spending cascade:** retirada de recurso recebido não pode consumir reserva
  local nem roubar uma carga já comprometida com consumidor crítico.

## Open questions

- Confirmar os nomes finais dos comandos de console e se `terminalSell` deve
  aceitar `orderId` obrigatório ou escolher a melhor ordem usando 0096.
- Decidir se `Terminal.send()` de outro jogador deve ser aceito
  automaticamente ou apenas quando o recurso recebido não estiver marcado como
  reserva manual.
- Definir como distinguir uma entrada recebida de uma carga previamente
  depositada no terminal quando o processo inicia com saldo existente.
- Definir timeout e política de recuperação quando o hauler morrer com carga.
- Definir se a venda padrão sempre prepara a carga a partir do storage ou se o
  jogador poderá escolher explicitamente `sellFromTerminal`.
