# 0111 — Tasks

Marcar `[x]` ao concluir. DoD por task: `node --check` nos arquivos tocados,
`node test/smoke.js "$(pwd)"` verde, `npx grunt`.

## Fase 1 — marketPricing
- [x] T1.1 `market.js`: exportar `samples(resourceType)` (temporalSnapshots).
- [x] T1.2 `config.js`: bloco `craft.*` (confidence, floor, liquidity, capital, retention, breakers).
- [x] T1.3 `marketPricing.js`: estatística (mediana, σ_rel, presença, profundidade, spread), `zFromConfidence`.
- [x] T1.4 preço duplo conservador + margem + guardrails de liquidez (AC 1–3, 11).
- [x] T1.5 modelo de custo recursivo por nó + índice reverso + vender-ou-processar (AC 12).

## Fase 2 — labs
- [x] T2.1 `architect.js`: grid `rcl` reordenado.
- [x] T2.2 `labSlots.js`: tabela, alcances, plano de fases por RCL (AC 8, 9, 10).

## Fase 3 — transitório
- [x] T3.1 `hauler.js`: `labFactoryPowerSpawnNeedingEnergy` respeita meta (factory = energia da cadeia, labs = 0, power spawn igual) (AC 6).
- [x] T3.2 dreno ao storage de lab/factory sem cadeia (inclui energia legada) (AC 6, 7).

## Fase 4 — flip
- [x] T4.1 `marketFlip.js` usa `marketPricing` (AC 3, 17).

## Fase 5 — craftPlanner (test)
- [x] T5.1 gate de viabilidade por sala (AC 4, 9).
- [x] T5.2 candidatos + descartes + `craftStatus()` + modo `test` (AC 15).
- [x] T5.3 `main.js` `guard("craftPlanner")`, `utils/index.js`.

## Fase 6 — execução
- [x] T6.1 máquina de estados da cadeia + stall guard (AC 7).
- [x] T6.2 compras (`terminalOps.buy`), `committedCredits` compartilhado (AC 4, 5).
- [x] T6.3 abastecimento por fase no hauler (labs/factory).
- [x] T6.4 venda + fallback de retenção (AC 13).
- [x] T6.5 ledger + disjuntores (AC 14).
- [x] T6.6 respeito a `factoryProduct`/`labReaction` manuais (AC 16).
- [x] T6.7 ROADMAP/ARCHITECTURE atualizados, status `done`.

## Desvios da spec na fase 6 - tratados

Os três desvios da primeira implementação foram corrigidos:

- **Intermediários de lab no lugar.** A reação ganhou a marca `keep` (o hauler
  não esvazia o lab de saída de uma fase cujo produto a fase seguinte consome
  ali), `labLoad` protege o lab que guarda o intermediário do dreno
  transitório, e a barreira de dreno aceita o mineral esperado em vez de exigir
  lab vazio. Só uma fase com `park` no plano passa pelo storage.
- **Produto final direto ao terminal.** `directToTerminal` faz o hauler entregar
  o produto final no terminal, e `terminalOps.trade()` passou a contar o estoque
  do terminal na checagem de venda (não para energia nem `marketOnly`).
- **Log automático.** `[craft]` no console: abertura, etapas, produção pronta,
  retenção, conclusão (lucro real × estimado) e aborto; candidatos quando a
  lista muda e resumo de descartes a cada `craft.logDiscardEvery` scans.
  Desliga com `craft.log = false`.

Limites que continuam:

- **Travas extras de segurança**, não previstas na spec: `craft.maxCashAbsolute`
  (1000000) e o comando `craftCancel(sala)`. `craft.maxActive` existia (1 cadeia
  no total) e passou a 0 = sem teto, 2026-10-02.
- **"Processamento que agregue valor" para insumo retido** acontece pelo
  próprio planner (estoque próprio é reaproveitado a custo de oportunidade) e,
  ao fim de `craft.retentionTicks`, por `sellOrProcess` antes de vender.
- **Sem validação em jogo real.** Tudo testado só no smoke com mocks.

## Paralelismo por estrutura (2026-10-02, pedido do usuário)

- **Uma cadeia por tipo de estrutura por sala.** Uma cadeia ocupa todos os tipos
  que seus passos usam (`kinds`: "factory", "lab") enquanto vive; a factory e os
  labs da mesma sala rodam cadeias diferentes ao mesmo tempo, e salas são
  independentes. Cadeias gravadas antes disso (sem `kinds`/`key`) têm o tipo
  derivado da fila. A primeira cadeia da sala usa o nome da sala como chave; a
  segunda recebe os tipos anexados (`W7N49:lab`).
- **Flags por estrutura.** Concluir uma etapa ou abortar limpa só as flags do
  tipo da cadeia; `directToTerminal` é um campo único por sala, definido pela
  primeira cadeia que o pede e limpo só por ela. Pin manual vale por tipo.
- **Vários haulers em trabalho de mineral.** Saiu o dono único por sala
  (`nonEnergyLogistics.claim` sempre libera; `mineralHauler.maxConcurrent > 0`
  restaura um teto). Um insumo para um destino não é atribuído a dois haulers
  (`feedTaken`); os dois níveis que competem com a energia disponível (trabalho
  pressionado e alimentação de cadeia) sempre deixam um hauler na energia
  (`keepsEnergyHauler`).
- **Ranking continua por margem**, não por lucro por lab-tick.
- **Ainda não existe:** várias reações de lab por sala em paralelo (continua
  uma `labReaction` por sala), então duas cadeias de lab na mesma sala não
  rodam juntas.

## Compra parada em "waiting" (2026-10-02, achado em produção)

Uma compra sem listagem não fecha sozinha quando o livro acaba: fica em
`waiting` à espera de ordem nova, e a cadeia esperava junto até o stall guard
(3000 ticks) abortar, com todos os outros insumos já no storage e os labs
vazios (XLH2O em E1N47: `X` parada, `H` e `L` concluídas). Agora uma compra que
**já negociou algo** e passa `craft.buyPatienceTicks` (300) sem novo negócio é
cancelada e tratada como compra parcial: a cadeia segue reduzida ao que chegou
(regra `minPartialRatio`). Uma compra que não negociou nada continua esperando.

Confirmado em produção (E1N47, `terminal-1534`): `dealtAmount 885`, `remaining 580`,
`waiting`, último negócio a 236,19 contra limite 240,91. Junto, o motivo guardado
em `op.noCandidate` só era gravado na entrada em `waiting` (a chamada tinha a
guarda `op.state !== "waiting"`), então uma compra parada ali ficava com o motivo
velho ou sem nenhum; `reportNoCandidate` agora é chamada sempre, porque já se
limita sozinha (a linha sai uma vez por operação; o registro é renovado a cada
`terminalOps.noCandidateRecordTicks`, 60).

## Limite de compra no preço de equilíbrio (2026-10-02, achado em produção)

Duas cadeias de XLH2O (E1N45 e E1N47) saíram da mesma varredura com o mesmo limite
de `X` (240,91 = ask + 2%), contra o mesmo livro; a primeira comeu as ordens baratas
e a segunda ficou com `X` parado em `waiting`, sem negociar nada, segurando ~730 mil
de `LH2O` já comprado até o stall guard (3000 ticks).

- **Limite de cada compra** = ask + `craft.buySlack` + uma parte da folga da própria
  cadeia (`receita / (1 + margem) - custo`), dividida entre os insumos comprados e
  usando só `craft.buyHeadroomUse` (0,5) dela, nunca acima de `craft.maxBuyPremium`
  (+50%) sobre o ask. A folga é limitada para que gasto planejado + tudo que os
  limites podem somar fique dentro de `maxCashAbsolute`, `maxChainRatio` e do teto
  de comprometido; o reservado em `committedCredits` é esse pior caso.
- **O planner reserva espaço para isso:** o lote é dimensionado para
  `teto / (1 + craft.priceDriftReserve)` (0,15). Sem essa reserva o lote consumia o
  teto inteiro e o limite não tinha como subir (descoberto num teste: 979 mil sob um
  teto de 1M deixaria ~2 mil de folga).
- **Insumo compartilhado:** o planner não abre uma cadeia cujo insumo comprado outra
  cadeia ainda está comprando (`buying`), nem duas na mesma varredura; a segunda
  espera uma varredura posterior, que já vê o livro depois da primeira compra.
- **Compra sem nenhum negócio** por `craft.buyIdleAbortTicks` (900) aborta a cadeia
  e libera os créditos, em vez de esperar o stall guard.

## Modo largo e venda conforme sai (2026-10-02, pedido do usuário)

- **Modo largo (executor).** Só o lab que chama `runReaction` entra em cooldown;
  os de entrada só perdem 5 de cada reagente por reação. A última etapa de lab de
  uma cadeia agora lista todos os labs construídos que alcançam os DOIS de entrada
  (`labSlots.finalOutputs`: 8 saídas em 10 labs, 4 em 6, 1 em 3) em
  `labReaction.outputs`, e `structures/lab.js` roda a reação em cada um. O hauler
  esvazia a saída mais cheia, a pressão é medida nela, o `transientStock` reconhece
  o produto em todas, e a barreira de dreno exige todas vazias (ou com o produto).
  Etapas intermediárias continuam com uma saída só (o produto precisa ficar junto
  para a etapa seguinte). `craft.wideLabs = false` volta a uma saída. O planner
  passou a contar esse paralelismo no `T` da etapa final (antes só contava para
  receitas de um nível e o executor nunca o usou, então o `T` dessas cadeias era
  otimista).
- **Venda parcial.** Enquanto a etapa final produz, o produto que já está no
  storage/terminal é vendido: instantâneo, ao piso de break-even, só com o bid já no
  piso (nunca deixa uma ordem esperando), uma ordem por vez e lote mínimo de
  `craft.minPartialSellRatio` (10%) do alvo. O progresso da etapa passa a ser
  `estoque - baseline + vendido`; ao fim da produção a ordem em curso é cancelada
  (os negócios ficam) e a venda final cobre só o que sobrou, com a retenção/lista no
  piso de sempre. O lucro realizado conta desde a primeira venda parcial. Produto
  que já existia antes da cadeia não é vendido como se fosse dela.
  `craft.partialSales = false` desliga.
- **`directToTerminal` retirado da cadeia** (desvio do Q19(b)): o hauler ainda
  entende a flag, mas a cadeia não a liga mais. `scanTerminalBalances` trata o
  estoque do terminal sem operação como sobra e o devolve ao storage, o que
  explicava o `XLH2O` no storage da W7N49 com a flag ligada.
- **Ainda não existe:** capital reservado liberado aos poucos (continua preso até o
  fim da cadeia, mesmo com parte vendida) e um vendedor automático de excedente
  qualquer (só o produto da cadeia é vendido).

## Piso de venda com margem de lucro (2026-10-02, pedido do usuário)

- **Sempre vender com lucro.** O piso deixou de ser o break-even do planner
  (`est.cost / qty`) e virou `craftChain.saleFloor(chain)`: custo REAL por unidade x
  `(1 + craft.minSaleMargin)`. O custo real soma os créditos e a energia de taxa das
  compras como foram negociadas (eventos de `terminalOps`, somados uma vez quando a
  compra termina - `chain.buyCost`), o estoque próprio/energia a custo de oportunidade
  (`chain.ownCost`) e a energia da própria venda no pior caso (`craft.saleEnergyPerUnit`
  = 1 por unidade, o teto do terminal). Antes, uma compra feita acima do estimado (o
  limite pode passar do ask até `maxBuyPremium`) não entrava no piso e a venda "no
  piso" podia dar prejuízo. A taxa de 5% de ordem listada continua a cargo do
  `terminalOps` (lista a `piso / 0.95`). Enquanto a cadeia ainda compra, o piso usa a
  estimativa do planner. Vale para a venda parcial, a venda final, a retenção e a
  ordem listada.
- **Margem padrão 1%** (`craft.minSaleMargin`): é o mesmo mínimo que o planner exige
  para aprovar (`craft.floor`), então uma cadeia aprovada nunca nasce abaixo do próprio
  piso. Margem maior que a do planner faz a cadeia segurar/listar mesmo sem o mercado
  se mexer.


## Operação zumbi e spam de venda recusada (2026-10-02, produção)

- **Causa.** `terminalOps.runHauler` não conferia se a operação do job ainda estava
  ativa. Uma venda parcial cancelada pela cadeia (`finishPartials`) com o hauler a
  caminho, ainda sem carga (`cancel` só protege quem já carrega), voltava de
  `cancelled` para `atTerminal` quando o hauler terminava a perna. A operação zumbi
  (`terminal-1599`, `utrium_bar`) mantinha `loadedAmount`/`feeLoadedAmount` sem nada no
  terminal, repetia `deal -> -6` (ERR_NOT_ENOUGH_RESOURCES) e bloqueava toda venda nova
  do recurso ("operação concorrente"), então a venda final da cadeia nunca abria.
- **Correção.** `runHauler` descarta o job se a operação já terminou e o hauler ainda
  não carrega o recurso. A cadeia passa a esperar `craft.sellRetryTicks` (25) depois de
  uma venda recusada, em vez de tentar (e imprimir) a cada tick.

## Hauler: lab de saida so com carga util; CPU (2026-10-02, producao)

- **Esvaziar lab de saida.** `hauler.labDrainFloor`: o job `labOutput` so existe quando o
  lab de saida mais cheio tem uma carga cheia do hauler (menor capacidade entre os da
  sala) ou `mineralHauler.labDrainRatio` (80%) do lab, o que for menor, e nunca acima do
  limiar de pressao. O resto, ao fim da reacao, sai pelo `transientDrainJob`. Antes ele
  buscava 5 unidades por viagem.
- **CPU.** Medicao (`cpuTop` + `profile(100)`): media ~19.4/tick; o craft custa ~1/tick
  (`craftPlanner` 0.24-0.52, pico de ~15 no scan a cada 300 ticks). Cortes feitos fora do
  craft: `builder.opportunisticWork` trocou `findInRange` por checagem de coordenadas
  (~1500 `inRangeTo`/tick, ~1.2 CPU) e `intel` refaz a busca de estruturas hostis a cada
  10 ticks (ou todo tick com inimigos na sala, ~0.5 CPU).
- **CPU, 2a rodada.** A 1a medicao depois do deploy quase nao mudou (`inRangeTo` ~148k em
  98 ticks): a origem real eram `pos.findInRange(FIND_STRUCTURES, r, {filter})` do mineral
  (`needs.mineralOperationActive`, `nonEnergyLogistics.mineralOutput`,
  `hauler.mineralContainerJob`, esta ultima por hauler por tick), que varre todas as
  estruturas da sala a cada chamada. `roomCache.structuresNear(room, pos, tipo, range)` e
  `roomCache.sources(room)` respondem o mesmo a partir da lista por tipo ja em cache.

## Testes de torre e profile() (2026-10-02)

- **Smoke verde de verdade.** Os 13 FAILs de torre que eu vinha tratando como baseline
  eram dos testes: o commit 995821c fez a torre guardar ids de estruturas danificadas
  (scan de 5 ticks) e resolve-los por `Game.getObjectById`, e os mocks nao eram
  resoluveis nem isolados entre casos. `mkTestTower` registra os mocks e
  `tower.resetRepairScan()` zera o scan; o smoke fecha com 0 FAIL.
- **`profile(ticks)` agora imprime tambem a tabela do `cpuTop` da mesma janela**
  (`printCpuTop` / `resetCpuMeter` em `main.js`).
- **Bug antigo achado no caminho:** `maybeAutoDisableProfiler` rodava antes de
  `utils.memory.wrap`, que troca `global.Memory` pelo objeto em cache; a gravacao caia no
  Memory recem-parseado e era descartada, entao a sessao nunca fechava (so ficava
  invisivel). Agora roda dentro do `memory.wrap`; o teste imita a troca de Memory a cada
  tick e falha com a ordem antiga.

## deal() -> -6 em loop e log repetido (2026-10-03, producao)

- **Sintoma.** `terminal-2372 deal(..., 300, E1N45) -> -6` repetido a cada ~7 ticks, sem fim.
- **Causa.** Para uma venda, `candidateOrders` limita a quantidade por `op.loadedAmount`, que e
  contabilidade interna, e `executeDeal` so conferia a ENERGIA da taxa, nunca o estoque real do
  recurso no terminal. `stageSaleCargo` so subia o `loadedAmount` (`usable > loadedAmount`) e
  nunca o descia. Se algo tirasse o estoque do terminal (varredura de `scanTerminalBalances`,
  entrega parcial, outra operacao), a operacao oferecia mais do que existia, o motor devolvia
  ERR_NOT_ENOUGH_RESOURCES e ela voltava ao mesmo estado (`waiting -> atTerminal -> deal`).
- **Correcao.** (1) `executeDeal` nao chama `deal()` se o terminal tem menos que a quantidade
  oferecida: `shortCargo` baixa `loadedAmount` ao estoque real e manda a operacao de volta a
  `queued` para o hauler carregar a diferenca. (2) `stageSaleCargo` tambem baixa um
  `loadedAmount` obsoleto. (3) Um `-6` do motor numa venda passa pelo mesmo `shortCargo`
  (`op.dealFailures`, `op.shortCargoCount` ficam na operacao para diagnostico). (4) O log do
  `deal` com o mesmo status de falha sai uma vez e so repete a cada
  `terminalOps.dealErrorLogTicks` (500); um status novo sai na hora. O `-6` agora diz quanto o
  terminal realmente tem do recurso e de energia.
- **Nao sei a causa raiz de o estoque ter sumido** (so que a contabilidade ficou acima do real);
  a linha nova no log e `terminalOperation("terminal-2372")` mostram o numero real.
- **Teste.** Estoque 100 x contabilizado 300 (nao ha deal de 300, `loadedAmount` desce e a
  operacao volta a `queued`), staging em `waiting`, 12 respostas `-6` iguais imprimem 1 linha,
  status diferente imprime de novo; 4 mutacoes pegas.
