# Diagnóstico e plano de otimização de CPU — ARK-128

Data: 2026-10-15. Estado: **diagnóstico e planejamento; implementação futura**.
Issue: [ARK-128](https://linear.app/arkemenes/issue/ARK-128/investigar-e-reduzir-regressao-de-cpu-apos-coordenacao-de-terminal-e), In Progress.

## 1. Contrato desta entrega

O usuário pediu uma varredura ampla, propostas, riscos e um handoff para outro agente.
Nenhuma correção de produção, alteração de configuração do bot ou deploy foi feita
nesta etapa. Os arquivos novos são documentação e ferramentas de diagnóstico.
Não executar `grunt` para ler este relatório: o build também publica no cliente.
Preservar o staging existente; há arquivos `M` e `MM` anteriores a esta etapa.

Meta vigente: **CPU efetivamente cobrada <15/tick, idealmente <10**, com expansão
de 3 salas industriais para 5 e potencialmente 10, labs 3/7/10 e mais ordens.
A meta vale com produção, logística, defesa, custos e progresso preservados.
Uma queda de CPU provocada por menos produção, menos GCL, salas paradas ou perda
de oportunidades não constitui sucesso equivalente.

Bundle local auditado, sem reconstrução:
`19CD89F88164325AC3AF44A1E912B7DEF587EF2863E406C34589ACC8320A8BAB`.
`dist/main.js`: 1.533.000 bytes. A identificação no servidor ainda depende do
cliente/publicação; o hash local não é confirmação independente do servidor.

Fontes: código atual, grafo existente, constitution/architecture/roadmap, feature
0138, handoff anterior, medições fornecidas pelo usuário e reproduções offline.
Inventário dos **111 arquivos JavaScript em src/**, com hashes e localizações de
padrões, em [cpu-audit-offline-results.json](diagnostics/cpu-audit-offline-results.json).
Esse inventário é uma triagem estática, não prova que cada caminho foi executado.
A inspeção detalhada concentrou-se nos caminhos quentes e suas dependências;
roles ausentes do profile e situações de combate/expansão precisam de cenários próprios.

### Vocabulário de evidência

- **R — reproduzido:** execução do código atual em fixture com contadores.
- **C — confirmado por código:** fluxo/estrutura diretamente observável; ainda sem
  frequência/custo causal medidos na produção.
- **L — observado live:** tempo/contagem do log; pode ser custo inclusivo e ter overhead.
- **H — hipótese:** investigação necessária antes de implementar ou prometer ganho.

Não confundir uma repetição comprovada com a causa integral dos ~18 CPU/tick.
Os ganhos de candidatos abaixo não são aditivos: várias propostas atingem os
mesmos consumidores e spans aninhados.

## 2. Resposta à regressão aparente e ao pacote anterior

### O que foi alterado antes deste pedido de planejamento

1. `terminalClaims.physicalPool`: soma storage+terminal usando uma análise de
   reservas dentro da mesma decisão. Aplicado em craftEnergy, startItem/factory
   e saleAvailable. Não é cache temporal de saldo. Probes anteriores reduziram
   duas análises a uma, preservando clamps de cada fonte e retiradas pendentes.
2. `market.sampleSummary` + `swingTrade.reference`: WeakMap por array canônico do
   histórico, contendo contagens e tick da última amostra válida por lado.
   Push/poda invalidam; hidratação troca o array; reset troca o WeakMap.
   O preço de referência, energia, configuração, prontidão e idade continuam
   avaliados em cada consulta. **O preço não foi congelado entre ticks.**
3. Telemetria/exporter/Grafana teve pacote separado; usuário confirmou os gráficos
   novos e a aplicação externa. Isso não comprova CPU menor. ARK-130 está concluída.

A repetição do histórico ocorria tanto no mesmo tick como em ticks diferentes
enquanto as amostras continuavam iguais. Reutilizar o resumo desses mesmos dados
é válido; consultar preço/idade/estoque atual continua necessário. O teste anterior
contou 20.000 leituras históricas em 100 consultas contra 400 na primeira bateria
com cache e zero em baterias aquecidas. Isso comprova trabalho eliminado naquele
caso, **não uma redução medida do total Screeps**.

### Por que o gráfico chegou a ~197 e depois caiu em degraus

`cpuAccounting` mantém uma média móvel de até 600 intervalos válidos, começando
com denominador pequeno após reset. `stats` publica esse escalar; exporter e
Grafana observam publicações em momentos próprios. O ponto pode permanecer
desenhado até a próxima coleta. A média da legenda do Grafana é uma média dos
pontos amostrados dessa média móvel, não a soma de débitos dividida pelos ticks
reais do período inteiro.

Reprodução com o **cpuAccounting real**, entrada hipotética de 197 CPU no primeiro
intervalo e 17 nos seguintes:

| Intervalos acumulados | Média cobrada |
|---:|---:|
| 1 | 197,000 |
| 7 | 42,714 |
| 14 | 29,857 |
| 26 | 23,923 |

Esse mecanismo reproduz a forma de diluição. **Não reconstrói os ticks do print**
nem identifica a origem do pico. As linhas de script (~195) e cobrança (~197)
sobem juntas: não é explicável somente pelo residual pós-script. Candidatos são
carga inicial do bundle, hidratação, scans frios, catálogo e outras rotinas caras;
o log correspondente ao tick do pico não foi preservado nesta coleta.

O profile foi iniciado depois do pico mostrado. Ele não pode explicar
retroativamente aquele pico, mas acrescenta custo à sua própria janela posterior.
O heap alocado subir/descer também não prova vazamento nem identifica sozinho GC.

## 3. Baseline e limites das medições

### Balanços pareados fornecidos

| Contexto | Intervalos Game.time | N | Cobrada | Script pareado | Residual |
|---|---|---:|---:|---:|---:|
| Referência antiga aquecida | 83663992..83664591 | 600 | 17,702 | 15,136 | 2,565 |
| Pacote físico, primeira janela | 83664601..83664659 | 59 | 22,136 | 19,895 | 2,241 |
| Mesmo pacote, acumulado | 83664601..83664898 | 298 | 17,849 | 15,544 | 2,305 |
| Pacote do resumo histórico, antes do profile | 83665086..83665197 | 112 | 21,196 | 18,919 | 2,277 |
| Durante profile(100) | 83665208..83665307 | 100 | 20,220 | 17,763 | 2,457 |
| Após profile; coleta 13:20:33 | 83665309..83665462 | 154 | **17,961** | **15,620** | **2,341** |

Todas essas saídas informaram pareamento completo e nenhum intervalo inválido.
Diferenças de 0,001 entre somas podem vir do arredondamento. Janelas, carga e
população diferem: a tabela não é um experimento controlado antes/depois.
A coleta mais recente tem 154 intervalos, embora tenham sido pedidos 600.
É útil e já está fora da sessão de profile, mas ainda não fecha validação sustentada.
Os 156 ticks desde reset do medidor e 154 intervalos do balanço não são uma
contradição: reset/primeiro begin e pareamento no tick seguinte têm fronteiras próprias.

Por diferença das duas somas antigas com o mesmo início, sem eviction, os 239
intervalos 83664660..83664898 deram aproximadamente 16,791 cobrados/tick.
É uma derivação de valores arredondados, sem controle da mudança de workload.
Não usar isso para afirmar que o pacote posterior regrediu ou melhorou causalmente.

### Onde está o trabalho atual

Janela **parcial de 36 ticks**, 83665428..83665463, fora do profile:
script 15,93, guarded 15,18, unguarded 0,75. Não somar com o residual médio
de 154 intervalos para fabricar uma nova média pareada.

| Categoria/consumidor | CPU/tick | Chamadas/tick | Interpretação |
|---|---:|---:|---|
| creep | 9,638 | 36,5 | Inclui todos os roles abaixo |
| hauler | 4,693 | 12,0 | Maior frente recorrente |
| miner | 2,160 | 11,5 | Inclui intents e distribuição |
| builder | 1,536 | 5,0 | Inclui trabalho oportunista e principal |
| upgrader | 1,199 | 5,0 | Preservar progresso de GCL |
| structure | 1,030 | 47,0 | Tower 0,666; lab 0,179; link 0,070 |
| craftPlanner | 0,985 | 1,0 | chains 0,864; startItem 0,597 |
| intel | 0,870 | 6,1 | transitSafety 0,266 |
| terminalOps | 0,816 | 1,0 | operations 0,716; sell:listed 0,458 |
| swingTrade | 0,739 | 1,0 | Um pico de chamada 25,18 pesa nessa janela curta |
| spawn | 0,230 | 5,0 | Prioridade inferior aos consumidores anteriores |

Dentro de hauler: pickMineralJob 1,013; pickLoad 0,923; pickDeliver 0,604;
stockPolicy 0,570; terminalFuel 0,486; chainFeed 0,502. Esses spans podem ser
aninhados. `move.localSearch` soma 0,181/tick, 2,1 buscas/tick, **não é todo
o movimento**, mas não sustenta atribuir a maior parte do hauler a repath.
`labPolicy.assignments`: 0,290; resolve: 0,137; confirm: 0,070.
`craft.partialSales`: 0,038 nessa janela, portanto não lidera a prioridade atual.

Há 5 chamadas de spawn/room por tick, 19 labs e 3 salas industriais no contexto
do usuário. **3 industriais não significa 3 salas totais.** Não multiplicar
o total de CPU por 10/3 para prever expansão.

### O que o profile realmente demonstra

Arquivo original: [profile-2026-10-15-83665208.txt](diagnostics/profile-2026-10-15-83665208.txt).
Em 100 ticks solicitados: hauler.run 1.200 chamadas, 380,6 self e 533,9 total;
getIntel 610 chamadas, 138,8 self; Creep.move 679 chamadas, 133,3 self;
findClosestByPath 963 chamadas, 57,1 self/64,2 total; Room.find 6.027 chamadas,
20,8 self/21,5 total. **Não somar moveTo com seus moves filhos.**

O profiler registra roles/protótipos e algumas funções de sala. Utils chamadas
por elas aparecem no self do chamador quando não estão embrulhadas; funções
econômicas ausentes da tabela não têm custo zero. `recordCaller` captura stack
para cada Room.find; seu custo e a atualização das tabelas podem ser atribuídos
ao pai ou ficar fora da duração interna do método. O self não é uma medida pura
de lógica própria sem overhead. A tabela textual também é limitada em tamanho.

Defeitos de apresentação encontrados:

- `profiler.output`: `startTick = enabledTick + 1`, depois
  `elapsedTicks = endTick - startTick`. Para esta sessão resulta 98, embora a
  janela nominal seja 100. 1777,30/100 = 17,773, e não 18,14. Corrigir futuramente
  para contagem efetiva de endTick, incluindo sessões interrompidas/gaps.
- `cpuMeter.record.max` é o máximo de **uma chamada registrada**, não a soma
  de todas as chamadas de um módulo em um tick. Max de creep/structure/room
  não é automaticamente pico agregado por tick. Somar máximos de módulos
  diferentes ou empilhar spans aninhados não produz pico total do bot.
- `profile()` reseta o medidor no começo e no encerramento; snapshot publicado
  pode continuar exibindo a última janela anterior até outra fechar.

## 4. Achados e propostas priorizadas

### P0 — Medição confiável e contrato de equivalência

**Evidência C/L.** Fonte: `src/main.js` (profile/reset/guard),
`cpuAccounting.js`, `cpuMeter.js`, `profiler.js`, `stats.js`.

Proposta: corrigir contador do profiler; registrar identificação de janela,
reset e modo normal/profile nos resultados; distinguir max por chamada de max
agregado/tick quando este último for necessário. Novos contadores ficam no heap,
limitados e opcionais, publicados como resumo. Medir overhead separadamente.
Não introduzir JSON de amostras em Memory por tick.

**Risco baixo na decisão do jogo**, mas alto para conclusões se métricas erradas
forem misturadas. Critério: testes de 1/2/100 ticks, sessão interrompida, reset,
gaps, janelas completas/parciais, e débitos conhecidos. Nenhuma promessa de
economia por consertar apenas o rótulo/divisor.

### P1 — Índice por sala e tipo; eliminar varreduras globais por consumidor

**Evidência R/C/L.** `terminalIndex.js:all/forRoom`,
`terminalFuel.js:plan`, `terminalClaims.js:physicalReservations`,
`resourcePolicy.js:commitments`, consumidores hauler/craft/terminal.

O índice atual guarda IDs ativos, mas `all()` remapeia todos e refiltra estado
a cada chamada; `forRoom()` filtra o resultado global novamente. `terminalFuel`
nem usa esse índice: enumera todas as operações, incluindo finais antes do filtro.
`physicalReservations` ainda varre `Game.market.orders` global por consulta e
percorre cadeias/ops novamente para compor reservas. `carried(op)` visita haulers
por operação. `commitments` calcula compromissos de todos os recursos mesmo
quando o chamador quer apenas um.

Reprodução nova, sem alterar produção: [cpu-audit-offline.js](diagnostics/cpu-audit-offline.js).
27 cenários: salas 3/5/10 × consumidores/sala 3/7/10 × operações/sala 0/5/20.
Consumidores são consultas sintéticas, não labs reais nem taxa de negócios.

| Salas × consumidores × ops/sala | Consultas | Leituras globais fuel | Visitas a sourceRoom no índice aquecido |
|---|---:|---:|---:|
| 3 × 3 × 20 | 9 | 540 | 540 |
| 5 × 7 × 20 | 35 | 3.500 | 3.500 |
| 10 × 10 × 20 | 100 | 20.000 | 20.000 |

No extremo, índice frio enumera uma vez; índice aquecido enumera zero, **mas
continua com 20.000 visitas**. Fuel frio/aquecido/tick seguinte faz as mesmas
100 enumerações/20.000 leituras. Acrescentar 500 finais sobe fuel a 70.000;
5.000 finais, 520.000. O índice aquecido continua em 20.000. Essa separação
explica por que “uma enumeração” não prova trabalho constante por consumidor.

Direção de solução:

1. Construir membership por sala e, onde útil, recurso/kind/owner durante a
   mesma construção do índice. Compartilhar IDs/referências, não saldos finais.
2. Migrar fuel e os outros caminhos globais para candidatos locais, preservando
   a distinção sourceRoom/targetRoom e a regra de transferência enviada no tick.
3. Compartilhar, por decisão, listas de ordens próprias, carga por operação,
   estruturas pertencentes à cadeia e orçamento de combustível. Só depois
   considerar agregados reutilizados entre decisões, com revisão de mutações.
4. Para compras/vendas não recalcular commitments de todos os recursos se for
   possível produzir a mesma resposta para um único recurso em menos trabalho.

**Risco médio para membership; alto para cache de quantidades.** Estado, loaded,
remaining, pendingDeal, fees, owner, job de hauler e retiradas mudam intratick.
Não basta `Game.time` nem `nextId` para um cache de saldo. Construção de chave
que revarre todos esses dados por chamada apenas desloca o custo.

Aceitação: consultas aquecidas visitam somente candidatos da sala; histórico
final não multiplica o custo por consumidor; mutações intratick mantêm a resposta
da implementação de referência. Incluir receipts, transfer source/target, manual
orders, exclusions, owners migrados, frete de energia, cancelamentos e GC.

### P2 — Hauler: separar catálogo de candidatos da escolha e da reserva

**Evidência C/L.** `roles/hauler.js:pickLoadNow/pickMineralJobNow/stockPolicyJob/
pickDeliverNow`, `nonEnergyLogistics`, `reservations`, `transientStock`.

Um hauler em load calcula fonte de energia antes de escolher loot, pressão ou
chain feed. Um mineralJob ainda vazio também passa por pickLoad para verificar
preempção por bigDrop. A cascata consulta fuel, claims, destinos e reservas.
Há cache de alvo de carga por 5 ticks e cache negativo por sala/tick; não foram
ignorados na análise. Casos com quantidade explícita, como terminal, não reutilizam
o alvo, corretamente, para não congelar a quantidade disponível.

Proposta em duas partes:

- Primeiro compartilhar dados estruturais e orçamento **dentro da decisão**;
  candidatos comuns à sala preparados uma vez, competição/quantidade reavaliadas
  para cada creep. Pré-classificar estruturas por função, evitar scans de todos
  os recursos quando uma decisão já provou um destino impossível.
- Depois medir se decompor a consulta de bigDrop da consulta completa de energia
  evita trabalho descartado. Preservar exatamente a ordem final da cascata e seus
  efeitos: energia pode preemptar tarefas vazias, mas não carga em trânsito.

**Risco médio/alto.** “Há algum job” depende de claim intratick e da regra de deixar
um hauler para energia. Cache negativo sem revisão pode esconder uma liberação;
cache positivo pode duplicar atribuição. Mudança da ordem pode causar starvation
de spawn, retirar recurso de uma cadeia ou perder loot que expira.

Aceitação: comparar sequências de destinos, recursos, quantidades, claims e
intents por creep na mesma ordem de execução; dois haulers competindo, pressão,
bigDrop, ausência de energia, job carregado, morte e destino destruído. Contar
consultas descartadas antes de introduzir execução preguiçosa.

### P3 — Calls de ação duplicadas e trabalho oportunista

**Evidência R/C.** `prototypes/creep.js:runGetEnergy` chama harvest no ramo “já
está perto de Source” e volta a chamar no despacho final para Source. Fixture
com Source próximo e retorno OK: **2 harvest na mesma invocação**. Não sabemos
quantos desses casos ocorrem hoje; miners próprios usam outro caminho principal.

`roles/builder.js:run` executa opportunisticWork antes de invokeState. Fixture
com construção em alcance e estado Build apontando para o mesmo site, usando
`runBuild` real: **2 build e 2 creditBuild no mesmo run**. `energyLedger.record`
acumula por chamada, sem deduplicação de creep/intent. Isso abre também uma
questão de correção da telemetria de gasto, não apenas desempenho.

Proposta: um despacho de ação por decisão lógica; no builder, coordenar o
trabalho oportunista com a ação principal e creditar somente o intent efetivo
que se pretende executar. Preservar movimento junto do trabalho em alcance.
Não remover indiscriminadamente opportunisticWork: ele protege reparos críticos
durante deslocamento. Não supor que duas chamadas OK são duas produções confirmadas.

**Risco baixo/médio para remover a duplicata idêntica de harvest; médio/alto para
o builder.** Diferentes alvos e combinações repair/build precisam de reprodução
do desempate de intents e da prioridade atualmente efetiva. O reprodutor conta
chamadas; não emula resolução de intents do motor. Validar no harness com intents
deferidos e só depois medir frequência/custo live. Ganho não é os 0,581 inteiros
de builder.opportunistic: há trabalho útil e seleção dentro desse span.

### P4 — Mercado: compartilhar avaliações sem congelar mercado ou reservas

**Evidência C/L.** `swingTrade.quote`, `terminalOps.candidateOrders/listResidual`,
`craftPurchaseBook`, `orderBook`, `marketPricing`.

`orderBook` já compartilha fetch completo e filtrado por tick; `market.groupOrders`
e `marketPricing.stats` já têm caches. `swing.reference` já recebeu o resumo
histórico. Não implementar essas otimizações pela segunda vez.

Ainda existem loops por ordem/candidato e cálculo de frete repetidos entre
decisões. `swingTrade.quote` cacheia frete dentro da chamada e ordena matches
inteiros para usar só o primeiro. Listings verificam estoque/extensão e compras
podem trocar uma listing por deal antes do gate de reprice.

Propostas: seleção do melhor candidato em uma passagem quando o contrato usa
somente o melhor, preservando ordem em empates; compartilhar primitivas de frete
pela tupla exata de quantidade/origem/destino/efeitos relevantes, inicialmente
no mesmo contexto de decisão; separar geometria/candidatos do cálculo vivo de
preço líquido, créditos e quantidades. Se avaliação for retomada depois, revalidar
livro, reserva e preço antes de aceitar qualquer intent.

**Risco médio/alto.** Não mover o gate de reprice acima de extensão, reposição,
confirmação ou oportunidades de deal sem mudar o contrato. Não usar preço bruto
como ranking final: frete, energia líquida, taxas já pagas e teto de custo importam.
Não atrasar compra de energia urgente para cumprir um orçamento de scans opcionais.

Medir: bookAll/bookFiltered por tick e por consumidor, nº de ordens examinadas,
quotes iguais, chamadas/tuplas distintas de frete, razão de descarte, falhas e
mudanças no mesmo tick. Pico swing 25,18 observado, atribuição interna ainda aberta.

### P5 — Labs: geometria estática, atribuição dinâmica

**Evidência C/L; experimento anterior limitado.** `labPolicyRuntime:assignments/
bindings/activeLabs/resolve`, `labPolicy:recipeMap/planFor`, `labPlanModel:trios`.

Geometria e bindings já são cacheados. A cada decisão ainda se filtram consumers,
contam roles repetidamente, ordenam pares por estoque e constroem mapas/observação
para Memory. `profile(room)` é chamado em tick e pode ser recalculado localmente
por assignments. `recipeMap()` reatribui cooldown de todos os produtos em cada
chamada; assinaturas e serializações para validar caches também têm custo.

Proposta: perfil local passado explicitamente; mapas de consumidores/contagens
por produto por fase; leitura de estoques em vetores uma vez por decisão;
seleção de melhor par com o mesmo desempate; atualizar contagens quando reassign
altera desired. Separar topologia e material dinâmico. Evitar reescrever mapas
persistidos idênticos onde a identidade não for parte do contrato.

**Risco médio/alto.** Quantidade em labs, cooldown, intents pendentes, boost
reservations, manual pins, efeitos, fase, quota e reassignment não podem ficar
obsoletos. Manter confirmação do tick anterior e disponibilidade antes de cada
runReaction. Não pular a política enquanto labs trabalham para economizar CPU.

Experimento anterior sort→seleção linear: 100 decisões com 3 labs fizeram
900→1.100 leituras (pior), 7 labs 6.800→3.600, 10 labs 10.100→5.300.
Não aplicado. Precisa pré-computação adequada ou estratégia por tamanho comprovada,
e testes completos de equivalência. O custo atual assignments é 0,290/tick no
recorte recente; a otimização deve ter overhead menor também com 3 labs.

### P6 — Planner e picos frios: orçamento global e progresso justo

**Evidência C/L/H.** `craftPlanner:scan/scanRoom/sizeLot`, `marketPricing.evaluate`,
`labPolicy:request/candidates/poll`, `labPolicyData`, `labSlots`.

Craft scan percorre salas/produtos e possíveis redimensionamentos num único
tick; depois revalida candidatos ao abrir. A política já tem generators e um
budget global de trabalho/CPU em poll. Esse budget **não cobre automaticamente**
todo request/candidates/assinatura/planejamento ao redor. A ordem fixa de polling
pode dar o orçamento disponível primeiro à mesma cadeia; starvation live não
foi demonstrada. `cpuStart` compartilhado também inclui tempo transcorrido entre
polls, que deve ser distinguido do tempo efetivamente gasto nos generators.

Proposta: medir limites de cada trecho; tornar a exploração opcional incremental
por sala/produto/candidato, com cursor e rotação justa; manter um budget global
do império, não “1 CPU por sala” que vira 10 CPU. Preservar snapshot coerente na
avaliação e revalidar preço/estoque/reservas ao commit. Um gerador não fornece
preempção se cada `.next()` ainda pode executar trabalho excessivo antes de yield.

O catálogo `labPolicyData.js` tem 572.105 bytes (~37% dos bytes do bundle), e
`labPolicy` monta índice de rows no carregamento. Isso torna startup um candidato
mensurável, **não prova que explica 197 CPU**. Avaliar indexação gerada offline,
deduplicação estrutural exata e carga por necessidade. Em bundle único, apenas
mover um require pode não evitar parse/compile de todo o arquivo. Não remover
estratégias nem alterar vencedor para reduzir tamanho sem aprovação de comportamento.

**Risco alto:** latência de abertura/replan, expiração, vencedores e equidade.
Critérios: todos os jobs fazem progresso; nenhuma cadeia para de confirmar intents;
fallback tem prazo; memórias de curso sobrevivem reset de forma definida; custo
por tick limitado inclusive no request e no cenário frio de 10 salas.

### P7 — Serialização: distinguir Memory, segmentos e alocações no heap

**Evidência R/C/L/H.** `memory.wrap`, `stats`, `marketHistoryStore`, `planStore`,
`labPolicyRuntime` e `craftLedger`.

Residual recente: 2,341/tick, sem atribuição exclusiva. `RawMemory._parsed` deixa
fechamento fora de endTick; residual também pode incluir wrappers finais,
publicação do medidor, GC e outros custos não observados. O probe antigo de
638.174 caracteres/3,540 CPU de stringify não vale automaticamente para os
~284 KiB atuais. Não afirmar “os 2,341 são serialização”.

Há serialização **dentro do script** em `marketHistoryStore.save`: compactPages
serializa cada tuple para estimar tamanho, e depois serializa páginas completas.
O limite de segmentos escritos é verificado após compactar. Reprodução com
10.000 amostras e conflito sintético de segmentos: **10.103 stringify por tentativa**,
mesmo retornando `segment-write-budget`; repetir 3 vezes repete todo esse trabalho.
O fixture mantém a contenção artificialmente: não prova que produção falha três
ticks, pois activeSegmentIds tenta liberar o orçamento na execução real.

Propostas em ordem:

1. Medir bytes por raiz de Memory, páginas/erros do histórico, trabalho de
   compactação e frequência de save/load; confirmar onde está o volume atual.
2. Reter serialização preparada no heap por versão do histórico/configuração
   durante retry de escrita; retentar I/O sem remontar payload inalterado.
   Considerar páginas sujas/incrementais somente mantendo formato, ordenação,
   precisão de preços/ticks e publicação coerente de generation/root por último.
3. Remover duplicação **derivada** de Memory ou movê-la ao heap somente após
   identificar leitores e requisito de recuperação/observabilidade. Arrays de
   rotas `_m.path` são candidatos, mas perda no reset pode criar uma tempestade
   de repaths. A experiência deve medir startup e operação normal juntos.
4. Reduzir temporários e escritas idênticas em assignments/observações. Isso
   pode reduzir alocação/GC; se o JSON final tem o mesmo tamanho, não comprova
   redução do custo de serializar Memory inteira.

**Risco alto em persistência; médio em temporários locais.** Não apagar accounting,
seenIncoming, receipts dependentes, histórico necessário ao preço ou estado de
confirmação. Não afinar amostras históricas nem diminuir retenção útil para atingir
a meta. Guardar amostras/caches em Memory para “otimizar” pode piorar o residual.

### P8 — Ledger: leituras locais e fases de reconciliação

**Evidência C.** `craftLedger:tick/sync/warehouse`, `craftPlanner.tick`, `main.loop`.
A manutenção tick é chamada pelo planner e novamente no main antes dos creeps.
`warehouse` invoca sync, reconstrói IDs de estruturas da cadeia e percorre seus
labs/factory a cada recurso consultado. A correção anterior já eliminou escritas
sem delta; ainda há leituras/reduções.

Proposta: medir quantas reconciliações realmente trazem mudanças em cada fase;
compartilhar membership de estruturas e lista de tradeIds por decisão; usar
versão das mutações econômicas para sincronizar quando necessário. Não remover
simplesmente a segunda chamada: entre elas swing/craft podem criar ou alterar
operações. Separar migração estrutural rara da reconciliação de eventos vivos.

**Risco alto para estoque/custo; prioridade condicionada ao contador.** O módulo
craftLedger 0,067 não inclui todas as chamadas dentro de claims/craft/haulers.
Aceitação: custo, fee, confiança, produção, empréstimo para energia crítica e
recebimentos mudando intratick têm os mesmos resultados; nenhuma confirmação dupla.

### P9 — Intel, segurança e scans redundantes

**Evidência C/L.** `rooms/intel`, `transitSafety`, `keeperTransit`, `hostiles`,
`roomCache`, `census`, `reservations`, `miner`, `pioneer`, `remoteHauler`.

TransitSafety percorre getEventLog para aprender agressão de aliados e mantém
conhecimento do tick anterior para creeps mortos. Não desligar essa feature.
Investigar pré-filtro barato de evento e reuso do log por sala/tick, evitando
parse/trabalho quando não há eventos relevantes; o caso de aliado que matou
o creep e desapareceu não pode depender apenas dos hostiles atuais.
Policy keys de trânsito montam/sortem listas e JSON repetidamente; cache de
conjunto derivado exige invalidação por configuração, agressão nova e expiração.

Há acessos fora do census/cache: rebuild de carga e rebuild de entrega em
reservations iteram Game.creeps; miner.run/spawn/spawnTier/spawnData usam
room.find(FIND_SOURCES); closestByPath com constante FIND_* causa busca implícita;
pioneer/remote têm caminhos diretos. A contagem global de 60,3 Room.find/tick
não prova duplicação: são salas e tipos distintos. Medir por `(room,type,tick)`.

Proposta: reutilizar census.allOwned para os ledgers, preserving ordem e inclusão;
usar roomCache.sources e arrays cacheados nas seleções elegíveis; manter filtros
por creep e desempate. `census.allInRoom` atualmente achata buckets e não inclui
creeps sem role: não substituí-lo por FIND_MY_CREEPS de torre sem revisar esse
contrato. `allOwned` os inclui. Combinar arrays não é equivalente automaticamente.

**Risco baixo/médio em scans equivalentes; alto em segurança.** Testar morte,
troca de role, creep sem role, trânsito entre salas, invasão, aliado agressor,
SK e ausência de visão. Não trocar closestByPath por closestByRange apenas por CPU.

### P10 — Movimento, miners, towers e população

**Evidência C/L/H.** `move`, `nativePath`, `routing`, `traffic`, `excuseMe`,
`miner.distribute`, `tower`, `damagedStructures`, `spawning/needs/population`.

- Movimento já usa caminho e matriz cacheados, TTL, desvio e stall guard. Contar
  motivos reais de repath, seleção de destino e passos/energia entregue. Uso de
  `_m.path.shift()` e arrays em Memory é candidato de representação; manter
  os mesmos passos com cursor/compactação antes de propor outra estratégia.
  A chave de roomMatrix usa contagem de estruturas/sites: invalidação deve
  distinguir substituição com a mesma contagem e mudanças de rampart antes
  de ampliar a vida do cache. Isso é risco de correção detectado por inspeção,
  não causa live comprovada do alto CPU.
- Miners já fazem batchTransfer. Reutilizar classificação de estruturas adjacentes
  a uma estação e escolher link sem sort completo, observando cooldown/capacidade
  atuais. Só reduzir chamadas de ação cuja redundância ou inutilidade foi medida;
  preservar harvest, fonte, renovação, drops e torres da fonte.
- Towers já compartilham alvos/listas e distribuem claims de reparo. Healing
  lista uma vez por sala/tick; não tratar 13 torres como 13 buscas idênticas.
  Oportunidades: seleção linear equivalente, dados locais comuns e scans de
  candidatos. Não remover reparo ótimo/crítico, cura ou escalonamento por energia.
- Spawn tem cache de verdict ocioso; needs tem cache e overrides. Evitar cálculos
  repetidos de body, fontes e lead time. Trocar 2 creeps pequenos por 1 maior,
  fixar um hub hauler ou alterar layout pode reduzir intents/rotas, **mas muda
  comportamento/capacidade e exige projeto próprio**, métricas de throughput e
  aprovação. Não usar queda de GCL como economia implícita.

Risco de seleção equivalente: baixo/médio. Risco de nova política de população,
rota, frequência de ação ou layout: alto. Defesa e remotes não foram exercitados
intensamente neste profile; seus custos sob ataque/expansão permanecem abertos.

## 5. Mapa de cobertura e o que já funciona

| Área | Revisão / mitigação existente | Próximo trabalho |
|---|---|---|
| main, wrappers, profiler, accounting | Pareamento O(1), guards, parse de Memory reaproveitado | P0; startup e overhead |
| hauler, resourcePolicy, terminalFuel, reservations | Cache local/negativo e claims já existentes | P1/P2: granularidade de consultas |
| miner, builder, upgrader, prototypes | Estações, batching, máquina de estados | P3/P10, intents redundantes |
| terminalOps/History/Index/Claims/Routing/Retry | Cadência 5, GC com dependências, confirmação/fees | P1/P4; não reabrir retenção corrigida |
| craftChain/Planner/Energy/Ledger/PurchaseBook | Manutenção 10 separada de policy; compras compartilhadas | P5/P6/P8 |
| labPolicy/Runtime/Model/Slots/Reactions/Data | Geometria memoizada, generators, proteção de boosts | Custos dinâmicos, fair scheduling e cold |
| market/History/Pricing/Flip/Swing/orderBook | Book compartilhado, mediana/cache e resumo histórico | P4/P7; evitar cache de cotação velha |
| intel/hostiles/keeperTransit/transitSafety | Diplomacia e trânsito separados | P9 com equivalência de segurança |
| tower/link/lab/factory/powerSpawn/rampart/observer | Execução e decisões compartilhadas/cadenciadas | P10; medir antes de mexer |
| movement/routing/terrain/traffic/nativePath/excuseMe | Matrizes/rotas heap, TTL, stall e escape | Representação e invalidadores; não prioridade inicial |
| stats/energyLedger/exporter/Grafana | Publicação completa 60, caminho leve, gauges recentes | Semântica de medição; P3/P7 |
| architect/planStore/plan/mincut/visual | Planos em segmentos e caminhos condicionais | Cenário frio/planejamento de salas; fora do custo recorrente dominante |
| spawn/needs/autoscale/population/priority | Caches e thresholds existentes | Equivalência e custo por role/throughput |
| scout/pioneer/bootstrap/remotes/raids/squad/defenders | Triagem dos caminhos de busca e população | Cenários específicos antes de otimizar comportamento |
| config/console/names/diagnostics | Config lê valores vivos; segmentos do path já cacheados | Sem prioridade para micro-otimização sem medição |

Esse mapa cobre a arquitetura do runtime. Não afirma ausência de outros
gargalos nem que caminhos não ativados foram validados com carga real.

## 6. Contrato de cache e invalidação para o implementador

| Dado | Reuso aceitável inicialmente | Invalidadores / ressalvas |
|---|---|---|
| Membership de ops por sala/recurso | Heap, mesma geração/tick, IDs/referências | Novo ID, dicionário novo, alteração source/target/recurso, reset; estado vivo |
| Quantidades/claims/custos | Mesma decisão síncrona sem mutação intermediária | Deal/send aceito, fee, withdraw, claim/release, receipt, listing, owner, ledger |
| Livro externo | Mesmo tick/contexto já compartilhado | Tick/provider; reservas locais de volume continuam vivas |
| Resumo histórico | Mesmas amostras canônicas | Coleta/poda/hidratação/reset; preço/idade/config fora do cache |
| Geometria de labs/estações | Heap por topologia | IDs/posição/owner/atividade/RCL/boost/pins, conforme o dado |
| Escolha de reação/par | Decisão atual | Estoque, quota, cooldown, pending, papel e efeitos |
| Orçamento de fuel | Decisão ou revisão explicitamente comprovada | Quotes/idade, escassez, transferências, loaded/fee, pendências, jobs |
| Snapshot de ledger | Revisão econômica demonstrada | Todo escritor de quantidades/custos/confiança; migração também escreve |
| Payload de histórico serializado | Mesma versão de dados e formato | Nova amostra/poda/config/generation; pressão de I/O não exige recompactar |
| Alvo negativo de logística | Somente enquanto dependências não mudam | Liberação/claim intratick e novas demandas; não prolongar cegamente |

Antes de cache entre decisões, inventariar **todos os escritores**. Preferir
agregados locais ou membership vivo quando não houver mecanismo completo de
versão. Incluir configuração modificada pelo console, providers de teste e
substituição de objetos. Sem checksum/JSON global em toda consulta.

## 7. Matriz de escala, comportamento e carga

Separar variáveis:

- `R`: salas possuídas; `I`: salas industriais; `V`: salas visíveis/observadas.
  Cenários mínimos: `(R=5,I=3)`, `(5,5)` e `(10,10)`; variar V separadamente.
- Labs industriais 3/7/10 por sala, incluindo topologia parcial, troca de fase,
  steady production, replan, boost/manual, falta de reagente/energia e reset.
- Haulers/consumidores 3/7/10 como stress sintético; população real e WORK/CARRY/MOVE
  em cenário funcional. Não chamar 10 consultas de “10 labs executados”.
- Ops ativas/listings: 0/5/20 por sala; histórico final 0/500/5.000 independente.
  Quantidades maiores são stress algorítmico, não promessa de viabilidade de
  limites do servidor. Variar diversidade de recursos e profundidade do livro.
- Taxa de negócios confirmados independente de ops: zero com muitas listings,
  muitos fills de uma ordem, recibos agrupados, envios internos, retries sem negócio,
  partialSales compatíveis sem criar operação nova.
- Frio: module/global reset, segmentos em hidratação, topologia nova, catálogo
  sem cache. Aquecido: dados idênticos; depois uma mutação de cada dependência,
  mesmo tick e tick seguinte. Testar mesmo tamanho de array com conteúdo alterado.

Contadores requeridos por módulo e consumidor:

| Dimensão | Medidas |
|---|---|
| Negócio | IDs confirmados únicos, volume, créditos, taxas, frete; sem duplicar transação interna |
| Workflow | Ops criadas por kind, receipts, agregações em operação existente, finais e GC |
| Trabalho | Enumerações, elementos visitados, consultas, recomputações, sorts, getters de store |
| Mercado | Fetches full/filtered, linhas do book examinadas, quotes/tuplas de frete |
| Logística | Seleções descartadas, jobs atribuídos/cancelados, reservas, itens transportados |
| Produção | Reações/produções confirmadas, produto/tick, espera/cooldown, violações de quota |
| Movimento | Passos, buscas e motivos, stuck, rota/tick e energia entregue por distância |
| Persistência | Chars por raiz, JSON explícito, páginas/dirty/retries, heap e reset |
| CPU | Débito pareado, script, residual, intervalos válidos, distribuição por tick |

Testes anteriores já executaram 9 mundos com salas 3/5/10 × labs 3/7/10,
lotinho de 5 XLH2O por sala terminado em 15/6/4 ticks. Preservar esses testes,
mas ampliar para lotes longos, catálogos frios, todos os produtos relevantes,
logística limitada e ordens concorrentes. Isso não prova que 10 salas cabem
em 15 CPU no servidor. Node wall-time e número de visitas são evidência de
complexidade, nunca conversão direta para CPU Screeps.

## 8. Coleta live centralizada, sem deploy

Três comandos prontos: [cpu-audit-console-paste.txt](diagnostics/cpu-audit-console-paste.txt).
Copiar e enviar **cada linha separadamente** ao console. Fonte legível:
[cpu-audit-commands.js](diagnostics/cpu-audit-commands.js). Não executar o arquivo
inteiro como uma expressão. Cada comando executa diretamente, sem instalação,
função global ou estado entre chamadas. Não precisa de build/deploy.

Correção do procedimento: o instalador anterior, preservado em
`cpu-audit-console.js` como referência obsoleta, excede o limite de 1024 caracteres
de `JSON.stringify(expression)` do [backend público do Screeps](https://github.com/screeps/backend-local/blob/master/lib/game/api/user.js).
A validação anterior em VM ignorava essa fronteira e foi insuficiente. A rejeição
por tamanho foi reproduzida localmente com a regra do endpoint; não temos a resposta
HTTP da tentativa no shard3 para afirmar que foi exatamente essa rejeição live.
O erro live comprovado é a função ausente. Também verificamos que o bundle local
não contém `cpuAuditSnapshot`: o grunt parte de `src/main.js` e não inclui esse
arquivo em `docs/`. Rodar grunt não instala o diagnóstico. Build e produção ficam
intocados nesta correção de procedimento, conforme instrução do usuário.

O gerador `prepare-cpu-audit-console.js` verifica o limite com escaping JSON,
execução independente em contextos novos, cenários vazios e preenchidos,
deduplicação de transações e Game/Memory/globals inalterados.
Tamanhos codificados: 532, 774 e 740 caracteres. Validação local não é confirmação
live; nenhuma amostra desses novos comandos foi recebida ainda.

1. `[cpuAuditMemory]`: tamanhos por raiz, custo de serialização explícita, reset,
   profiler e estado do histórico. Executar uma vez.
2. `[cpuAuditRooms]`: salas próprias, labs, roles por sala atual, energia,
   cooldown e cadeias. Executar uma vez; creeps fora das salas próprias não entram
   nesses totais por sala.
3. `[cpuAuditBusiness]`: nextId, IDs/kind/state das operações retidas, quantidade
   de ordens próprias e transações deduplicadas por ID. Repetir somente este comando
   após pelo menos 60 ticks de jogo e enviar as duas saídas; diferenças são calculadas
   fora do bot. `opFields` e `txFields` descrevem as colunas dos arrays.

Cada saída contém seu próprio Game.time; as três coletas não são um snapshot
atômico. Nenhum comando envolve main.loop, altera settings, reseta medidores ou
emite intents. A coleta de Memory serializa cada raiz explicitamente; a soma não
é exatamente o JSON total por causa das chaves externas. O custo do diagnóstico
perturba o tick do console; excluí-lo de benchmarks limpos. `serializationCpu`
não mede a finalização do engine nem prova a causa de todo o residual.

A diferença de nextId representa criações somente com sequência monotônica no
mesmo estado; não é nº de negócios. Tipos de operações já coletadas entre amostras
não podem ser recuperados por snapshot. Arrays de transações têm retenção limitada:
IDs novos são **observações**, não contador garantido de todos os negócios ocorridos
no intervalo, nem necessariamente negócios feitos após a primeira amostra; conferir
os ticks das transações. Para cobertura exata, o próximo pacote instrumental deve contar no
ponto de confirmação/criação e publicar deltas monotônicos separados, com epoch.
Não substituir a gauge recente de 60 ticks de transferências por esse contador.

Para CPU normal: `cpuTop(30)` após pelo menos 600 intervalos pós-profile e sem
reset. Guardar endpoints. Não executar `cpuTop(0)` para esse acompanhamento.
Não rodar profile repetidamente enquanto se tenta medir o baseline normal.
`moveStats()` existente guarda só um tick recente; não tratá-lo como agregado
de uma janela longa. Se necessário, agregar em uma única instrumentação futura.

### 8.1 Resultados da primeira coleta live (shard3, ticks 83665983..83666015)

Reset de global em 83665759: as amostras são de um global com ~225 ticks.
Os três comandos novos funcionaram; o `cpuAuditSnapshot()` que falhou é o
instalador obsoleto (função inexistente, como já descrito).

**Memory (`[cpuAuditMemory]`, 288.456 chars):**

| Raiz | Chars | % |
|---|---:|---:|
| rooms | 164.155 | 56,9 |
| terminalOps | 42.957 | 14,9 |
| craft | 35.064 | 12,2 |
| stats | 26.496 | 9,2 |
| creeps | 8.547 | 3,0 |
| swing | 8.065 | 2,8 |
| demais (14 raízes) | ~3.100 | 1,1 |

- Serialização explícita (JSON.stringify de cada raiz): **1,69 CPU** nessa
  chamada. O motor serializa Memory uma vez por tick ao final, fora de `endTick`,
  portanto isso é a **ordem de grandeza** do componente de serialização do
  residual de 2,34 (H forte, ainda não C: o custo no motor pode diferir e o
  parse inicial cai dentro do script). Não é medição do residual.
- Menos de 5 raízes concentram 95%. `rooms` sozinho é maior que todo o resto
  somado; `stats` (26 KB) é telemetria reescrita todo tick.
- Histórico de mercado: 5 páginas, 422.947 bytes em segmentos, `pendingSegments`
  e `writeSegments` vazios, sem erro. Na carga atual **não há retry de escrita
  em curso**, então a duplicação de 10.103 stringify (P7) é potencial, não
  desperdício observado agora.
- Profiler desligado: o baseline recente não tem overhead de profile.

**Salas (`[cpuAuditRooms]`):** 5 salas (L8 W7N49 com 10 labs; L7 E1N47 com 6;
L6 E1N45 com 3; duas L3 sem labs). 3 cadeias XLH2O `working`, uma por sala
industrial. Storage com energia 0 em E1N47, E5N41, E6N41 (energia crítica
aparente; relevante para P2/terminalFuel e para hauler, não conclusivo sobre
CPU). Haulers 2–3/sala, 12 no total, coerente com 12 chamadas/tick da tabela
da seção 3. R=5, I=3 confirma que o cenário (5,3) da matriz é o real.

**Negócio (`[cpuAuditBusiness]`, duas amostras com 29 ticks de intervalo):**

- 28 operações retidas: 14 `sell:listed`, 2 `sell:atTerminal`, **12 `buy:completed`
  retidas** (12518..13078). `nextId` ficou em 13090 nas duas amostras:
  **nenhuma operação criada em 29 ticks**; a lista de transações também não
  mudou (última em 83665761, antes da primeira amostra).
- 82 ordens próprias para 14 listings: as demais ~68 ordens não têm operação
  `listed` correspondente (partialSales/flip/swing ou resíduo). Origem não
  identificada; candidato a inspeção, não a conclusão.
- Interpretação: o custo de `terminalOps` (0,816/tick; `sell:listed` 0,458) é
  **trabalho de estado estacionário** sobre 14 listings sem eventos, não custo
  de negócio. Isso reforça P1/P4: a prioridade é tornar o ciclo `listed` sem
  mudança barato (versão/dirty por operação), sem mexer na cadência de
  reavaliação de preço. Amostra única de 29 ticks, sem cobertura garantida.
- Operações `completed` retidas: verificar a política de GC (quanto tempo, quantas)
  antes de propor remoção; elas entram no JSON (terminalOps = 43 KB) e talvez em
  varreduras. Remover só se nenhum leitor depender (receipts/ledger).

**Priorização atualizada pela coleta (sem alterar a ordem dos pacotes de forma
causal):**

1. **P7 sobe de condicional para provável maior bloco isolado:** ~1,7 CPU de
   serialização para 288 KB. Reduzir `rooms` (57%) e `stats` (9%) atinge o
   componente em proporção ao volume, sem tocar em lógica econômica. Passo zero:
   quarto comando abaixo para saber *quais campos* de `rooms` pesam.
2. P1/P4 (estado estacionário de terminalOps/fuel) continuam valendo.
3. P7 item 2 (retry de histórico) fica em baixa prioridade: sem pendência live.
4. Salas L3 e storages vazios sugerem checar se a lógica de hauler/fuel gasta
   CPU procurando energia inexistente (candidato H, medir antes).

**4º comando (nova coleta):** campos de `Memory.rooms` por tamanho (411 chars
no total, 413 com escaping JSON, abaixo do limite de 1024; executado em VM local
com Memory sintética, não ao vivo). Última linha de
[cpu-audit-console-paste.txt](diagnostics/cpu-audit-console-paste.txt), saída
`[cpuAuditRoomFields]`: total de chars por campo (15 maiores) e em quantas salas
cada campo existe. Enviar como as demais, uma vez; só lê Memory.

### Lacunas que ainda impedem diagnóstico causal completo

1. Causa exata do pico ~197 sem trace do tick correspondente.
2. ~~Participação de cada raiz de Memory~~ respondida na 8.1 (rooms 57%); falta
   o detalhe por campo de `Memory.rooms` (`[cpuAuditRoomFields]`) e a medição do
   custo real do final de tick no motor (a diferença entre 1,69 e o residual).
3. Frequência live de ações duplicadas e proporção dos scans de fuel/claims/ledger
   dentro de cada consumidor; reproduções provam existência, não CPU recuperável.
4. Taxas exatas de negócios/criações por kind entre coletas com cobertura garantida.
5. Custo frio e fairness do planner em 5/10 salas industriais simultâneas.
6. Baseline normal com 600 intervalos e comparação equivalente após implementação.

Não deixar essas lacunas virar autorização para cache agressivo ou mudança de
cadência. Os itens reproduzidos já têm direcionamento concreto; os candidatos H
devem passar por coleta/reprodução antes de entrar num pacote de correção.

## 9. Sequência de implementação para o próximo agente

Trabalhar sob 0138/ARK-128. Novas features que mudem política/população/layout
exigem spec própria e revisão; issues novas entram Backlog. Não marcar ARK-128
Done ao terminar apenas os testes offline.

1. **Preparação:** ler este relatório, anexos, constitution e diffs staged/worktree;
   conferir hash/estado live. Completar baseline pendente, sem publicar para medir.
2. **Pacote A — equivalência e observabilidade:** contador correto do profile,
   contadores opcionais no heap, índice por sala e migração de terminalFuel,
   caches apenas locais; regressões e contadores de candidatos por consumidor.
   Manter cada alteração isolada em teste/diff para atribuição mesmo que se
   reúna um único deploy. Se a medição live resolver a prioridade antes, reduzir
   esse pacote ao que foi comprovado e necessário.
3. **Pacote B — intents redundantes:** harvest e builder com teste de intents
   deferidos, prioridade e contabilidade. Separar caso idêntico seguro das
   decisões que podem mudar o alvo efetivo. Verificar produção/GCL depois.
4. **Pacote C — consumidores dinâmicos:** fuel/claims/warehouse por contexto,
   hauler seleção preguiçosa comprovada, labs por decisão. Não usar TTL de saldo.
5. **Pacote D — custo frio e persistência:** planner incremental, fairness,
   request budget e serialização preparada de histórico. Depende das medições
   de P6/P7; risco maior, tratar separadamente.
6. **Expansão:** medir 5 industriais nas mesmas 5 salas; depois validar cenário
   de 10 salas, população, labs, mercado e visão. Nova política econômica somente
   com critérios funcionais próprios, não como atalho para reduzir CPU.

Cada pacote: spec/plan/tasks antes do código, baseline reproduzível, alterações
pequenas, `node --check`, smoke com assertions relevantes, graphify update.
`grunt` só ao encerrar o pacote autorizado: registrar que também publica,
SHA e tick/reset da aplicação. Evitar deploy por cada tentativa ou debug.
Nenhuma correção de exporter/Grafana externo é distribuída por grunt.

## 10. Critérios de aceite e rollback

### Equivalência funcional

- Comparar uma implementação de referência com a candidata em fixtures iguais:
  intents, destinos, quantidade, ordem de prioridade, taxas, estoques, custo médio,
  confiança, créditos comprometidos, receipts e reações confirmadas.
- Testar duas decisões no mesmo tick com mutation entre elas: claim, withdrawal,
  criação/finalização, fee, cancel/extend listing, dono, cooldown, boost/manual,
  preço, quantidade de ordem, reset e troca de objeto mantendo contagem.
- Nenhuma perda de estoque nem débito duplo; confirmar produção pelo próximo
  estado; preservar urgência de energia, segurança, stall guards e equidade.
- Caches devem ter cap/expiração e não reter game objects como dados persistentes.

### Escalabilidade

- Membership por sala tem trabalho de construção global compartilhado e consulta
  local. Reportar visitas, não apenas ownKeys. Ops finais não multiplicam o custo
  dos consumidores aquecidos. Testar 3/5/10 sem aumentar superlinearmente por
  consultar o império inteiro a partir de cada sala.
- Medir cache frio, warm, invalidação e allocation overhead. Se um mecanismo
  piora 3 labs para ganhar em 10, justificar/selecionar estratégia por evidência.
- Budget global do planner respeitado com 10 salas; jobs não sofrem starvation.
  Incluir taxa de replan e idade do job mais antigo, não só média de CPU.

### CPU live

- Resultado primário: débito pelo bucket em intervalos válidos, com script
  pareado e residual. Profiler e diagnóstico explícito fora da janela de aceite.
- Proposta de aceitação sustentada: três janelas **não sobrepostas** de 600
  intervalos válidos abaixo de 15, workload representativo documentado; estender
  até cobrir pelo menos um ciclo relevante de coleta/persistência de histórico,
  que pode ser mais longo que 1.800 ticks. Meta ideal <10 registrada separadamente.
- Janela fria medida separadamente, sem apagar seu custo da média operacional
  de longo prazo. Registrar frequência de reset e custo amortizado; evitar pico
  que cause interrupção de tick ou descapitalização de bucket.
- Cobertura sem clipping de bucket, gaps, mudança de limit ou pixel. Guardar
  versões, endpoints, população, cadeias, ordens, taxas de eventos e estado de
  estoque. Não exigir duração fixa em minutos.
- Não prometer savings somando spans. Com baseline recente ~17,96, falta reduzir
  aproximadamente 2,96 CPU/tick para 15 em carga equivalente; para 10, ~7,96.
  São distâncias à meta, não estimativas de ganho dos itens deste plano.

Rollback ou suspensão do pacote se houver perda/duplicação contábil, queda de
produção/GCL sem causa de carga explicada, atraso crítico, bloqueio de lab,
starvation, leak de cache, regressão do custo aquecido ou pico acima do orçamento.
Usar versão anterior compatível; alterações de schema persistente exigem plano
de migração e recuperação, sem simplesmente apagar Memory.

## 11. Reprodução desta entrega

```powershell
rtk node --check docs/diagnostics/cpu-audit-offline.js
rtk node --check docs/diagnostics/cpu-audit-console.js
rtk node docs/diagnostics/cpu-audit-offline.js docs/diagnostics/cpu-audit-offline-results.json
```

Executa módulos de produção atuais em VM isolada, sem substituí-los no repositório.
Resultados: 27 cenários + 3 históricos finais; index/fuel conforme tabela;
duplicatas de harvest/build; retries de serialização; média de startup hipotética.
Fixture de builder usa intents que retornam OK sem mutar store, para expor a
duplicação de chamadas; resolução do motor e sucesso final ficam fora da simulação.
Os dados JSON incluem hashes de todo src, para impedir comparação silenciosa
com outra versão. Novo diagnóstico não é um novo teste de aceitação de CPU live.

Verificações desta entrega: syntax checks dos dois scripts limpos; reprodutor
offline aprovado; snapshot de console exercitado duas vezes em VM sem alterar
Memory; os111hashes de runtime permaneceram iguais ao inventário; smoke existente
passou com caminho absoluto do projeto. A primeira chamada do smoke com `.`
falhou na resolução de lodash pelo harness, antes de executar testes; usar o
caminho absoluto, sem instalar dependências ou alterar o harness para isso.
`git diff --check` limpo. Graphify AST atualizado:4638nós/9429arestas/345comunidades;
fallback sequencial por WinError5, avisos de versão da skill e labels antigos.
Não houve build, publicação, commit nem alteração do índice Git nesta etapa.

**Conclusão de estado:** há causas locais de desperdício reproduzidas e uma
sequência de soluções revisável. A CPU total abaixo de 15 não foi demonstrada;
o diagnóstico causal do pico e a atribuição quantitativa completa continuam
explicitamente pendentes das coletas identificadas. Nenhuma correção foi aplicada
nesta etapa de planejamento.

## 12. Segunda coleta live e plano por frentes (meta < 10 CPU, zero perda funcional)

### 12.1 Dados novos (shard3, ticks 83666276..83666336)

**Baseline sem profile, sem reset, 577 intervalos válidos (83665759..83666335):**
débito pareado **17,203**, script 14,876, residual **2,327**, headroom 2,797.
Distância até 10: **7,2 CPU/tick**. Ainda não são 600 intervalos nem três
janelas, mas é a melhor régua atual. Janela parcial de 38 ticks: creep 8,73
(hauler 3,53, miner 2,22, builder 1,85, upgrader 1,12), craftPlanner 1,24,
structure 1,07, terminalOps 1,05, intel 0,85, spawn 0,24, resto < 0,6.

**Memory por campo (C):**

| Item | Chars | Observação |
|---|---:|---|
| `Memory.rooms[*].walkMatrix` | 23.437 | **1 sala; nenhum escritor em `src/`**; spec 0001 e smoke proíbem. Resíduo antigo |
| `Memory.rooms[*].terrainMatrix` | 5.101 | idem, 1 sala |
| `exits` | 17.958 | 459 salas; derivável de `Game.map.describeExits` |
| intel por sala (lastVisit, enemyScanTick, hasInvaderCore, hasController, my, owner, mineral, reservation, builds...) | ~25.000 | 459 salas; 526 entradas em `Memory.rooms` |
| `terminalOps.operations` | 36.964 | 14 listed = 17.940 (~1.281 cada), 12 buy:completed = 15.986 (~1.332 cada), 2 atTerminal, 1 transfer |
| `stats.market` | 16.735 | 63% de `stats`; o exporter lê |
| `craft.active/stranded/recovered/recoveredAdoptions` | 12.018 / 9.533 / 5.049 / 4.085 | |
| `swing.observations` | 8.044 | |

Taxa de serialização observada: 1,69 CPU / 288 KB, ou **0,006 CPU por KB**
(ordem de grandeza, H). Remover os 28,5 KB órfãos vale ~0,17 CPU; as 12 buys
concluídas, ~0,09; reduzir pela metade toda a Memory (~140 KB) vale ~0,8.
**Memory sozinha não chega a 7 CPU: o teto realista é 0,5–1,0.**

**Ordens de mercado (`cpuAuditOrders`, 50 grupos):** muitas ordens `sell` com
`remaining = 0` e `active = false` (6 de H e 6 de XLH2O em W7N49; ZH, UH, OH,
X, U, L, H em várias salas). Continuam em `Game.market.orders` e cada acesso à
lista paga por todas. Não sabemos se o bot as cancela, reusa ou espera expirar:
**inspecionar a política antes de agir**.

**Operação `buy:completed`:** carrega `fuelQuote`, `lastDealObservation`,
`deadOrderIds`, `accounting`, `marketFees` etc. e fica retida após terminar.
`FINAL_STATES` só filtra "ativas"; há um `gc+orders` (0,066/tick), então algum
GC existe, mas falta ler a regra exata.

**Sobre o pico de ~197 (H forte):** a janela "antes do profile" começou em
83665086 com média 21,196 contra ~17,7 das outras. Um tick de ~197 diluído em 112
intervalos soma ~1,6. Isso aponta para **custo de partida a frio logo após uma
publicação** (parse, compilação do bundle, reconstrução de caches, carga de
segmentos). O 12:56 informado equivale a ~83665107 (4,11 s/tick, conferido entre
83665983 às 13:56:03 e 83666336 às 14:20:14). **Pergunta: houve deploy por volta
das 12:55?** Se sim, é partida a frio, não regressão estacionária, e não afeta os
17,2: é a frente F9. Nenhum span estacionário passa de 5,8 de pico por chamada.

### 12.2 Orçamento: de 17,2 para < 10

Potencial por frente. **São tetos hipotéticos, não promessas**; cada um só conta
depois de medido pelo balanço pareado. Spans aninhados se sobrepõem.

| # | Frente | Hoje | Potencial | Base do número |
|---|---|---:|---:|---|
| F1 | Memory/serialização | residual 2,33 | 0,5–1,0 | 0,006 CPU/KB |
| F2 | craftPlanner estacionário | 1,24 | 0,6–0,9 | `startItem` 0,82 em 2,4 chamadas/tick: roda todo tick por cadeia `working` |
| F3 | terminalOps listed | 1,05 | 0,5–0,7 | 14 listings sem eventos custam 0,54 (0,19/op) |
| F4 | labPolicy + lab | 0,67 + 0,35 | 0,3–0,5 | assignments/resolve/confirm rodam 2,4×/tick em regime constante |
| F5 | hauler | 3,53 | 1,2–1,8 | pickDeliver 0,65, pickLoad 0,56, runMineralJob 0,51, pickMineralJob 0,33 |
| F6 | miner | 2,22 | 0,8–1,1 | `miner.distribute` 0,775 em 11 chamadas |
| F7 | builder + upgrader | 1,85 + 1,12 | 0,8–1,3 | `builder.opportunistic` 0,745; upgrader 0,22/creep |
| F8 | intel/observer/needs | 0,85 + 0,14 + 0,16 | 0,3–0,6 | getIntel 6,1 chamadas/tick, transitSafety 0,22 |
| F9 | Partida a frio e picos | pico ~197 | 0 no regime | reduz risco de bucket, não a média |
| F10 | Telemetria (stats) | 0,10 (pico 2,48) | 0,05–0,1 | verificar se `stats.market` é reescrito todo tick |

Soma dos tetos: ~5,0 (baixo) a ~8,0 (alto), ou seja **9,2 a 12,2 CPU/tick**.
Conclusão honesta: **< 10 está no limite do alcançável** e exige F5, F6 e F7
(creeps, ~50% do script) perto do teto; sem elas não passa de ~13. Se após F1–F4
o ganho real ficar abaixo do esperado, replanejar F5–F7 antes de mexer em
comportamento.

### 12.3 Etapas

Cada etapa: spec/plan/tasks, baseline pareado, referência preservada em teste,
diff isolado, smoke, `graphify update`, deploy único ao fim.

**Etapa 0 — Régua e segurança (sem ganho).** Corrigir contador do profiler (98
vs 100), registrar reset/versão nas saídas, criar o harness de equivalência
(12.4). Medir baseline de 3 janelas × 600 intervalos.

**Etapa 1 — Limpeza segura de Memory (F1, risco baixo).**
1. Migração única que apaga `walkMatrix`/`terrainMatrix` órfãos de
   `Memory.rooms` (28,5 KB; o smoke já exige que não existam). Rodar uma vez, por
   versão.
2. Ler a regra de GC de operações finais e de `craft.stranded/recovered*`;
   propor retenção por idade só para o que nenhum leitor consome (receipts,
   ledger e contabilidade ficam).
3. `exits` e intel por sala: mover o derivável (`Game.map.describeExits`) para o
   heap **só depois de listar todos os leitores**.
4. `stats.market`: ver frequência de escrita e o que o exporter lê; não mudar o
   formato sem o exporter.

**Etapa 2 — Estado estacionário de planejamento (F2, F3, F4).** Padrão único: cada
decisão guarda uma *assinatura de entradas* (versão das operações, estoque
relevante, cooldown) e só recalcula quando ela muda; **nunca TTL cego**.
`startItem` retorna cedo quando o item já iniciou e a assinatura é a mesma.
`sell:listed` só reavalia preço/fee quando a assinatura muda ou na cadência atual
de repricing (que não muda). Labs: assignments/resolve/confirm por versão da
política.

**Etapa 3 — Creeps (F5, F6, F7).** Maior ganho, maior risco. Ordem: duplicatas de
`harvest`/`build` (já reproduzidas) → `miner.distribute` com cache por (fonte,
população) invalidado por spawn/morte/mudança de container →
`builder.opportunistic` usando a lista de danificados já existente
(damagedStructures) e `pickPile` → hauler (catálogo de candidatos por sala,
seleção preguiçosa, reserva de claims intacta) → upgrader. Movimento: `moveByPath`
em rota cacheada no heap quando o destino não muda, com fallback ao comportamento
atual.

**Etapa 4 — Intel e segurança (F8).** Cache por (sala, tick de visão) e por
mudança de hostilidade. **Segurança e defesa não ganham atraso**: todo cache ali
tem invalidação por evento (hostil visto) e teste de equivalência.

**Etapa 5 — Partida a frio (F9).** Confirmar a correlação com deploy; depois
hidratação preguiçosa de segmentos e distribuição de caches caros em vários ticks
com orçamento global, sem mudar o que é restaurado.

**Etapa 6 — Medição final.** 3 janelas de 600 intervalos, sem profile, workload
documentado; comparar com a Etapa 0.

### 12.4 Garantia de zero perda funcional

1. **Referência intocada:** cada função otimizada mantém a versão antiga em `test/`
   como oráculo. O teste roda as duas nos mesmos mundos e exige intents, alvos,
   quantidades, ordem, fees, custo médio, claims e receipts iguais.
2. **Mutação entre decisões:** cada cache é testado com mudança no mesmo tick e no
   seguinte (claim, saque, fee, cooldown, dono, reset, troca de objeto).
3. **Modo sombra opcional (diagnóstico, por flag):** por N ticks, hauler/builder
   rodam referência e candidata e logam divergências sem agir com a candidata.
   Custa CPU, então fica fora das janelas de medição.
4. **Invariantes ao vivo após cada deploy:** energia entregue por tick, produção
   XLH2O por cadeia, ordens abertas, créditos, GCL/tick, nenhum creep ocioso
   novo. Rollback se qualquer um cair sem causa de carga.
5. **Etapas pequenas, um deploy por etapa**, comparando pareado antes/depois. Se
   uma etapa não entregar o previsto, parar e replanejar em vez de empilhar caches.
6. Nada de apagar contabilidade, histórico necessário ao preço ou recibos.
   Migrações de schema com plano de recuperação.

### 12.5 Pendências de leitura de código antes das specs

- Regra de GC de `terminalOps` finais e de `craft.stranded/recovered`.
- Quem cancela ou reusa ordens com `remaining = 0`.
- Leitores de `Memory.rooms[*].exits` e dos campos de intel.
- Frequência de escrita de `stats.market`.
- Por que `startItem` roda todo tick em cadeias `working` já iniciadas.

## 13. Leituras de código das pendências (resolvem dúvidas do 12.5)

Premissa do usuário: o deploy de ~12:55 é a causa do pico de ~197 (partida a
frio). Adotada como premissa de trabalho; não é medida.

### 13.1 Respostas

| Dúvida | Resposta (C = lido no código) |
|---|---|
| GC de `terminalOps` finais | `terminalHistory.prune`: apaga finais com idade >= `terminalOps.operationRetentionTicks` (default **0**), **exceto** os protegidos: ops de cadeias `craft.active` (`tradeIds`, `buys[*].opId`, sell/partial/energy ops), `marketFlip.active`, ops em uso por creeps, `pendingDeal/Extension/ListingCancel`, ordem ainda viva com restante > 0, e os pais (`parentId`). As **12 `buy:completed` são retidas porque as 3 cadeias XLH2O ativas as referenciam** (contabilidade de custo). Não são lixo; saem quando a cadeia terminar. |
| Como encolher essas 12 | Cada uma pesa ~1.330 chars com campos de execução (`fuelQuote`, `lastDealObservation`, `deadOrderIds`, `lastDeal*`, `waitingDirection`...). **Compactar ao entrar em estado final**, mantendo `accounting`, `marketFees`, `netBought`, `buyCredits`, `receivedAmount`, `dealtAmount`, `owner`, `parentId`. Exige listar quem lê cada campo após o final. Ganho ~10 KB (~0,06 CPU). Baixa prioridade. |
| `craft.stranded/recovered*` | `stranded` guarda `retentionTicks` = **259.200** ticks (padrão) e depois o `strandedSweep` vende/dissolve; é recuperação de estoque, funcional. `recoveredAdoptions` são recibos de idempotência. Não remover; só medir se crescem sem limite. |
| Ordens com `remaining = 0` | O bot só chama `cancelOrder` para ordens **vinculadas a uma operação** (reprice, cancelamento, `pendingListingCancel`). Ordens esgotadas fora de operação não são canceladas por ninguém; o jogo as mantém. Sem política de limpeza, ficam em `Game.market.orders`. 8 módulos varrem `Game.market.orders` (terminalClaims, craftLedger, swingTrade, resourcePolicy, marketAccounting, terminalHistory, terminalOps x4). Cancelar ordem esgotada é gratuito, mas **antes** é preciso confirmar que nenhuma contabilidade/claim as usa; ver 13.3 (custo do getter). |
| `stats.market` (16,7 KB) | `Memory.stats` é **recriado do zero todo tick** (`Memory.stats = {gcl, rooms, cpu, memory, market, persistent}`). O exporter lê `market.fairPrice`, `market.transactions`, `market.credits`. Dá para só reescrever `fairPrice` quando muda e reaproveitar objetos; manter nomes e formato (exporter e Grafana não mudam). |
| Leitores de `Memory.rooms[*].exits` | 6: scout, architect, remotes, routing, squad, intel (que o escreve). Todos podem usar um helper único com cache no heap sobre `Game.map.describeExits`. Também `intel.js` cria stubs `Memory.rooms[vizinho] = {}`, origem das 526 entradas. |
| Por que `startItem` roda por tick | Em `working` o código chama `startItem` sempre. Se o item já iniciou e é de política de lab, entra em `labPolicyRuntime.tick`, que faz **resolve + profile + confirm a cada tick**. `confirm` precisa ler os labs a cada tick (confirmar reações); `resolve` e `profile` dependem só de estrutura/geometria e podem ser guardados por assinatura (ids dos labs + versão da política). Aqui está o ganho de F2/F4. |

### 13.2 Inventário de migrações (candidatas a remoção)

Há bem menos código de migração do que o esperado: **~5 pontos reais** em `src/`.

| Ponto | O que faz | Estado live provável | Ação |
|---|---|---|---|
| `planStore.segmentMap` | move `Memory.settings.planSegments` para `Memory.planSegments` | `planSegments` existe (78 chars); `settings` pequeno | remover se `settingsPlanSegments` = false |
| `planStore.migrateFromMemory` | move `Memory.rooms[r].buildings/mincutBoundries` para segmento | não há campo `buildings` em `rooms_with` | remover após `roomsBuildings` = 0 |
| `craftLedger.migrateOwners` | roda **todo tick**; só age em cadeias com `id` duplicado sem `ownerId` | custo ~0 | remover se todas as cadeias têm `ownerId` |
| `craftLedger.reconcileLegacy` + `legacyRecoveryGraceTicks` | só para inventário `confidence === "reconstructed"` e sem `legacyReconciled` | desconhecido | **cuidado:** "reconstructed" pode ser também o modo de recuperação normal quando falta inventário (perda de Memory). Só remover após ler `ensure()` e confirmar que nenhum caminho vivo o cria |
| `terminalOrderRetry.excluded` | converte `deadOrderIds` antigos em `orderRetries` | `opsDead` live | remover só se `deadOrderIds` não for mais gravado por outro caminho |
| comentários de "migrated" em `config.js` | texto | — | nenhuma |

**Conclusão:** remover migração traz **simplicidade, não CPU** (o custo de todas é
~0). Fazer com o 4º lote de comandos (`cpuAuditLegacy`) para decidir com dado
live. Alguns pontos (`reconcileLegacy`, retry) são também caminhos de recuperação
após reset e **não se removem por serem antigos**.

### 13.3 Piso de intents: correção importante do orçamento

O comentário do miner e o profile mostram que **cada intent de ação custa ~0,2 CPU
no jogo**, seja qual for o código ao redor. Do profile de 100 ticks (self,
por tick): `Creep.move` 1,33 (6,8 chamadas), `Creep.harvest` 0,83, `Creep.
upgradeController` 0,54, `Creep.transfer` 0,34, `Creep.build` 0,23,
`Creep.withdraw` 0,15, tower.run 0,73 (contém intents), observer 0,13.
**Soma de intents/ações do jogo ~3,5 a 4,2 CPU/tick**, ou **~25% dos 17,2**, que
nenhuma otimização de lógica reduz: só reduzir o número de ações (menos criaturas,
menos moves, ou corpos maiores), o que é **mudança de política/população**, com
spec própria, não otimização.

Consequência: `builder.opportunistic` (0,745 em 5 chamadas = 0,15 cada) e boa parte
de `miner` (2,2 para 11 miners) são **majoritariamente intent**, não lógica. Os
potenciais F6/F7 do 12.2 estavam altos demais. Revisão:

| Frente | Antes | Revisado | Motivo |
|---|---:|---:|---|
| F6 miner | 0,8–1,1 | 0,2–0,5 | o custo é quase todo harvest/transfer; sobra a lógica de `distribute` |
| F7 builder+upgrader | 0,8–1,3 | 0,3–0,6 | `opportunistic` e `upgrade` são intents; sobra seleção/ordenação |
| F5 hauler | 1,2–1,8 | 1,0–1,6 | `hauler.run` self 0,317/chamada é lógica; move/transfer ficam |

Soma revisada: **3,8 a 6,6 CPU/tick** → resultado **10,6 a 13,4**.
**Conclusão honesta: com otimização de lógica sem mudar comportamento, não se
chega a < 10 com segurança.** Para < 10 é preciso, além do plano:
(a) reduzir ações por política (ex.: miners/haulers com corpos maiores e menos
criaturas, upgraders parados mais perto do controller, links no lugar de haulers),
cada uma exigindo spec própria; ou (b) aceitar ~11–12 como meta realista.
Decidir isso depois de F1–F4 e F5 medidos, não antes.

### 13.4 Modo sombra sem duplicar processamento

Sombra executa a lógica duas vezes. Regras para não elevar o consumo:

1. **Primário é o oráculo offline** (test/), que não gasta CPU live.
2. Sombra live só por flag, **amostrada**: no máximo 1 decisão por frente por tick,
   em rodízio (ou 1 tick a cada K), e apenas se `bucket > 9.000` e a janela
   não for de medição.
3. A candidata roda e **age**; a referência é a chamada extra, sem intents e sem
   mutação (puro cálculo sobre o mesmo snapshot). Só vale onde a referência é pura.
4. Orçamento duro por tick (ex.: 0,5 CPU) e auto-desligamento ao exceder.
5. Divergência grava só um resumo limitado (contador + 1 amostra), nunca arquivo
   por tick.
6. Para decisões que mutam estado (claims, ledger, ordens), **não há sombra live**:
   só o oráculo offline e os invariantes pós-deploy.

### 13.5 Novos comandos de coleta (último bloco de
[cpu-audit-console-paste.txt](diagnostics/cpu-audit-console-paste.txt))

- `[cpuAuditGetter]` (420 chars): custo de 20 acessos a `Game.market.orders` e a
  `Object.keys(Memory.rooms)`, para saber se as ordens esgotadas pesam no
  getter. A primeira leitura do tick inclui a construção; interpretar como teto.
- `[cpuAuditLegacy]` (654 chars): cadeias (ownerId, confidence, legacyReconciled,
  version), ops sem dono, ops com `deadOrderIds`, salas com `buildings` e
  `settings.planSegments`. Decide a remoção de migrações.

## 14. Balanço após 0145, 0146 e 0147 (2026-10-15, janelas de 150 intervalos)

| Janela | Boot | `warm` | Resíduo | Observação |
|---|---|---:|---:|---|
| Pré (577 intervalos, inclui tick frio) | 83665759 | 17,203 (~16,94 sem o frio) | 2,327 | Memory 288 KB |
| Pós-0146 (96) | 83667141 | 17,042 | 2,018 | Memory 204 KB |
| Pós-0146 (150) | 83667350 | 16,407 | 1,695 | |
| 0147 pacote 1 | 83667521 | 16,780 | 1,687 | `resolve` 0,144 -> 0,110 |
| 0147 + índice swing | 83667791 | 16,927 | 1,756 | pico swing 25–33 -> 18 |
| 0147 + spans swing | 83667960 | 17,000 | 1,884 | |

Leitura honesta:

- **O resíduo caiu de ~2,33 para ~1,7–1,9 (−0,5) e é estável**: é o efeito da
  Memory menor (a serialização explícita caiu 1,69 -> 1,32 CPU).
- **O `warm` total não mudou de forma visível (16,4–17,0).** Ganhos de 0,03–0,5
  somem no ruído de carga entre janelas (creeps 32–36 chamadas/tick; miner de
  10 para 13 chamadas; `hauler.pickLoad` de 0,97 para 0,33 entre duas janelas
  seguidas). O `script` pareado também carrega o tick frio (~170/151 = +1,1).
- O tick frio de cada deploy custa **167–183 CPU** (confirma o pico de ~197).
- `swingTrade`: o scan de 120 ticks custa ~18 CPU, sendo `market.bookAll`
  (~5, chamada do motor), `policy.*` (~3,6) e `observe` (~3,4, recalcula
  `available/deficit`). Média ~0,15 CPU/tick: não vale mais trabalho agora.
- Probes: `assignments` 95,9–96,7% e `listResidual` 96,5–96,8% de repetição.

**O que sobra de lógica, em ordem de tamanho (janela 4:21 PM):**

| Bloco | CPU/tick | Natureza |
|---|---:|---|
| `hauler.pick*`, `stockPolicy`, `terminalFuel`, `chainFeed`, `minerFeedTower` | ~2,8 | decisão por hauler ocioso; varre ops/claims; **estado quente** |
| `claims.reserve.*` | ~0,3 | varredura de ops/ordens/cadeias por consulta (2,2 consultas/tick) |
| `terminalOps` (`sell:listed` 0,43 + resto) | 0,83 | estado estacionário; 96,5% das chamadas repetem entradas |
| `craft.chains` | 0,57 | `labPolicy.*` + `startItem` |
| `miner.distribute` + `builder.opportunistic` | 1,56 | em boa parte é intent (~0,2 por ação) |
| intents (`move`, `harvest`, `upgrade`, `transfer`...) | ~3,5–4,2 | **piso**: só diminui com menos ações (camada de unidades) |

**Conclusão:** a camada de lógica "segura e barata" está praticamente esgotada
(~0,6–0,7 CPU entregues). O que resta nela exige memo/cache de decisões quentes
(hauler e claims) com oráculo de equivalência, e rende ~0,5–1,0. Para chegar
perto de 10, a camada de **unidades** (menos creeps/ações, boosts, power creeps)
passa a ser necessária, como já previsto na seção 13.3.
