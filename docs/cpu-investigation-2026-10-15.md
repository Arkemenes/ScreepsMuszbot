# CPU e telemetria — ARK-128 / ARK-130 — 15/10/2026

Alvo atual: CPU efetivamente cobrada <15/tick, ideal <10. Pacote buildado e
copiado ao cliente após o usuário fornecer a amostra anterior. `[cpuBalance]`
é parte de `cpuTop()`, não outro comando. CPU sustentada após este pacote
continua pendente. Usuário confirmou atualização do exporter/Grafana externos;
validação dos novos pontos e cobertura de coleta ainda pendente.

## Referência live anterior ao pacote

Saída fornecida pelo usuário às12:21:14: balanço600/600intervalos válidos,
83663992..83664591, cobrança17,702CPU/tick, script pareado15,136,
residual2,565, folga2,298, sem missing end/invalid/gaps. Para ficar abaixo15,
falta reduzir mais de2,702CPU/tick na carga dessa amostra. Não atribuir todo
residual à serialização sem evidência nova.

cpuTop parcial20ticks83664573..83664592: script13,17, medidos10400ticks
desde reset. Seus módulos/spans não são médias dos600intervalos do balanço:
hauler3,292, miner1,875, upgrader1,433, builder1,422; craft1,239 e
terminal1,051. working1,007/startItem0,851/assignments0,452 são aninhados;
sell:listed0,667, hauler.pickMineralJob0,841 e builder.opportunistic0,630
orientam investigação posterior sem prometer soma de ganhos independentes.

## Primeira janela após publicação (12:25:56)

Usuário esclarece que execução anterior tinha aproximadamente10h de relógio;
exporter/Grafana estão em servidor externo. Novo cpuTop fechou os primeiros
60ticks83664601..83664660 após reset; medidos60desde reset. Script19,97,
entry0,904/pico50,60. Balanço59/59intervalos83664601..83664659:
cobrança22,136, scriptpareado19,895, residual2,241, folga-2,136,
missingEnd/invalid/skipped0. Mercado1,297/pico47,58, swing1,111/pico22,81,
craft2,404/pico33,33. Esses dados incluem inicialização; não demonstram
regressão aquecida nem ganho do pacote contra600intervalos anteriores.
Mesmo removendo mentalmente um pico, não se obtém medição warm válida.

Investigação adicional sem alterar runtime/build:

- `listResidual` atualiza referência swing antes do gate de reprice; reference
  filtra amostras do recurso e da energia em cada consulta. Probe isolado
  sobre a função de produção,100consultas de venda idênticas e100amostras:
  200chamadas a market.samples e20000campos de preço inspecionados. Custo
  repetido reproduzido; nenhuma estimativa de CPU Screeps derivada disso.
  Próximo desenho: resumo histórico compartilhado por versão das amostras,
  com preços/idade/prontidão/config vivos. Não atrasar atualização de limite
  econômico nem apenas mover o gate, pois extensões precisam do limite atual.
- Experimento não aplicado em assignments trocou sort por seleção simples.
  Em100decisões, leituras de estoque3labs900→1100,7labs6800→3600,
  10labs10100→5300, com assignments idênticas nesses casos. Variante rejeitada
  como patch geral porque piora3labs; falta ramo eficiente e regressões amplas.
- Fontes temporárias dos probes foram removidas. Sem novo deploy, mantendo
  a janela aquecida do bundle154BF67B…1E9A33. Arquivos externos ainda não
  aplicados; acesso/configuração efetivos do servidor continuam desconhecidos.

## Amostra12:42:04 e frescor da referência

Usuário confirmou atualização do exporter/Grafana externos. Validação dos
novos pontos de mercado/T3 e métricas de cobertura ainda não fornecida.

Balanço298/298intervalos83664601..83664898:cobrança17,849,
scriptpareado15,544/residual2,305/folga2,151; sem falta de end/invalid/gaps.
cpuTop parcial59ticks83664841..83664899/script15,63; medidos299desde reset.
Como o balanço começa no mesmo tick do inicial59intervalos e não há evicção
do ring, diferença ponderada isola239intervalos83664660..83664898:
CPU cobrada≈16,791, script≈14,470, residual≈2,321. Valores aproximados pelo
arredondamento dos logs. Mesmo excluindo primeiros59intervalos, meta<15
permanece aberta. Módulos/spans da parcial59 não são médias desses239ticks.

O probe de100referências descrito acima executou todas no MESMO Game.time,
sem alterar as100amostras. Não demonstrou que preços possam ficar congelados
entre ticks. Um resumo histórico compartilhado deve invalidar quando amostras
mudarem e continuar lendo preço/prontidão/config/idade atuais. Nenhuma mudança
de reference foi aplicada nesta rodada; build permanece154BF67B…1E9A33.

## Resumo histórico implementado após confirmação dos gráficos

Usuário confirmou gráficos corrigidos, encerrando ARK-130. Foco retomado na
ARK-128. `market.sampleSummary` cacheia somente contagens válidas buy/sell
e seus últimos ticks. Preços e todas as condições de `reference` permanecem
lidos em cada decisão. Histórico canônico é read-only para consumidores;
coleta/poda invalidam o WeakMap, hidratação troca identidade e reset limpa.
Provider substituído recebe análise direta, incluindo alterações intratick.
O retorno copia escalares para o consumidor não corromper o cache.

`swingReferenceCpuCases` carrega coletor real e compara com a referência
anterior em ambos os lados de recurso/energia. Testes falharam antes e passam
após correção:100consultas/100amostras fazem20000→400leituras históricas
frias; 3/5/10salas com100decisões cada não varrem novamente após aquecimento,
mesmo avançando tick. São contadores, não medição de CPU Screeps.

Regressões: alterações intratick de preço de referência/energia, minSamples,
prontidão; vencimento sem scan; nova coleta no tick; poda mantendo tamanho;
provider mutável; retorno defensivo; reset e hidratação substituindo histórico
parcial. Smoke11516verde e syntaxchecks limpos. Não mudar intervalo de
listings, limites, fretes, intents, cooldown ou cadências para obter esse ganho.
`marketPricing.stats` já tem cache; sem alterações por especulação ali.

Meta de CPU cobrada<15 (ideal<10) continua pendente. Referência mais recente
comparável excluindo primeira janela:16,791/239intervalos (aproximada por
diferença de somas arredondadas), sem atribuir causalidade à carga do bot.

Publicado: grunt111, bundle syntaxcheck limpo, cópia automática EPERM resolvida
por cópia pontual elevada. SHA256 dist=cliente
`19CD89F88164325AC3AF44A1E912B7DEF587EF2863E406C34589ACC8320A8BAB`.
Python exporter/dashboard e diffcheck verdes; graphify4576nós/9342arestas,
com os mesmos avisos de extração sequencial/versão e labels antigos.
ARK-128 continua In Progress até comparação de cobrança aquecida. Sem commit.

## Consulta física por decisão (pacote anterior)

`craft.startItem`/`craftEnergy` e `terminalOps.saleAvailable` somavam
`physicalFree(storage)` e `physicalFree(terminal)`. Cada chamada repetia
operações, listings, cadeias e warehouse/ledger. `physicalPool` compartilha
esse cálculo apenas dentro da decisão; não retém saldo ou reservas entre
consultas. Mantém clamps individuais, frete/cargo aceitos, owner, recebimentos
e retiradas. Fonte vazia continua evitando análise. Nenhuma cadência mudou.

Reprodutor: `node test/economyScaleCases.js` e integração no smoke.
Matriz3/5/10salas ×3/7/10consumidores por sala ×0/20/100listings por sala.
Cada listing tem operação ativa; adicionar500finais varia histórico separado.

| Salas | Consumidores/sala | Scans antes | Scans depois (frio e aquecido) |
|---|---:|---:|---:|
| 3 | 3 / 7 / 10 | 18 / 42 / 60 | 9 / 21 / 30 |
| 5 | 3 / 7 / 10 | 30 / 70 / 100 | 15 / 35 / 50 |
| 10 | 3 / 7 / 10 | 60 / 140 / 200 | 30 / 70 / 100 |

No extremo são1000operações ativas/listings, além de500finais. O índice
enumera histórico uma vez/tick; o livro filtrado faz1chamada API para todos
os consumidores do mesmo recurso/lado. Os cenários não criam novos negócios,
operações ou recibos: contagem de trabalho preexistente não é taxa de negócios.
Essas taxas reais continuam dependendo de amostra live. A seleção ainda
visita listings/ops por decisão; não foi demonstrada capacidade de10salas
abaixo da meta de CPU, nem conversão dos contadores em CPU Screeps.

`labPolicyCases` executa9mundos simultâneos3/5/10salas ×3/7/10labs, com
transporte, cooldown e confirmação pelo engine simulado. Lote pequeno5XLH2O
por sala termina em15/6/4ticks, respectivamente; assignments ficam no máximo
uma chamada por sala/tick. Isso comprova execução/conservação no cenário,
não custo de lotes longos, busca fria de catálogo ou escala completa do bot.
Geometria já usa cache em labPlanModel.trios; nenhuma correção adicional ali.

## Gráficos e janela recente

Falhas reproduzidas antes da correção:

- Exporter retinha compras/vendas ausentes da janela.
- Caminho leve de stats não atualizava mercado entre publicações completas.
- `rooms.<room>.compoundsT3` nunca era publicado por stats.
- `recentEvents` filtrava/recriava o array em cada consumidor, apesar de seu
  comentário prometer poda única. Cache agora depende de identidade,
  quantidade, janela, expiração e avanço de tick; eventos são append-only.

Mercado soma eventos confirmados por lado/recurso e expira no limite exato,
com zeros explícitos preservados via snapshot. Cache evita recomputar ocioso;
nunca soma snapshots repetidos. T3 publica storage+terminal, como minerais
base: não é produção nem inclui labs/cargo. Exporter zera/remova séries de
mercado, minerais e T3 desaparecidas. Painéis222/233/234/241 atualizados;
layout e demais painéis preservados por comparação semântica. Índice Git
estava vazio no início e não foi alterado.

`Memory.stats.telemetry` informa tick real, início inclusivo e tamanho da
janela. Exporter publica intervalo observado, repetição, cobertura e gap
em ticks. Intervalo75 para janela60 produz gap15; intervalo60 cobre a
janela; repetir coleta não adiciona eventos e não apaga gap anterior.
Primeira coleta, reset temporal ou bot legado informam cobertura desconhecida.
Série vermelha no Terminal Network mostra ticks sem cobertura em eixo próprio.

O default externo continua120segundos, independente de60ticks. Sem acesso ao
serviço/configuração efetiva não foi verificado se coletas cobrem a janela.
Uma Gauge não garante entrega de eventos sob gaps: não se inventou contador
cumulativo nem se prometeu recuperação de eventos já expirados. É necessário
aplicar exporter/dashboard e observar delta real; ajustar cadência conforme
Game.time e limites efetivos do serviço. Grunt não publica esses serviços.

## Validação e continuação

- JS syntax checks, smoke11459assertions e Python exporter/dashboard verdes.
- `graphify update .`:4563nós/9321arestas; AST sequencial após paralelismo
  indisponível. Avisos de skills0.9.62 versus CLI0.9.64 e nomes de comunidades
  antigos não foram tratados como falha do runtime.
- `npx grunt`:111módulos, bundle passou node --check. Cópia automática recebeu
  EPERM do sandbox; cópia pontual com permissão elevada foi concluída. SHA256
  dist=cliente `154BF67BB345E5392C277CB065F8B82BF5416AF2AB90FF95215EEB312C1E9A33`.
- Pendente: validação funcional/cobertura externa; janela aquecida
  comparável com cobertura/população/carga; investigação seguinte orientada
  por custo dos consumidores. ARK-128 e ARK-130 continuam In Progress.
