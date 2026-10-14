# 0098 — Operações de compra, venda e transferência pelo terminal

- **Status:** ready
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

## Review decisions (2026-09-19)

- APIs públicas: `terminalTransfer(from, to, resource, amount)`,
  `terminalBuy(room, resource, amount, maxUnitPrice, createListing, skipFeeCap)` e
  `terminalSell(room, resource, amount, minUnitPrice, createListing, skipFeeCap)`. Compra/venda usam as
  melhores ordens existentes que respeitam o limite econômico e listam apenas
  o saldo restante.
  **Revisto em 2026-09-29 (pedido do usuário, para servir o ROADMAP 0110):**
  novo parâmetro `createListing` (default `false`). Com `false`,
  `executeDeal()` negocia o que existir no livro — parcial incluso, tick a
  tick, contra a melhor ordem elegível de cada vez — e, esgotadas as ordens
  elegíveis, a operação só espera/retenta (`touch(op, "waiting")`) em vez de
  criar uma ordem pública para o que faltar; nunca falha por isso, só não
  progride enquanto nenhuma ordem nova aparecer. Com `createListing:true`,
  preserva o comportamento original desta feature (`listResidual()` cria/
  reprecifica a ordem pública para o saldo restante). Antes desta revisão o
  comportamento efetivo sempre era o equivalente a `createListing:true`; quem
  chama sem informar o parâmetro agora recebe `false`.
  **Revisto em 2026-09-30 (bug real, usuário reportou em produção):** uma
  SELL fechou com preço bruto 38.717 mas efetivo 7.505 — a taxa de entrega
  (custo de `calcTransactionCost`, convertido a créditos via
  `energyFairPrice`) comeu ~81% do valor, e nada além do `op.limit` (preço
  bruto) barrava o `deal()`. Novo parâmetro `skipFeeCap` (default `false`) e
  novo config `terminalOps.maxFeeRatio` (default `0.05`, 5%):
  `candidateOrders()` agora também rejeita qualquer ordem cuja taxa de
  entrega (`item.fee`, já calculado por `scoredOrders()`, agora exposto no
  item) exceda `maxFeeRatio` do preço bruto da ordem — a menos que
  `skipFeeCap:true`. `marketFlip.js` (ROADMAP 0110) passa `skipFeeCap:true`
  nas suas duas chamadas: já avalia essa mesma taxa como parte do próprio
  `netProfit`/`minProfitRatio`, então aplicar o teto de novo aqui seria
  redundante e mais restritivo que o desenho do flip.
  `reportNoCandidate()` também passou a distinguir no log se a rejeição foi
  por preço bruto fora do limite, por taxa acima do teto, ou os dois.
- O limite sempre é líquido: energia de transação vale `fairPrice(energy)`;
  preço de ordem própria incorpora a taxa de criação de 5%. Compra usa
  `buyPrice`, venda usa `sellPrice`, com um passo competitivo configurável de
  `0.001 Cr`. Sem cotação necessária, espera.
  **Revisto em 2026-09-24 (bug real, usuário reportou em produção):** essa
  regra valia só pra fixar o preço de listagem própria (`listResidual()`); pra
  aceitar um `deal()` direto contra uma ordem existente, o limite agora
  compara contra o preço bruto da ordem (o número que o usuário lê direto no
  `marketPrice()`/livro de ofertas), não contra o efetivo líquido do custo de
  entrega. Caso real: SELL com limite 43 achou uma ordem de compra a 43.925,
  mas `candidateOrders()` descartou porque o custo de entrega até uma sala
  distante (`calcTransactionCost()`, convertido a crédito via
  `fairPrice(energy)`) derrubava o efetivo pra 32.113 — abaixo do limite. O
  usuário definiu o limite observando o preço bruto do mercado, então uma
  ordem acima dele deve fechar negócio mesmo que o líquido não cobrisse; o
  efetivo continua sendo usado só para desempatar entre ordens que já
  passaram no bruto (`src/utils/terminalOps.js`'s `candidateOrders()`).
  **Revisto novamente em 2026-09-24 (bug real, usuário reportou em
  produção):** "nenhuma ordem foi efetivada" apesar de `terminalOperations()`
  mostrar SELLs `completed` com `dealtAmount` preenchido. Causa raiz:
  `Game.market.deal()` apenas registra um intent — o motor executa a troca
  depois que o script retorna —, mas `executeDeal()` liquidava a operação no
  mesmo tick, largando a posse sobre carga ainda fisicamente no terminal.
  `scanTerminalBalances()`, que roda no fim desse mesmo `tick()`, via a carga
  e a energia da taxa como superávit e despachava haulers para devolvê-las ao
  storage; esses `withdraw` caem na mesma leva de intents do `deal()` e
  esvaziavam o terminal por baixo da troca pendente. Corrigido com o estado
  `settling`: `executeDeal()` grava `op.pendingDeal` e não muta nada; no tick
  seguinte `settleDeal()` confirma a troca pelo store do terminal
  (`dealTraded()`; `marketOnly` cai no livro de ordens) e só então liquida.
  Não confirmada, volta para `atTerminal` e bloqueia a ordem via
  `op.deadOrderIds`. Ver `specs/ARCHITECTURE.md`, "Deal settlement is a tick
  late, on purpose".
- O terminal é trânsito, nunca storage: recebimentos de qualquer origem vão ao
  storage; uma baseline zero trata saldo não reservado como recebido. Carga de
  saída é rastreada pela operação e nunca é recolhida por engano.
- SELL listada é indefinida e mantém até
  `min(terminalOps.saleBufferAmount, capacidade × terminalOps.saleBufferCapacityRatio)`
  no terminal, reposto do storage. Os defaults foram `10000`/`0,1` até
  2026-09-24 e hoje são `300000`/`0,85` — quem manda é a razão, e os 15%
  restantes são folga pra energia da taxa e pra entradas. Ordens gerenciadas pelo bot podem ser
  reutilizadas/estendidas por nova intenção; ordens manuais nunca são tocadas.
- O comando valida tudo atomicamente e retorna disponível/reservado/necessário
  quando não puder iniciar. Compra realiza deals já elegíveis e só deixa de
  listar o restante se faltar crédito para a taxa; não executa preço fora do
  limite.
- Cancelar uma SELL cancela a ordem e devolve saldo não vendido. Creep morto
  entra em recuperação com timeout configurável. Prioridade é recuperação,
  manual, recebimento e automático; capacidade pode forçar o escoamento mínimo
  de um recebimento para liberar o trabalho prioritário.
- `Memory.stats` expõe agregados deslizantes de 60 ticks por sala/tipo:
  quantidade, créditos, energia de taxa, pendências, espera e último erro.

- **Follow-up de 2026-09-24 (bugs reais em produção, `terminal-178`/`terminal-180`):**
  a reposição acima existia no papel mas não no código — `listResidual()` nunca
  designava hauler, então uma ordem pública de 62751 O convivia com um terminal
  de 10000 O e só conseguia entregar isso. O ramo `listing`/`listed` de uma SELL
  agora chama `stageSaleCargo()` antes de reprecificar, e devolve a operação ao
  estado anterior quando `assign()` não consegue despachar, pra não reiniciar o
  fluxo de listagem à toa. Na mesma passada o lote de staging subiu de 10000 fixos
  pra 85% do terminal (uma venda de 80k não precisa mais de oito ciclos de hauler
  mais cooldown) e a reprecificação trocou `cancelOrder` + `createOrder` por
  `Game.market.changeOrderPrice`: a taxa de 5% só incide sobre o aumento de preço,
  então baixar preço — o caso normal de uma venda — passou a ser de graça, contra
  ~196k créditos por ciclo no desenho antigo. Detalhes em `specs/ARCHITECTURE.md`,
  "Uma ordem listada continua sendo abastecida e reprecifica de graça".
# Otimização de seleção — ARK-116 (2026-10-13)

A seleção elimina ids falhos, quantidade nula e preços brutos fora do limite
antes de calcular transporte. Limites efetivos preservam avaliação com frete;
ranking, teto de taxa e diagnóstico de ordens rejeitadas permanecem iguais.
Reprodução no smoke: 101 cálculos → 1 para compra/venda com uma ordem elegível.
Média live e meta global de CPU ainda aguardam validação.
# ARK-116: frete repetido na seleção do livro (2026-10-13)

Gráfico30min: terminalOps.operations1,99 CPU/tick, sell:atTerminal1,29.
scoredOrders calcula frete para cada ordem elegível, mesmo quando origem,
destino e quantidade são iguais. Compartilhar esse cálculo só dentro da
seleção atual, por destino/quantidade (origem fixa da operação). Nova
seleção recalcula; sem cache de preço/volume entre ticks. Limites brutos,
efetivos, cap de taxa, ranking, diagnósticos e quantidades preservados.
Spans orderBook e scoreOrders separam consulta e avaliação do livro;
scoreOrders é inclusivo, não somar ao span da operação.
