# Regressão de CPU — ARK-116

Meta: recuperar média abaixo de 9 CPU, validada no shard3.

## Evidência live fornecida

Janela de 20 ticks às 00:16:14: média 20,15 CPU, interrupções por bucket
vazio; `craft.chains` 5,679, hauler 5,149, `pickMineralJob` 2,570,
`chainFeed` 1,204 e terminalOps 1,851 CPU/tick. Spans são inclusivos: não
somar `chainFeed` a `pickMineralJob` nem os spans aos módulos. Sem scout
ou claimer executando nessa janela; busca local custa 0,046 CPU/tick.

Janela anterior de 40 ticks: média 15,28; `craft.scan` chegou a 86,05 CPU
em uma chamada. Essa varredura continua sendo um ponto a acompanhar após
as correções abaixo. Os subtotais legados de terminalOps mostram valores
incompatíveis com a média total; usar o módulo no medidor unificado para
comparação antes/depois, sem somar esses subtotais.

## Causas e correções demonstradas

- `labPolicy.widePlan` reconstruía e ordenava alternativas geométricas em
  cada tick do fallback. Cache limitado de planos e fases no heap, separado
  por slots, produtos e janela do lote; troca de receita invalida o cache.
  Estoque, confirmação de intents e abastecimento continuam por tick.
- `stockPolicy.used` reconstruía o mapa completo de alvos para verificar
  um recurso. Lookup direto preserva override por sala, validação e
  alterações de configuração no mesmo tick.
- `labReagentJob` consultava o mesmo reagente novamente em cada reação.
  Cache local à seleção, inclusive ausência de estoque; a próxima seleção
  consulta o estoque novamente.
- Previsão de combustível recalculava os compromissos para cada venda
  opcional em escassez. Limite calculado uma vez por previsão; chamadas
  futuras continuam observando alterações de estoque/operações.

## Medição offline

Node local; estes tempos não equivalem à CPU do engine Screeps.

| Trecho | Antes | Depois | Trabalho |
| --- | ---: | ---: | --- |
| Fallback XGH2O, 10 labs, 300 ticks | 1.221,26 ms | 18,49 ms | 299 planos reutilizados; ~98,5% menos tempo |
| 30.000 consultas em 40 alvos de estoque | 102,73 ms | 22,00 ms | mesmas 30.000 respostas positivas |

Regressões cobrem reuso, bounds, troca de receitas/slots/targets, ausência
de geometria na Memory, reserva opcional sem cache obsoleto e consulta de
reagentes por seleção. Suite de produção dos labs permanece verde.

## Validação pendente

Após sincronização: coletar `cpuTop(20)` e `Memory.stats.cpu.meter` com pelo
menos 300 ticks, abrangendo um ciclo de scan. Observar média, `craft.chains`,
hauler/`pickMineralJob`/`chainFeed`, `craft.scan` e recuperação do bucket.
A meta <9 permanece aberta; não atribuir ganho live ao benchmark offline.

## Nova evidência — 13/10, 11:16

`cpuTop`: 27 ticks completos, média 18,88, guardado 18,12, restante
0,76. `craft.chains` 5,542 (pico 7,58), craftPlanner 5,577,
hauler 4,957, terminalOps 1,784. Hauler: pickLoad 1,481,
pickMineralJob 1,388, chainFeed 0,293; busca local 0,050.
Craft + hauler + terminal representam cerca de 65% da média.

Gráficos: salto sustentado de craft.chains próximo das 09:00, de perto
de zero para cerca de 5–6 CPU; seis haulers antes e depois. A média da
legenda cobre também o período anterior. Usuário confirmou que a queda
abrupta às 08:30 foi pixel. A escadinha e a queda gradual posterior seguem
sem causa fechada; craft é a principal suspeita do salto contínuo.

O profile solicitado para 100 ticks fechou cedo, com bucket 12: medidor
unificado registrou apenas um tick, 34,25 CPU (inclui overhead). O footer
legado exibiu `Ticks: -1`/`Avg: -34.30`, devido à diferença entre ticks de
início/fim numa janela cortada; esses valores não são média válida. Houve
terminações por bucket vazio às 11:14:50 e 11:15:46.

Se o limite real do shard for 20, 18,88 nos ticks completos deixaria 1,12
CPU de folga. Isso sozinho não explica drenagem: verificar limite do shard,
ciclos longos de scan, custo após endTick (serialização/engine) e ticks
interrompidos. `cpuMeter.endTick()` só fecha ticks que chegam ao fim do loop;
os interrompidos não entram no denominador nem no total. Não assumir que
a janela curta represente a média efetiva do bucket.

### Instrumentação adicional

Spec 0113: `craft.chain.{buying,working,selling,other}`, startItem,
partialSales, strandedSweep; `labPolicy.{resolve,profile,confirm,request,
poll,plan,enter,assignments}`; `hauler.stockPolicy` e terminalFuel.
Nenhuma mudança de decisão/produção. O executor real dos labs com reset de
heap verifica que os spans são atingidos e os balanços continuam exatos.

Após sincronizar esse bundle, usar `cpuTop(0)`, aguardar pelo menos 300
ticks e executar `cpuTop(50)` com profiler desligado. Coletar também limite
do shard e estado/produto/policy/plan/evaluation das cadeias ativas. Se
startItem dominar, seus filhos labPolicy isolam resolução, confirmação,
avaliação e atribuições. Se partialSales ou selling dominar, investigar
reservas/preços/operações. Não somar spans filhos aos pais.

Snapshot live posterior: limit 20, tickLimit 36, bucket 16. Cinco cadeias:
utrium_bar vendendo em W7N49; utrium_bar produzindo em E1N47; XLH2O
policy/wide-live produzindo nas três salas (W7N49/E1N47 fallback,
E1N45 evaluating). Com bucket <500, `labPolicy.poll` não avança simulação.

Mecanismo confirmado em `craftPlanner.tick`: qualquer policy working torna
`policyActive` verdadeiro e chama `craftChain.tick` a cada tick. Essa função
avança TODAS as cadeias, inclusive factory e selling, que sem policy seguem
`craft.tickInterval` (default 10). O snapshot ativa essa amplificação de
frequência; contribuição efetiva aos 5,542 CPU ainda deve ser medida.
Gate de baixo bucket em main não suspende craftChain: produção continua.

Validação desta instrumentação: smoke verde (inclui execução multilevel com
reset de heap), node --check nos quatro JS tocados, diff --check limpo,
grunt gerou dist/main.js, graphify update concluído. Bundle copiado ao
cliente local com hashes SHA256 iguais; sincronização no servidor pendente.

## Causa reproduzida — perfil 12:47

Janela de oito ticks: média 17,11, craft.chains 5,516, startItem 5,189,
labPolicy.plan 3,695 (67% de chains), resolve 0,804, assignments 0,498.
Selling 0,037 e strandedSweep 0,009: a amplificação de cadência das vendas
não é o gasto dominante nesta janela. Hauler.stockPolicy 0,955 e
terminalFuel 0,753 continuam como custos relevantes separados.

O engine copia as constantes com JSON.parse(JSON.stringify(C)) a cada
montagem de Game: https://github.com/screeps/engine/blob/master/src/game/game.js#L402.
`recipeMap` invalidava planCache/widePhaseCache quando REACTIONS mudava de
identidade. Portanto o cache anterior funcionava no smoke com constantes
estáveis, mas era descartado a cada tick real. Isso recompõe alternativas
de wide-live mesmo sem alteração de receita, lote ou labs.

Correção: comparar conteúdo canônico das receitas quando a referência
muda; igualdade preserva caches. Mudança real limpa a geometria; cooldowns
continuam atualizados. Regressão recria profundamente REACTIONS e copia
REACTION_TIME em 100 ticks; antes falhava em todas as reutilizações, depois
passa. Testa também alteração real de inputs e atualização de cooldown.

Benchmark Node local: três planos XLH2O/10 labs, lotes 100/150/200, 300 ticks
com constantes recriadas (900 consultas). Antes 512,73 ms/zero reusos;
depois 18,25 ms/897 reusos, planos finais idênticos (~96,4% menos tempo).
Não equivale à CPU live; meta <9 e recuperação do bucket ainda abertas.

## Validação live da correção — 13:42

Usuário confirmou em dois ticks distintos que REACTIONS e REACTION_TIME
mudam de identidade (83623182→83623201). Perfil pós-correção: 29 ticks,
média 20,51, guarded 18,13, unguarded 2,39. Comparação com janela 12:47:

| Trecho | Antes | Depois | Variação |
| --- | ---: | ---: | ---: |
| labPolicy.plan | 3,695 | 0,259 | -93,0% |
| craft.chains | 5,516 | 2,116 | -61,6% |
| craft.startItem | 5,189 | 1,759 | -66,1% |
| hauler | 4,683 | 4,644 | aproximadamente estável |

São janelas diferentes (8→29 ticks), com três consultas de plano por tick
em ambas. A queda do trecho afetado confirma ganho live, não garante ainda
média sustentável nem recuperação do bucket. labPolicy.plan teve pico 4,14
em uma consulta; acompanhar próximas janelas para separar aquecimento e
invalidação legítima de recomputação frequente.

A média total não é um A/B de condições iguais: creep 7,472→8,539
(17,4→21,2 chamadas/tick), terminalOps 0,424→1,887, market 0,005→1,109,
entry 0,069→1,928. O pico de entry foi 54,22 CPU, contribuindo sozinho
54,22/29≈1,87 à média. Removê-lo aritmeticamente daria cerca de 18,64,
mas isso não é uma medição de steady state nem incorpora custos fora do
loop/ticks interrompidos. Não declarar drenagem resolvida com esse cálculo.

Próximos custos contínuos: hauler.pickMineralJob 1,877 (stockPolicy 1,020),
pickLoad 1,517, terminalFuel 0,762; labPolicy.resolve 0,722 e assignments
0,571. Filhos são inclusivos e não devem ser somados cegamente. Investigação
continua em ARK-116 para atingir a meta <9; o defeito específico de cache
está corrigido e validado em jogo. Sem nova alteração de runtime nesta janela.

## Rodada seguinte — haulers, otimização local

Perfil 13:42 prioriza hauler (4,644), stockPolicy (1,020) e combustível.
`terminalFuel.releasable` fazia duas previsões (keep/reserve); stockPolicyJob
repetia a previsão para necessidade, liberação, ledger e capacidade livre,
além de listar operações/calcular capacidade para cada recurso sem espaço.

Implementado orçamento local `terminalFuel.budget`: uma previsão por seleção,
compartilhada com releasable, terminalWithdrawable e terminalFree. Lista de
operações e capacidade são calculadas sob demanda uma vez na seleção.
Sem cache entre seleções/haulers/ticks; prioridades e reservas preservadas.
Chamadores antigos de terminalFree/terminalWithdrawable não mudam.

Regressões: liberação passa de duas previsões para uma; vinte recursos
bloqueados passam de vinte leituras de capacidade para uma; scans de
operações ficam limitados (incluindo bookkeeping do terminal). Saldo e
capacidade alterados no mesmo tick são observados na próxima seleção.
Smoke, node --check e diff --check verdes. Ganho de CPU live ainda pendente.
`hauler.terminalFuel` passa a incluir também a previsão de stockPolicy;
comparar pais hauler/stockPolicy, não só esse span cuja cobertura aumentou.

Ordem das próximas etapas: (1) medir esta rodada dos haulers; (2) cortar
trabalho redundante de labPolicy.resolve/assignments, preservando reservas,
confirmação e produção; (3) decompor e limitar picos de mercado/terminal;
(4) medir custo fora do loop e janelas fechadas estáveis. Não aumentar
cadências às cegas nem cachear estoque mutável entre haulers. Meta <9
continua aberta; limites físicos de intents também fazem parte do custo.

## Correção da apresentação — 14:12

cpuTop mostrou zero ticks com terminalOps.operations 113,685/tick. Não é
medição de CPU/tick: cpuMeter publica e zera a janela (padrão 60 ticks), mas
perf do terminal só zerava com reset explícito. printCpuTop dividia esse
total antigo por Math.max(1, ticks) da janela nova. Explica também subtotais
de terminal superiores ao módulo em perfis anteriores.

Corrigido: janela corrente vazia usa snapshot fechado identificado pelo
tick. Fases/estados de terminalOps registram seus deltas nos spans do mesmo
medidor, com o mesmo denominador; a tabela não imprime perf legado.
Não há novo scan nem mudança das operações, e os mesmos getUsed existentes
são reutilizados. Regressão reproduziu saída vazia e valor legado artificial
antes; smoke/sintaxe/diff check passam após a correção. Ganho de haulers
continua pendente de uma janela válida pós-sincronização.

## Pico de craft.scan — 15:17

Três ticks: média 196,69; craftPlanner 103,529 (máximo 307,37),
craft.scan 100,483 (máximo 301,44). Uma varredura de ~301 CPU explica
~100 CPU/tick nessa média. Cadeias 2,966 e labPolicy.plan 0,295: o pico
não veio da invalidação corrigida. SwingTrade 23,652, market 11,079 e
entry 16,174 (máximo 48,35) também contam; não usar essa janela como
steady state nem subtrair só craft.scan para inferir CPU normal.

Código de scan percorre todos os produtos/salas de forma síncrona. O fallback
de estimativa chama o solver legado `labSlots.planPhases`; ele buscava a
mesma geometria novamente a cada quantidade em sizeLot. Search usa árvore,
slots e parâmetros de ondas, não batches/cooldown. Implementado cache
limitado de geometria no heap; tempo/estratégia continuam calculados ao vivo.
Resultados são copiados para preservar isolamento contra mutação.

Regressão mede menor acesso à árvore ao redimensionar; preserva duração
atualizada, cooldowns, overrides de paralelismo/estratégia, RCL parcial,
limite/evicção e isolamento. Benchmark Node: 300 consultas XLH2O, lotes
variando e 3/6/10 labs: antes 7.075,96 ms, depois 111,62 ms (-98,4%),
todos os resultados idênticos. Não equivale à CPU live nem demonstra que
toda a chamada de 301,44 CPU vinha desse trecho.

Spans craft.phasePlan e craft.evaluate separam busca geométrica e avaliação
econômica. Smoke/sintaxe/diff check verdes. Próximo passo: medir um ciclo
real de scan pós-sincronização; se ainda houver pico, tornar a varredura
incremental, com limites por tick e revalidação dos candidatos antes de
abrir compras. A rodada de haulers ainda não tem uma janela live comparável.

## Perfil 15:29 — orçamento e avaliação de layouts

26 ticks, média 27,08, guarded 24,62. Scan máximo 81,09, avaliação máxima
43,06; phasePlan 0,191/tick (máximo 1,26) e chains 1,051. Swing 3,532
(pico 39,64), market 2,553 (pico 55,39), terminalOps 2,705; entry pico
50,37. Haulers 2,758, mas agora cinco chamadas/tick, não seis: não atribuir
toda a diferença ao código. Comparação com janelas anteriores não isola
ganho/regressão da média; 27,08 supera limite 20 e ameaça o bucket.

Reprodução local isolou duas causas: poll verificava policyCpuPerTick a
cada dez avanços, e layoutFor ordenava horários por cada reação de cinco
unidades, em cada alternativa. Quantidades maiores tornam um único passo
caro, mesmo com orçamento nominal de 1 CPU. Alterado poll para verificar
antes de cada next; teste virtual de passos 0,6 mostra parada após dois
passos (1,2), bloqueio de outra poll e retomada no tick seguinte.

Para cooldown/tempos inteiros, layoutFor acha o N-ésimo evento entre
progressões aritméticas via contagem por horário e busca binária. Sem
alterar escolha/rank/desempate, transporte ou ticks simulados. Overrides
fracionários preservam o caminho de referência. Teste independente enumera
eventos com cooldowns 1/7/20/0,5, buffers/ready/next/delay diferentes e
quantidades fracionárias de batch; escolhas iguais. Caso 3000 unidades
elimina 1200 sorts (duas alternativas) antes necessários.

Probe Node: XLH2O/XGH2O, lotes 100/500/3000, 10 labs, bandwidth 4,
delay 50, até 100 polls. Antes, máximo de poll em lote 3000 foi 10,92/10,30
ms; depois 1,10/1,05 ms. Preparação fria continua em até 13,36 ms na
reprodução e não está incluída no orçamento de poll. Não são CPU live nem
limite de preempção: um passo continua atômico. Novos spans
craft.policyRequest/craft.policyPoll separam preparação da simulação.
Smoke/sintaxe/diff check verdes; ganho no shard ainda pendente.

Solicitada última janela fechada e limit/bucket/profiler para comparar
estado estável. Mercado/swing e scan síncrono seguem prioridades abertas;
nenhuma promessa de média <9 ou drenagem resolvida nesta rodada.

## Janela estável recebida — tick 83625009

Snapshot fechado de 60 ticks: used 14,582; entry 0,050/max 0,162,
sem pico de inicialização nessa janela. craftPlanner 0,926, chains 0,913,
labPolicy.plan 0,020; stockPolicy 0,340, hauler 3,949 (5,6 chamadas/tick).
TerminalOps 2,225 (sell:atTerminal 1,261), builder 1,435, swing 0,894
(pico 43,156), market 0,099. Não atribuir diferenças brutas somente às
correções: quantidade/estados de cadeias e creeps mudaram entre perfis.

Com limite 20 previamente confirmado, folga observada no medidor seria
5,418 CPU/tick; confirmar bucket em vários ciclos. Esta janela não contém
scan significativo (craft.scan 0,002, max 0,020), portanto não valida pico
ou média do ciclo de descoberta nem a redução live de policyPoll/layoutFor.
Ainda falta ~5,58 CPU/tick para a meta <9 nesta janela. Prioridade contínua:
terminal/haulers; pico de swing e ciclos de scan permanecem abertos.

O JSON da janela está válido. A segunda consulta enviada perdeu os dois
pontos dos campos e gerou erro de sintaxe; não trouxe limit/bucket/profiler
atuais. Esse erro de console não modifica nem invalida o snapshot recebido.
# Terminal: filtros antes do frete — ARK-116

Rodada isolada após autorização do usuário para seguir uma otimização por vez.
`candidateOrders` calculava transporte de todas as ordens válidas do recurso
antes de rejeitar preço bruto incompatível, ids já falhos e quantidade nula.
`scoredOrders(op, true)` antecipa apenas esses filtros. Ranking por preço
efetivo, teto de taxa, política swing e diagnóstico completo continuam vivos.
Limites efetivos ainda calculam frete antes de comparar o preço.

Reprodução via `terminalOps.tick`, com 99 ordens fora do limite, uma falha
anterior e uma elegível: cálculos de transporte 101 → 1 tanto para compra
como venda. Antes da correção falharam as assertions de consultas e de
diagnóstico/quantidade nula; depois passaram. Testes adicionais preservam
limite inclusivo, ranking por frete, limites efetivos e diagnóstico da melhor
ordem rejeitada. Esse corte de consultas não mede a redução de CPU no shard.

Baseline live: janela fechada de 60 ticks em 83625009, total 14,582;
terminalOps 2,225, sell:atTerminal 1,261. Ganho live e meta abaixo de 9
aguardam novas janelas completas após sincronização.
# Hauler: elegibilidade da coleta antes da previsão — ARK-116

Janela posterior ao filtro de ordens: 60 ticks, at 83626636, used 16,491.
Terminal 2,099 vs 2,225; sell:atTerminal 1,342/0,3 chamadas contra
1,261/0,417. Redução do módulo não isola ganho: execução por chamada ficou
mais cara. Contexto mudou (4 salas no plan/spawn, 4 pioneers, 3 políticas
de labs/tick). Hauler 3,940/6 chamadas; pickLoad 1,291; terminalFuel 0,687.

`terminalWithdrawable` previa combustível mesmo quando o saldo liberado
pelo ledger não atingia `hauler.minTerminalLoad`. Agora recebe o mínimo
apenas do seletor de coleta; atualiza o ledger antes de testar o limite
superior `min(withdrawable, saldo atual)`. Se inferior ao mínimo, retorna
zero sem previsão. Demais consumidores continuam com a leitura original.
Não se compartilha previsão entre seleções nem ticks.

Reprodução via pickLoad: saldo inicial 50 e depósito manual não creditado
500 faziam duas previsões inúteis, agora zero. Smoke preserva ledger,
igualdade com o mínimo, proteção de combustível, alteração de piso no
mesmo tick e crédito de entrada no próximo tick. A frequência destes casos
no shard e a redução de CPU total ainda aguardam medição live.
# Pioneers: pico de movimento nativo — ARK-116

Janela 60 ticks em 83626757: total 37,559, pioneer 18,555/5 calls,
move.native 13,695/2,95 calls (max41,276), realSearch0,814/0,1 calls.
Hauler3,820/5 vs3,940/6; pickLoad0,706 vs1,291, terminalFuel0,346 vs0,687.
Mudança de quantidade/atividade e entry49,847 impedem atribuir a redução
bruta ao corte de elegibilidade; janela está apenas 121 ticks após a anterior.

Snapshot de seis pioneers: quatro sem `_realRoute`, com `_move.dest` no
centro de E5N41; um com rota validada e destino na entrada de E3N43; um
ainda em casa sem caminho. Cinco fatigados (22–128). O engine já retorna
ERR_TIRED antes da busca quando não há visualizePathStyle; não atribuir o
pico a buscas durante fadiga nem implementar esse suposto fix.
Fonte: https://github.com/screeps/engine/blob/master/src/game/creeps.js

Hipótese ainda não confirmada: fallback longo concentra buscas nativas
caras quando o creep pode andar. Instrumentação de movimentos normais
separa `routing.movePlanned` (modo hop/rota validada) de
`routing.moveFallback` (fluxo sem rota validada). Sem alteração de
destinos, restrições, orçamento ou resultados. Spans são inclusivos e não
devem ser somados ao pai move.native. Smoke preserva retornos e medição
de realSearch; confirmar próxima janela antes de alterar o fallback.
# Fallback nativo por hop — ARK-116

Saída live at83626961: limit20, tickLimit500, bucket1380, profilerfalse;
cpuTop contém23 ticks (janela atual após reset), média33,10, entrymax50,45.
Os spans novos já estão ativos; snapshot em Memory ainda era a janela
fechada anterior. Fallback4,260 CPU/tick/2,7calls/max33,97 contra planejado
0,376/1,9calls/max1,08. Spans inclusivos, não somar a move.native4,516.

Causa identificada: sem rota validada, fluxo normal pedia ao engine uma
busca até o destino final com moveMaxRooms64, mesmo após falha da busca
completa e durante seu backoff. Agora a rota do grafo de salas guia somente
o próximo hop, maxRooms2 e hopMaxOps; seu costCallback exclui terceira sala.
O goal é centro/range24 da próxima sala: exige entrar no interior, aceita
qualquer passagem conectada e evita escolher uma única saída arbitrária.
Opt-out realRoute:false preserva comportamento; validação completa mantém
orçamento/backoff e rotas validadas continuam como antes. Primeiro erro
mantém stall guard; falhas repetidas usam recuperação existente.

Reprodução falhou antes para próximo alvo/limite de salas e passa depois.
Smoke verifica também progresso para o hop seguinte, exclusão de terceira
sala, configuração de orçamento, segurança e recuperação sem blacklist da
origem própria. Não se mede ganho live em teste stub; CPU e travessia no
shard permanecem pendentes. Meta global abaixo de9 continua aberta.
# Pioneers parados com bucket baixo — ARK-116

Usuário observou parada após sincronização. Snapshot: seis pioneers sem
fadiga, sem _move e sem _realRoute; CPU em83627080: bucket667, limit20,
tickLimit500. Código retornava ERR_BUSY no gate de busca completa abaixo
de1000 antes de alcançar o fallback limitado ao próximo hop.

Correção: `allowUnplannedHop` nas viagens de ida/retorno do pioneer permite
adiar a busca completa por bucket baixo e continuar somente pelo hop
limitado. Mantém reserva/headroom de CPU do tick; sem rota segura de salas
retorna ERR_NO_PATH sem iniciar busca direta da viagem. Outros callers
mantêm a espera anterior (incluindo claimer). Nenhuma limpeza manual de
Memory nem remoção de restrições de trânsito.

Reprodução falhou antes e passa depois: bucket667/zero permite crossing
limitado sem realSearch; falta de headroom espera; sem rota segura não
move; testes de claimer e trânsito continuam verdes. Movimento real e
redução de CPU aguardam confirmação no shard após sincronização.

# Trabalho de rota durante fadiga — ARK-116

Retomada confirmada pelo usuário. Em83627212, bucket435/limit20, janela
fechada60 at83627195: total21,983, pioneer4,119/6calls, fallback1,044/6calls
(max2,101), move.native0,910. Nenhum realSearch nessa janela. Trecho atual
16ticks: total17,25, pioneer3,769, fallback1,014. Movimento nativo caro foi
contido; não atribuir todos os custos remanescentes a PathFinder.

Snapshot seguinte: pioneers em E2N45/E5N42 com fadiga32/22. moveToRoom
executava findRoute e preparação antes de o engine retornar ERR_TIRED.
Agora viagens optadas em allowUnplannedHop retornam antes desse trabalho
durante fadiga; estado de progresso/recuo permanece intacto. Restrições
novas são verificadas antes de mover no primeiro tick sem fadiga. Não é
um corte adicional da busca nativa durante fadiga: o engine já a evitava.

Reprodução falha antes e passa depois: zero graph/native/full searches
durante fadiga, retorno ERR_TIRED, Memory preservada, nova restrição de
trânsito impede retomada e remoção permite hop limitado. Smoke verde.
Span routing.graphSearch mede exclusivamente Game.map.findRoute, inclusive
quando chamado por diagnóstico/outros roles. Ganho de CPU no shard ainda
não medido; não somar spans filhos ao total do role ou módulo.

# Cache da sequência de salas — ARK-116

Saída live em83627277/bucket299: janela parcial10ticks29,71 incluindo
entry5,824/max57,66. graphSearch1,800/3calls e fallback1,400/3calls;
pioneer3,995. Janela fechada at83627255 used17,094 ainda sem graphSearch,
anterior à instrumentação. Não interpretar29,71 como nova média estável.

findRoute recalculava a sequência de salas em cada tick apto a movimento,
mesmo com origem/destino/política inalterados. Agora viagens optadas em
allowUnplannedHop reutilizam sequência no heap por50ticks, até128entradas.
Chave inclui origem/destino/avoid/policies/penalties; custos das salas que
o engine consultou e das salas retornadas são reavaliados antes do reuso.
Isso preserva invalidação por hostis, donos, bans e dead-ends. Falhas não
são cacheadas; allowRoom dinâmico não usa cache; retornos são cópias.

Reprodução falha antes/passou depois:21buscas→1, novo hostil invalida,
reabertura/TTL/mudança de origem/avoid/dead-end novo e expirado/penalties
forçam busca; callback dinâmico continua consultado. Teste independente de
ausência de rota usa destino distinto do cache anterior; smoke completo
passa. Nenhum ganho total de CPU afirmado sem janela live após sync.

# Pós-cache de salas e atribuição do hauler — ARK-116

Live at83627372/bucket423: trecho atual41ticks used17,41, entry1,404
(max55,15), graphSearch0,150/0,2calls, fallback0,900/2,6calls, pioneer2,169.
Snapshot60 at83627323 used17,298 contém graphSearch1,337/2,567calls:
mistura ticks anteriores ao cache, não representa janela pós-deploy pura.
Frequência baixa da busca no trecho atual confirma reuso em jogo; variações
de atividade/picos impedem atribuir toda mudança de CPU ao cache.

Hauler2,992/6calls agora maior role; pickMineralJob0,530, stockPolicy0,287,
terminalFuel0,245. Código já reaproveita previsão dentro da seleção e tem
noMineralJob por sala/tick. Não adicionar cache entre decisões mutáveis.
Instrumentação nova mede cover, terminalJob, pickDeliver e runMineralJob,
mantendo retornos/prioridades/intents. Smoke de delivery valida cada fase
uma vez e suíte inteira passa. Nenhuma otimização de comportamento nesta
rodada; próxima correção depende da atribuição em nova janela live.

# Seleção da entrega já adjacente — ARK-116

Janela60 fechada at83627489/used17,833/bucket434: hauler3,150,
pickDeliver0,637/2,883calls, cover0,034, terminalJob0,020, execução de
mineral job0,130. graphSearch segue0,119/0,15calls; pioneer2,111.

Seleção de produção chamava findClosestByPath em todo tick de entrega,
inclusive com spawn/extension elegível já em range de transferência ou
lista vazia. Agora filtra necessidade/segurança/reservas antes, entrega
para um candidato adjacente sem busca e só chama seleção por caminho
quando há candidatos distantes. Mesma prioridade de produção sobre torre;
escolha dentro da faixa adjacente usa a ordem dos candidatos existentes.

Reprodução antes/depois:1busca→0 para spawn adjacente, entrega no mesmo
tick; caso distante conserva busca e prioridade. Smoke completo passa.
Ganho real depende da frequência de adjacência; não prometer economizar
todo0,637 (o span também inclui filtros, reservas e outras faixas).

# Forecast duplicado na entrega mineral de energia — ARK-116

Janela60 at83628440 used17,178/bucket637, sem entry de reset (avg0,055).
Hauler3,566, execução de mineral job1,300/2,6calls, pickDeliver0,119/1,433
calls. Queda de seleção não é isolada: frequência/atividade mudou. Craft
também aumentou com3policies/4chains; terminal2,362/sell:atTerminal1,327
continua candidato para futuras rodadas. cpuTop parcial1tick não é baseline.

runMineralJob fazia fuel.keep duas vezes na mesma entrega stockPolicy de
energia ao terminal: decisão do desvio para storage e amount. Agora calcula
uma vez nessa execução. Não há cache entre execuções, para respeitar
saldo/reserva alterados dentro do mesmo tick. Outros tipos de job não
passam a calcular a reserva.

Reprodução falha antes/passou depois:2forecasts→1, mesma entrega50; nova
reserva100/saldo60 no mesmo tick limita40; reserva30 redireciona50 para
storage. Smoke completo verde. Redução real de CPU ainda não medida;
somente uma parcela de runMineralJob contém essa entrega energética.

# Visão longitudinal e compartilhamento de frete — ARK-116

Usuário trouxe gráficos30min19:05–19:30: total sustentado~15–17,
população quase constante; hauler3,67, pioneer1,71, terminal operations1,99
e craft.chains1,90. Prioridade revisada para trabalho recorrente e comparação
longitudinal. Spans inclusivos empilhados e máximos por módulo em ticks
diferentes não representam uma soma de CPU exclusiva do tick.

No terminal, sell:atTerminal1,29 é custo sustentado. scoredOrders calculava
frete por ordem mesmo com mesma origem/destino/quantidade. Cache local da
seleção compartilha apenas esse valor exato; preços, quantidades, limites,
cap de taxa e ranking permanecem avaliados por ordem. Nada persiste entre
seleções/ticks. Não alterar cadência nem introduzir preço/volume obsoleto.

Reprodução falhou antes/passou depois:100ordens elegíveis→1cálculo de
frete; quantidade diferente→2; custo diferente na próxima seleção é visto.
Ranking efetivo conserva preferência sobre preço bruto; smoke completo
passa. Spans orderBook e scoreOrders separam consulta e avaliação para
próximo diagnóstico. Impacto live não medido; comparar período~10min com
atividade de vendas e população semelhantes, sem atribuir toda1,29 ao frete.

# Cotação swing consultava livro completo — ARK-116

Usuário após13min trouxe gráficos15min: última janela15,7, média temporal
terminal operations1,69/sell:atTerminal0,976; hauler3,58/pioneer2,10.
Trecho cpuTop19ticks17,49: sell:atTerminal1,621, scoredOrders0,009,
orderBook0,212. Dados não isolam ganho do cache de frete e mostram que a
seleção comum instrumentada é apenas parte do caminho de venda.

candidateOrders com policy swing chama swing.quote, que usava book.all para
cotar um único recurso/lado. Esse caminho não passava pelos novos spans.
Agora matching consulta getAllOrders({type,resourceType}) quando não há
snapshot completo do tick, ou filtra/reutiliza o snapshot já carregado.
Caches só no tick, separados por lado/recurso, reset/fonte/tick invalidam.
Mercado/flip mantêm all, options.orders explícito continua prioritário.
Sem alteração da cadência ou das regras econômicas.

Testes: uma consulta filtrada por recurso/lado/tick; all anterior reaproveitado;
reset e troca de fonte invalidam; cotação real de energia mantém quantidade
62501/net50000 e preço por energia líquida. Smoke completo passa.
Novos spans swingQuote/bookFiltered/bookAll permitem atribuir o restante.
Ganho no shard não medido; sem alegação de economia de todo1,621.

# Pós-livro filtrado e atividade dos labs — ARK-116

Após15min: gráfico terminal operations média1,49 versus1,69 anterior,
sell:atTerminal0,921 versus0,976. Trecho37ticks used16,51: sell0,353/0,3
calls versus1,621/0,3 antes; swingQuote0,202, bookFiltered0,029. Mudanças
de atividade impedem atribuir toda variação ao código. Craft.chains continua
média1,90; resolve0,761/3calls e assignments0,513 no trecho atual.

Resolve chamava isActive por lab por tick. Engine isActive chama
checkStructureAgainstController, que percorre objetos da sala para rank
do mesmo tipo/proprietário e limiteRCL. Fonte:
https://github.com/screeps/engine/blob/master/src/game/structures.js
https://github.com/screeps/engine/blob/master/src/utils.js

Cache de atividade no heap somente com contexto de controlador próprio
completo: assinatura id/RCL/posição/proprietário + labs id/posição/dono,
métodos isActive, rollback de tick. Limite craft.policyActiveCacheEntries64.
Contexto incompleto chama diretamente. Boost reservations e cargas manuais
continuam filtradas ao vivo; nenhum estoque/cooldown/intents é cacheado.

Reprodução antes/depois63checks→3 em21ticks/3labs; RCL/método/objeto ausente
invalidam; boost e load manual têm efeito no mesmo tick; loadAuto não
reserva lab. Smoke completo passa, ganho live ainda pendente. assignments
permanece sem mudança para manter uma otimização por rodada.

# Perfil repetido dentro de assignments — ARK-116

Gráficos15min21:00–21:14: craft.chains1,20 versus1,90 anterior, assignments
0,475, hauler3,21. Pioneer população6→2 e média1,07 impedem atribuir toda
queda total ao crafting. Trecho atual1tick: resolve0,154/3calls versus
0,761/3 anteriores; sinal compatível com cache ativo, não baseline global.

Assignments chamava profile(room) por lab para buffer/refillRatio e nas
transições para bandwidth. Profile monta objeto e deriva oito configurações.
Agora snapshot lazy local por chamada. Bandwidth usa movimento/samples,
que não são mutados nesse loop; switchTicks/samples alteram delay, que a
função não consome. Próxima chamada observa dados/config novos.
Estoques, cooldowns, demanda, bindings, pares e intents continuam dinâmicos.

Teste integrado de cadeia multietapas falha antes/passou depois: leituras de
policyBuffer indicam no máximo1profile por execução de assignments. Produção
final exata, heap reset, confirmação e transições continuam no smoke verde.
Ganho live em assignments ainda não medido; não atribuir todo0,475 ao perfil.

# Fontes minerais sem saldo — ARK-116

Janela60 at83630308: used14,535/bucket3141, hauler3,632, pickMineralJob1,232,
pickLoad0,923; assignments0,523. Não há ganho isolado confirmado do perfil
local anterior. População mudou (miner9,783/pioneer1/reserver1), comparar
longitudinalmente. Hipótese de dono mineral exclusivo foi descartada:
nonEnergyLogistics permite vários haulers desde0111, cap default0.

consumerAvailable varria operações e ordens para calcular disponibilidade
mesmo quando fonte storage/terminal vazia. Saldo físico menos withdrawals
pendentes é limite superior; reservas só podem reduzi-lo. Retornar zero
se esse limite já não é positivo evita varreduras sem alterar seleção,
prioridades ou segurança. Não cachear resultado entre chamadas.

Regressão antes/depois: duas fontes vazias2scans de operações/ordens→0;
chegada de6 no mesmo tick respeita venda reservada4 (disponível2); pendentes
esgotando fonte pulamscan; próximo tick reseta withdrawal ledger e permite
saldo disponível2. Smoke completo verde. Frequência real de fontes vazias
e ganho de CPU ainda pendentes.

# Cascata mineral repetia seletores — ARK-116

Usuário esclareceu que plan2,906/max23,116 na janela at83630553 veio da
conquista de sala nova. Tratar como custo transitório; não alterar architect
com base nessa janela. Hauler continua próximo alvo recorrente.

pickMineralJobNow executava chain feed primeiro e, depois de null, repetia
labReagent/labOutput/factoryComponent/factoryOutput/transientDrain na cascata
geral. Uma busca fresh sem job já tinha avaliado todos esses seletores.
Agora mantém Set local dos seletores recém-consultados, reutilizando apenas
suas respostas negativas dentro dessa decisão. Cache negativo anterior de
chain não preenche Set: fallback continua rechecando estado atualizado.
Não reutiliza job positivo entre haulers nem reduz frequência de seleção.

Regressão falha antes/passou depois:6reações sem estoque consultavam fontes
8vezes→4 na seleção combinada. Consulta anterior de chain em mesmo tick,
seguida de estoque disponível, ainda retorna labReagent no fallback.
Smoke completo passa. Ganho live depende de quantas seleções percorrem
fallback completo; nenhuma economia de todo pickMineralJob é prometida.

# Erro de gravação de segmentos — ARK-116

## Cotação de compra mineral — janela22:00–22:15

### Próxima janela — margem bruta na cotação

At83631129/60ticks:23,126CPU/tick, limit20, bucket2324 no probe83631185.
Pioneer4,814/7calls; realSearch1,010 e moveFallback1,367 (inclui native1,281).
Sobra custo do role não atribuído a esses spans; solicitado probe de estados.
SwingTrade1,893, market1,122 e terminalOps1,469. Corte anterior de minerais
não demonstrou ganho global e não reduz busca líquida em compras de energia.
Agora quote rejeita compra bruta>=teto e venda bruta<=piso antes do frete,
pois o custo efetivo só piora o bruto. Testes falham antes/passam depois:
100compras energia1700→0cálculos,100vendas100→0; candidato misto/ganho líquido
preservados. Smoke completo verde; nenhuma previsão de queda total garantida.

Probe7pioneers: três em home (E1N45/E1N47/E5N41) com0/795/0energia,
dois fatigados em trânsito e dois W7N49 com caminho. Home seleciona
findClosestByPath a cada tick, fora dos spans de viagem; suspeita ainda
sem atribuição live. Adicionados pioneer.pickLoad e pioneer.travel para
separar seleção em casa do fluxo completo de routing, sem alterar decisões.

Janela22:30–22:45: bucket2386→1792; pioneer4,45/6,86calls, travel4,97
em apenas uma amostra (Mean=Max). Busca real0,820 e native1,37 no gráfico
têm períodos distintos desse novo span; não subtrair como custo exato.
Adicionados graphRoute (seleção e validação do cache) e clearance (próximo
passo/liberação) para localizar trabalho não atribuído, sem outro corte
funcional. Aguardando janela completa após esses spans.

Resposta at83631390/60ticks usada17,412; probe83631433/bucket1756.
Pioneer4,009/7calls, travel3,829/5, pickLoad0,050/2: descarta seleção
de recarga como foco nesta janela. Fallback1,406/3,017, planejado0,127/0,45,
realSearch0,693/0,083; grafo engine0,042/0,05. Restante do fluxo ainda
sem atribuição antes dos spans graphRoute/clearance. Mercado0,104 e
terminal0,988; swingTrade ausente nesta janela, logo não atribuir ganho
ao prefiltro anterior. Média abaixo20 permite recuperação nesta janela,
mas não demonstra tendência sustentável nem meta<9.

## Pacote único após at83631501

Janela60:23,497CPU/tick, pioneer5,613, travel5,476, graphRoute1,156,
graphSearch0,164, realSearch1,740. Entry0,926/max51,426 evidencia custo
de inicialização; usuário pediu consolidar mudanças e sincronizar só ao fim.

1. Validação do grafo: snapshots escalares das entradas de política de
todas as salas observadas, aliados/username na chave; callbacks completos
para Source Keepers/dinâmicos. Reprodução40→0avaliações completas após
rota estável. Hostis, owner, aliados, visibilidade, reserva e dead end/TTL
invalidam reuso, inclusive alterações no mesmo tick.
2. PlanningGate allowUnplannedHop usa min(limit,tickLimit) menos reserva,
evitando autorizar busca completa só porque há500CPU de burst. Gate de
CPU/slot ocupado adia planejamento mas deixa hop autorizado avançar se
há headroom duro. Testes: usado14/limit20/tickLimit500 move sem search;
usado5 permite search limitado; segundo traveler avança sem novo search;
usado497 adia tudo; callers legados mantêm orçamento anterior.
3. Quote compartilha frete exato por destino/quantidade só na seleção.
100ordens energia mesmo destino1800→17cálculos, preço/quantidade idênticos;
seleção seguinte fresca, destinos distintos mantêm custos próprios.

Smoke completo verde. Uma única sincronização ao final. Não extrapolar
esses contadores para CPU live; primeira janela após deploy é aquecimento,
comparar janelas completas seguintes e tendência longa de bucket.

Gráfico longitudinal: swingTrade0,783CPU/tick e pico39,1; hauler3,20,
pioneers1→5 e miner8→9 impedem atribuir mudança total só ao código.
quote calculava frete em cada passo da busca de quantidade, embora
para mineral o ganho fosse sempre mid. Agora usa déficit inteiro direto,
consulta déficit uma vez na seleção e calcula frete final por ordem.
Energia preserva a busca pelo ganho líquido. Sem cache entre seleções.
Reprodução100ordens:1100→100cálculos de frete,100→1consultas; quantidade,
preço, déficit fracionário/satisfeito e mudança no mesmo tick verificados.
Smoke completo verde. Ganho na média/picos live ainda não medido.

Usuário reportou uma vez Cannot save more than10 memory segments on the
same tick. Probe at83630900: ids9/10..16 (8presentes),7planos alocados,
history loaded/version2/pages4/321076bytes/semerror. Save escreve pages0..2
e root9, somando11ids. activate limitava leituras, não os ids adicionados
pela gravação de história. Não relacionar o sintoma diretamente ao CPU.

Save agora confere união antes de escrever qualquer payload. Se excede10,
retorna false/error segment-write-budget e guarda ids de escrita no heap;
activeSegmentIds prioriza esses ids temporariamente. Collector já mantém
historyDirty e retenta antes da cadência. Root continua sendo gravado por
último só quando toda geração cabe; sucesso/reset limpam writeSegments.
Não trunca histórico nem apaga os planos para conseguir espaço.

Reprodução falha antes/passou depois. Integração de collector mantém nova
amostra pendente sem mudar root, ativação respeita10 e prioriza páginas,
save completa sem coleta extra, reset posterior mantém contagem e tick
original. Smoke completo verde. Corrige o caminho confirmado de histórico
com planos presentes; retomada de save e ausência de recorrência aguardam
probe após sincronização.

## Revisão de navegação multi-room — pacote único

ARK-116: bucket788 no gráfico23:05–23:08; pioneer.travel4,77, graphRoute1,14,
realSearch0,877 e native1,99. Revisão de arquitetura remove validação completa
dos pioneers e centraliza travelToRoom para todos os roles de trânsito.
Claim mantém upfront validation; remotes/hostis/Keepers e formação tática
preservados. Cache verifica sequência escolhida, path vive1500ticks com
recovery/stall. Smoke reproduz expiração após25ticks de fadiga, avanço por
hop sem realSearch, ban novo, recuo, mudança de destino e bucket100.
Ganho live e meta<9 permanecem pendentes.

Engine: https://github.com/screeps/engine/blob/master/src/game/creeps.js
moveTo expira _move.time + reusePath em ticks decorridos; fadiga não
renova essa janela. Antes20ticks, agora prazo central1500; sala/destino
e falta de progresso continuam invalidando. Política incremental elimina
a segunda validação da viagem inteira e mantém busca limitada ao par de salas.
