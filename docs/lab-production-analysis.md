# Produção multinível nos labs — investigação ARK-97

Data: 2026-10-11. Escopo: diagnóstico estático, simulação offline e proposta;
nenhuma configuração de produção foi alterada. A imagem não revela a fila,
o conteúdo dos reagentes nem as configurações do servidor.

## Resultado atualizado — ARK-99

A comparação ampliada está em [lab-search-report.md](lab-search-report.md), com
1.950 cenários e 119.704 avaliações físicas de candidatos/referências. A conclusão
anterior abaixo fica preservada como histórico, mas a recomendação passa a ser
escolher pelo tempo medido entre largo, ondas, pipeline e reutilização adaptativa.

Para 3.000 XLH2O com transporte instantâneo, a melhor referência passou de 65.908
para 21.971 ticks em RCL6 e de 16.436 para 13.366 em RCL7. Rotacionar saídas e
usar labs em cooldown como entradas foi decisivo. Em RCL8, o melhor encontrado
empatou com largo em 8.186 ticks. Com vazão agregada de 2 unidades/tick e troca
sem atraso, o pipeline em RCL8 venceu: 12.624 contra 13.028 ticks da referência.

Foram avaliados vários intermediários produzindo e fornecendo ao mesmo tempo:
os vencedores chegam a seis labs simultâneos em dupla função. A busca exata
provou ótimo em 18 casos pequenos; dois atingiram 200.000 estados. A heurística
não prova ótimo global. Em RCL6/XLH2O/3.000, o limite inferior independente de
21.936 ticks deixa no máximo 35 ticks de melhoria possível no modelo instantâneo.

O planejador antigo não fornece ondas para XGH2O/XGHO2 (`no-phase-plan`, 390
cenários); largo continua disponível em todos. Essa ausência é registrada nos
resultados e não conta como derrota simulada. Logística agregada não reproduz
os haulers reais; a proposta de runtime continua em ARK-98, Backlog.

## Resultado original — referência histórica

Usar **dois labs de entrada e todos os demais como saída em cada etapa** é
o melhor padrão para lotes grandes neste stamp, quando o transporte acompanha.
Uma cadeia simultânea com intermediários produzidos/consumidos no próprio lab
é legal e pode economizar transporte, mas reserva mais labs para matérias-primas
e não maximiza a capacidade de reação. Recomenda-se seleção adaptativa entre
`wide`, ondas e pequenos pipelines, com tempo de transporte e troca explícitos.

Não existe 100% de chamadas de reação por tick: há cooldown obrigatório.
Medir utilização das oportunidades de reação de cada saída, separando cooldown,
falta de reagente, saída cheia, troca, reserva para boost e indisponibilidade RCL.
No modo largo, 10/10 labs participam e 8/10 produzem; os dois restantes fornecem
reagentes. Um snapshot visual não mede a utilização ao longo do lote.

## Regras conferidas

- Cada reação normal consome 5 unidades **de cada** reagente e produz 5.
- Cada saída precisa estar a alcance Chebyshev <= 2 de ambas as entradas;
  as entradas não precisam estar a alcance 2 uma da outra.
- Várias saídas podem compartilhar o mesmo par de entradas.
- Só o lab que executa `runReaction` recebe cooldown. Um lab em cooldown
  continua válido como entrada. Portanto `A+B→C` e `C+D→E` podem coexistir
  usando o lab de C como produtor e fornecedor.
- Um lab contém apenas um mineral por vez, até 3.000 unidades. Essa dupla função
  exige que o mineral produzido seja exatamente o consumido pela próxima etapa.
- A validação da API lê o estado do início do tick. Não depender do intermediário
  criado no mesmo tick nem da ordem de processamento de intents. Manter buffers
  e reservar reagentes compartilhados; `OK` indica agendamento, não execução final.
- `PWR_OPERATE_LAB` altera quantidade produzida **e consumida**. Está fora das
  simulações abaixo e precisa entrar no planejador futuro.

Fontes primárias:
[API StructureLab](https://docs.screeps.com/api/#StructureLab.runReaction),
[validação da API no engine](https://github.com/screeps/engine/blob/master/src/game/structures.js#L289),
[execução da reação](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/run-reaction.js),
[constantes oficiais](https://github.com/screeps/common/blob/master/lib/constants.js).

## Código e causa da ociosidade

Consulta inicial via `graphify query`, seguida de leitura dos módulos apontados.
O grafo é estrutural: `labSlots` apareceu como binding de `craftChain.js`; o
comportamento abaixo foi confirmado no fonte, não inferido de uma aresta.

1. `src/utils/labSlots.js`: `planPhases` já compara `waves` e `wide`.
   `planWide` usa entradas 1/2 em todas as etapas. `auto` só aceita `wide`
   com ganho estimado >= 20% (`craft.wideMinGain`). `waves` usa uma saída por
   intermediário e múltiplas apenas na etapa final. Não há pipeline contínuo:
   ondas só agrupam etapas independentes e esperam a onda inteira terminar.
2. `src/utils/craftChain.js:146`: `buildQueue` grava entradas/saídas de cada
   etapa. `startItem` exige dreno de minerais incompatíveis. `groupAt`/`advance`
   implementam as barreiras. A estratégia vem da fila persistida, não muda
   automaticamente quando configuração/código mudam.
3. `src/utils/craftChain.js:757`: `craftReplan(roomName)` existe, mas só troca
   etapas ainda não iniciadas e exige compatibilidade da ordem dos produtos.
   Pode recusar uma fila antiga de ondas porque a fila larga tem outra ordem.
   A etapa já em execução permanece como está.
4. `src/structures/lab.js`: executa todas as saídas declaradas, cada uma com seu
   cooldown. Não é esse dispatcher que impõe uma única saída.
5. `src/rooms/refining.js:14`: a configuração manual `setLabReaction` escolhe
   apenas uma saída, mesmo com dez labs. É outra explicação possível para a imagem.
6. `src/utils/craftPlanner.js`: estimativa usa lotes/cooldowns reais por receita;
   não modela vazão do hauler nem custo real de troca. O limiar fixo de 20%
   apenas tenta compensar isso. A fila não persiste um resumo da estratégia:
   `queue.strategy` é propriedade extra de array e desaparece na serialização.
7. `src/utils/nonEnergyLogistics.js`/`transientStock.js` e hauler integram carga,
   retenção e dreno. Um pipeline futuro precisa preservar labs que produzem e
   fornecem o mesmo intermediário e priorizar carga/dreno por risco de stall.

Logo, **uma saída intermediária é comportamento deliberado de `waves`**.
Em RCL7/8, uma fila nova XLH2O de lote grande já escolhe `wide` com os defaults.
Para o caso vivo, ainda falta distinguir fila antiga, override, reação manual,
versão não publicada, falta de reagente e bloqueio de transporte. A imagem
isolada não permite afirmar qual deles ocorreu.

Diagnóstico somente leitura no console do jogo:

```js
craftConfig(true)
craftStatus()
Memory.rooms["SUA_SALA"].labReaction
Memory.rooms["SUA_SALA"].labReactions
```

Inspecionar especialmente `wideLabs`, `labStrategy` e os `outputs` de cada
item pendente/ativo. Não executar `craftReplan` às cegas: ele altera a fila.

## Layout fixo e RCL

Os offsets de `labSlots.OFFSETS` reproduzem o stamp sem rotação:

```text
4  6  .  3
5  .  1  .
.  2  .  7
10 .  8  9
```

RCL6 constrói 1–3; RCL7, 1–6; RCL8, 1–10.
As entradas 1/2 alcançam todas as saídas: respectivamente 1, 4 e 8.
Foram enumerados os **968 subconjuntos** com pelo menos três labs:
nos 255 contendo ambos os centrais, esse par sempre atinge o máximo `N-2`.
Sem os centrais, é necessário buscar o melhor par dos labs efetivamente ativos;
53 subconjuntos não admitem sequer um trio válido. Estes casos representam
construção parcial/destruição, não a progressão normal do stamp.

## Simulações reproduzíveis

Executar `node docs/lab-production-simulation.cjs`.
Resultados completos: `docs/lab-production-results.json`.

O harness usa **o planejador real** (`labSlots.planPhases`) e um executor
idealizado por tick, com cooldown individual conservado entre fases, alcance,
capacidade de 3.000, consumo concorrente reservado, estoque inicial exato e
limite de produção por etapa. Não é o executor real nem o engine completo.
Carga/dreno são instantâneos, sem creeps, CPU, mercado, boosts ou powers.
A carga ideal limita reagentes ao saldo da etapa; isso não demonstra que o
hauler atual tenha essa limitação. Cada lote de 3.000 verifica 2.400 reações,
conservação dos recursos e 3.000 unidades finais.

Exemplo: fabricar 3.000 XLH2O desde H/O/L/X, sem intermediários em estoque.
Cooldowns oficiais: OH=20, LH=15, LH2O=10, **XLH2O=65**.

| RCL | Labs | Ondas: ticks | Largo: ticks | Escolha atual `auto` | Ganho de velocidade largo |
|---|---:|---:|---:|---|---:|
| 6 | 3 | 65.908 | 65.936 | ondas | nenhum |
| 7 | 6 | 27.658 | 16.436 | largo | 1,68× |
| 8 | 10 | 22.783 | 8.186 | largo | 2,78× |

As estimativas atuais para RCL8 são 22.875/8.250: incluem cooldowns completos;
o simulador termina após a última reação, sem esperar seu cooldown final.
A spec 0116 e fixtures do smoke usam XLH2O=60 em exemplos sintéticos;
isso explica os números anteriores ~22.500/~7.900, mas não é evidência de
erro na leitura das constantes do servidor.

Pipeline completo viável encontrado por busca de atribuição:
H=1, O=3, L=4, X=8, OH=6, LH=5, LH2O=2; XLH2O nas saídas 7/9/10.
Os labs 6/5/2 produzem e alimentam a etapa seguinte ao mesmo tempo.
Tempo: **12.978 ticks**. Limite estacionário: `3×5/65 ≈ 0,231 unidade/tick`,
contra `8×5/(20+15+10+65) ≈ 0,364` do modo largo.
Enumerar as distribuições dos seis labs produtores entre as quatro reações
confirma esse limite para um pipeline completo **fixo**, com um lab por
matéria-prima e sem transportar intermediários entre labs. Não prova ótimo
global de todo escalonamento híbrido possível.

Sensibilidade a lote, RCL8, sem atraso de transporte:

| Quantidade final | Ondas | Largo | Escolha atual |
|---:|---:|---:|---|
| 5 | 3 ticks | 4 ticks | ondas |
| 20 | 93 ticks | 22 ticks | largo |
| 100 | 703 ticks | 242 ticks | largo |
| 500 | 3.753 ticks | 1.342 ticks | largo |
| 3.000 | 22.783 ticks | 8.186 ticks | largo |

Foram simuladas barreiras de 0/10/50/200 ticks por transição. Em RCL8,
com 200, largo=8.744 e ondas=23.183. Isso modela somente espera de troca:
**não simula hauler, distância, viagens ou vazão contínua**.

## Transporte muda a decisão

Para este lote, o modo largo move 36.000 unidades nas interfaces dos labs:
duas entradas + uma saída em cada uma das quatro etapas. O pipeline move
18.000: matérias-primas (incluindo H duas vezes) + produto final, sem levar
intermediários ao storage. Não são contagens de viagens ou de ações de creep.

Se `B` é a vazão agregada efetiva em unidades/tick nessas interfaces:

- limite otimista largo: `max(8.186, 36.000/B)`;
- limite otimista pipeline: `max(12.978, 18.000/B)`.

Em B=2, esses limites são 18.000 contra 12.978; em B=4, 9.000 contra 12.978.
O cruzamento aproximado B≈2,77 sinaliza quando investigar pipeline, **não é
um benchmark de hauler nem garantia de vitória**: as precedências, viagens,
buffers e disputas podem aumentar ambos os tempos.
O pico largo ocorre em LH2O: 4 unidades/tick por entrada e 4 de saída,
12 unidades/tick agregadas. Comparar também esses picos, não só a média.

## Proposta

1. Tornar explícito o plano ativo: estratégia persistida, entradas, saídas,
   saldo por produto e razão de espera por lab. Diagnosticar o caso vivo antes
   de qualquer migração. Considerar apenas labs construídos e `isActive()`.
2. Generalizar a busca de par (`O(N³)`, N<=10, cache no heap pela topologia),
   preservando 1/2 quando são ótimos. Aplicar a otimização também à reação manual.
3. Usar largo como candidato principal de lotes grandes em todas as etapas.
   Reaproveitar reagentes compatíveis e escalonar saídas por cooldown restante.
   Reduzir barreiras ao necessário; não drenar recursos compatíveis sem motivo.
4. Estimar `T` com reação + preenchimento + dreno + troca, considerando saldo,
   estoque, capacidade, powers e topologia real. Comparar alternativas com os
   mesmos custos; substituir o desconto arbitrário de 20% por custos medidos.
5. Adicionar candidatos híbridos apenas onde compensam: independentes com
   saídas proporcionais ao trabalho/cooldown e pipelines curtos com buffers.
   Maximizar produto útil por tick; não ocupar lab com intermediário sem demanda.
6. Tornar cargas e reações conscientes do saldo: reservar consumo entre saídas,
   evitar superprodução no último burst e reabastecer antes da próxima oportunidade.
   Priorizar dreno pela iminência de saída cheia e carga pela de entrada vazia.
7. Migrar filas só em barreiras seguras, por identidade da etapa/dependência;
   preservar etapas concluídas/em andamento e não depender da ordem anterior.
8. Validar por tempo até o lote final, vazão efetiva e motivos de espera.
   Depois medir em produção a vazão do transporte antes de escolher pipeline.

O primeiro incremento deve resolver observabilidade, par ótimo e largo nas
etapas elegíveis. O pipeline adaptativo vem depois, se a medição de transporte
justificar sua complexidade. Spec proposta: `0127-lab-throughput-planning`.
