# Revisão de CPU — ARK-116 — 2026-10-13

Estado: revisão concluída; implementação e validação live do próximo pacote
pendentes. Nenhuma alteração de runtime ou sincronização durante esta revisão.

## Referência e objetivo

Janela de60ticks at83632050:16,670 CPU/tick, entry0,052; probe83632060,
bucket489. A janela anterior20,169 incluía inicialização/entry0,906.
Limite observado20CPU/tick. Meta imediata<15; preferencial<10.

| Módulo | CPU/tick | Participação aproximada |
|---|---:|---:|
| creep | 9,585 | 57,5% |
| plan | 2,077 | 12,5% |
| terminalOps | 1,069 | 6,4% |
| intel | 0,888 | 5,3% |
| structure | 0,860 | 5,2% |
| craftPlanner | 0,641 | 3,8% |
| spawn | 0,434 | 2,6% |
| market | 0,224 | 1,3% |

Dentro de creep: hauler3,493/6creeps; pioneer2,470/8;
builder1,365/3,283; miner1,354/8,167; upgrader0,532/3.
São médias de chamadas por tick; população/atividade podem mudar na janela.

Para15, cortar1,670CPU/tick (~10%). Para10, cortar6,670 (~40%).
Mesmo eliminando hipoteticamente todo plan, restariam14,593: chegar a10
exige melhorar também execução/decisão/logística dos creeps.

Spans incluem filhos. Não somar hauler.pickMineralJob0,941,
stockPolicy0,754 e terminalFuel0,690: são chamadas aninhadas.
Da mesma forma, travel1,864 inclui graphRoute0,308 e moveFallback1,162,
este inclui native1,079. O custo de um span é teto do ganho disponível
naquela região, não previsão de quanto será economizado.

## P0 — preservar visualização contínua sem reconstruir o plano a cada tick

Evidência live adicional do usuário:

```json
[{"visualizeEnabled":true,"visualizeForceInterval":1},[["E1N45",6,true,13],["E1N47",7,true,13],["E5N41",2,true,13],["E6N41",1,true,13],["W7N49",8,true,13]]]
```

Todas as salas estão planned=true. Em [architect.js](../src/rooms/architect.js),
planCity executa visualização/manutenção antes de retornar para salas prontas;
floodFill fica depois desse retorno. O custo atual não é floodFill.
planScanDue força redraw com intervalo1; visualizeStructures recria o conjunto
de estruturas construídas, varre todo o plano e desenha cada entrada ausente.
Salas RCL1/2 ainda exibem grande parte do plano futuro.

Reprodução offline usando os módulos atuais, plano estável de200entradas,
60ticks, construção sem trabalho novo: intervalo1 gera12000chamadas de
desenho, intervalo50 gera400. Contagem de trabalho, não medição de CPU live.

Proposta: camada do planner serializada no heap via RoomVisual.export/import,
reapresentada a cada tick. Reconstruir quando mudarem plano, estrutura/tile,
RCL ou opções visuais; incluir fallback periódico e reset do heap. Isolar a
camada para não copiar/apagar visuais de outros subsistemas. Detectar mudanças
reais mesmo que contagens de estruturas sejam iguais. Nenhum desenho em Memory.
O intervalo de reconstrução deve ser separado da reapresentação contínua.

RoomVisual.import acrescenta o desenho exportado ao tick atual:
[documentação oficial](https://docs.screeps.com/api/#RoomVisual.import) e
[engine](https://github.com/screeps/engine/blob/master/src/game/rooms.js).

Risco: baixo a médio, concentrado na invalidação e composição das camadas.
Aceitação: mesmo desenho visível em ticks estáveis; construção/destruição,
mudança de RCL, replan, toggle e reset atualizam sem duplicar outras camadas.
Medir plan.visualize, plan.build e tempo total de plan. Ganho live ainda não
quantificado; teto do módulo2,077 e construção continuará consumindo CPU.

Alívio reversível sem deploy: planVisual(50) reduz redraws; o overlay passa
a ser emitido em ticks de atualização. planVisual(false) desliga o overlay.
O cache proposto preserva a apresentação contínua desejada pelo intervalo1.

## P1 — previsão de combustível proporcional ao trabalho ativo

[terminalFuel.plan](../src/utils/terminalFuel.js) varre todas as operações
persistidas, inclusive encerradas, e calcula frete de todas as transferências
antes de escolher as primeiras terminalFuel.transactions (default2).
[terminalOps.activeIds/activeForRoom](../src/utils/terminalOps.js) já mantém
índice de operações ativas; a previsão atual não o utiliza.

Reprodução offline:1000operações completed e100transferências elegíveis
produzem1000leituras de estados encerrados e100calcTransactionCost para
forecast.transactions=2 e reserva480 (dois fretes200 +20% de margem).

Proposta em duas partes verificáveis:

1. Reutilizar índice de operações ativas; checar estado/campos vivos por decisão
   e filtrar sourceRoom. Tratar criações, cancelamentos e reaberturas de forma
   explícita. Não cachear o forecast completo entre decisões.
2. Ordenar candidatos pela prioridade/tick e avaliar elegibilidade/frete até
   preencher a janela. Somar carga/taxas já financiadas de todas as operações,
   mesmo quando o candidato não entrar no forecast. Candidato inviável precisa
   permitir o próximo. Compartilhar frete idêntico somente dentro da decisão.

Risco: médio por envolver proteção quantitativa de energia/carga.
Aceitação: resultados iguais em compras de energia, transferências de energia,
outras cargas, escassez, quote expirada, fee já carregada, pendingDeal,
sentTick e estoque insuficiente; mutações no mesmo tick vistas pela próxima
decisão.100transferências elegíveis devem exigir apenas as2selecionadas
(ou1cálculo se quantidade/destino idênticos); candidato inviável pode exigir mais.
Medir terminalFuel0,690 e hauler total3,493 sem somar spans aninhados.

## P1 — builder emitir trabalho efetivo sem solicitar build repetido

[builder.run](../src/roles/builder.js) chama opportunisticWork antes de
invokeState. Um builder ao alcance de um site pode solicitar build nesse
site e novamente em seu estado Build; o segundo pedido pode ser o mesmo
alvo ou outro. Reproduzido offline:2solicitações no mesmo tick.
[runBuild](../src/prototypes/creep.js) também credita o ledger quando retorna OK;
opportunisticWork já faz crédito. Há risco de contabilizar trabalho duplicado.

Repair e build também têm precedência no servidor, não são duas ações
independentes garantidas:
[dispatcher oficial de intents](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/intents.js).

Proposta: resolver a ação efetiva de build/repair uma vez, conservar a
prioridade de reparo crítico e usar trabalho oportunista quando a ação
principal ainda requer deslocamento. Movimento pode continuar no mesmo tick.
Creditar somente o trabalho efetivo planejado. Usar seleção linear em vez de
sortBy(...)[0] quando empate/ordem puderem ser preservados exatamente.

Risco: médio: a prioridade da execução efetiva não deve mudar inadvertidamente.
Aceitação: alvo crítico, destino distante, Build já em alcance, site terminado,
energia insuficiente e mudança de estado. Uma solicitação de build no cenário
duplicado, créditos consistentes e mesmo resultado efetivo do engine.
opportunistic0,444 mede também a ação útil; não é0,444CPU descartável.

## P2 — executar passos de travessia já conhecidos

[routing.travelToRoom/moveToRoom](../src/utils/routing.js) já centraliza
as viagens e separa claim antecipado de trânsito incremental. A regressão
de full-trip search dos pioneers foi removida; realSearch não aparece na
janela de referência. O trecho native ainda mede1,079CPU/tick em3calls.
[move.travel](../src/utils/move.js) entrega movimento entre salas ao engine,
mesmo quando _move contém caminho válido.

Proposta: para modo incremental, executar creep.move no próximo passo
serializado validado, após checar sala, destino, TTL, política, avoid,
adjacência, parede e progresso. Caminho ausente/expirado/incompatível/desviado
volta a moveTo. Preservar clearance, bordas, recuo e invalidação por stall.
Não executar sequência com base em um path de outra sala; não consumir passo
antes de observar que o creep realmente avançou. Inicialmente com flag.

Risco: médio a alto, exige matriz de regressões de movimento; prioridade
abaixo dos desperdícios já reproduzidos. Custo de creep.move e travessias
novas continua existindo, logo1,079não é ganho integral disponível.
Aceitação: mesmo próximo tile/intent; redução de chamadas a moveTo em caminho
estável; recuperação de fadiga, shove, bloqueio, nova restrição, expiração,
troca de destino, canto de sala e reset. Formação tática permanece precisa.

## P2 — logística com menos viagens, mantendo produção

[pioneering.js](../src/rooms/pioneering.js) limita pioneers por par
mãe/destino, não pela ajuda total no destino. Defaults permitem30hops,
2pioneers por par e autoscaleMaxCount6por mãe. A base da política permite
várias mães ajudar o mesmo destino independentemente. Com8pioneers,
2,470CPU/tick é um alvo importante além do custo do algoritmo de movimento.

Proposta: orçamento global de resgate por destino, contando WORK útil,
energia transportada, tempo de chegada, creeps existentes e capacidade
local. Preferir mães próximas e disponíveis, mantendo fallback quando
as próximas estiverem sem energia/spawn/rota segura. Evitar novos reforços
distantes quando a ajuda comprometida já resolve a missão. Preservar creeps
existentes; nenhuma morte forçada como ferramenta de otimização.

Haulers: procurar lotes pequenos/reversos repetidos, tempo vazio, carga útil
por viagem e distribuição de jobs. Reservas e escassez precisam permanecer
vivas; jobs auxiliares podem aguardar lote útil quando não houver urgência.
Dimensionar população por throughput e backlog, com fallback para recuperação.

Risco: alto por alterar estratégia/população; requer spec de comportamento.
Aceitação: energia entregue, tempo até spawn construído, reação a perdas,
produção por source e starvation dos consumidores. Redução de CPU só conta
como ganho quando a missão/produção se mantiverem, não quando o trabalho parar.
Esta frente é necessária para ambicionar10com o império/população atuais,
mas o ganho concreto precisa ser medido; não há promessa numérica.

## P3 — cortes secundários e pontos já atendidos

- roomCache já centraliza buscas e tipos; census já evita passes globais
  repetidos. config.get já cacheia path.split. Reimplementar esses caches não
  trará novidade. Evitar cache global de stock/commitments sem invalidação.
- roomCache.structuresInRange ainda percorre a lista completa. Índice espacial
  por sala/epoch ou vizinhança estática por source pode reduzir scans dos miners.
  Troca de topologia e stores vivos devem ser preservados. miner.distribute0,354
  já inclui ações úteis; miner.batchTransfer já existe e está enabled por default.
- needs.compute0,190 já tem TTL e veto sob ataque. spawn0,434 é alvo secundário,
  sem retardar substituição de miners nem defesa para melhorar a média.
- intel0,888 inclui10,1salas/tick; trânsito dinâmico/ataques continuam críticos.
  Dados estáticos podem ser separados do evento vivo. Revisar getters/repetições
  antes de aumentar intervalo de segurança.
- structure0,860: tower0,522 domina; já há listas compartilhadas de repair/heal/
  hostis. Eventuais lotes de reparo devem preservar emergência; não desligar
  reparo/defesa indiscriminadamente. Link/craft/lab cooldowns já limitam ações.
- terminalOps1,069 executa a cada5ticks; cotação filtrada/frete local já existem.
  market0,224 tem pico13,262: revisar escalonamento e reuse de livros existentes
  sem atribuir CPU média de um pico isolado. swingTrade não aparece nesta janela;
  não extrapolar como se estivesse ativo e barato permanentemente.
- craftPlanner0,641: plano de labs já usa caches; assignments0,146/resolve0,074
  são alvos menores que visualização, hauler e população. Manter execução das
  reações e atualização de reservas.
- Meter/profiler: os spans são inclusivos e funções só aparecem durante profile.
  cpuProbe pode quantificar overhead quando bucket permitir. Remover medição
  sem separar seu custo real não comprova otimização do bot.
- Reset: agrupar mudanças validadas em uma sincronização. Evitar reconstrução
  pesada de caches em bloco; aquecer sob orçamento mantendo fallback operacional.
- Flood fill: fora do pacote recorrente. As5salas prontas retornam antes dele.
  Não alterar geometry/layout sem perfil que mostre ganho relevante.

## Pacote recomendado e validação de ganho real

Primeiro pacote: cache da camada visual + previsão ativa/lazy de combustível
+ execução efetiva do builder + spans de manutenção/decisão para atribuição.
Testar cada mudança isoladamente offline; combinar apenas os cortes aprovados
pelas regressões e sincronizar uma vez. Passo direto de travessia pode entrar
quando cumprir toda a matriz de segurança, não só um benchmark favorável.
Coordenação de resgate/throughput é a próxima frente estratégica.

Verificações: node --check, smoke integrado e grunt; counts das reproduções
antes/depois e invariantes de frescor/segurança/produção. Os probes desta revisão
carregaram smoke com sucesso e rodaram fora do jogo; nenhum resultado em ms
local foi convertido para unidades de CPU do Screeps.

Live: primeira janela de60ticks mostra cold start; usar também a seguinte sem
reset para conferir custo recorrente. Comparar mesmas salas, população, craft,
trabalho de construção e mercado ativo. Acompanhar mean e picos por tick
(não soma de maxima de módulos), bucket e trabalho concluído. Confirmar<15
em várias janelas e depois tendência mais longa conforme o bucket se recuperar.
Não exigir esperar15min com bucket crítico para detectar regressão evidente.

Porcentagens/meta são aritmética do snapshot. Contagens são reproduções
offline. Reduções de CPU futuras são hipóteses até medição live.
