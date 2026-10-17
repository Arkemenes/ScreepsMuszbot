# Planejamento integrado — CPU, população, boosts e power

- **Revisão:** v1.1 de execução, 2026-10-16. A base documental r2 foi revisada independentemente; a decisão posterior do usuário adia histórico sofisticado e autoriza implementação incremental.
- **Acompanhamento:** [ARK-141](https://linear.app/arkemenes/issue/ARK-141/fechar-contratos-e-rastreabilidade-do-planejamento-integrado-0148-0157), filha de ARK-128.
- **Escopo vigente:** implementação local em etapas no [plano de execução incremental](plano-execucao-incremental-2026-10-16.md), que prevalece para sequência/autorizações e adiamento do histórico persistente. Primeiro pacote exclusivamente offline; gates de ativação/investimento preservados.
- **Autoridades:** specs por feature definem comportamento/AC; este documento define sequência e aceite integrado. Linear é fonte de tarefas. Análises de 15/10 e proposta inicial são histórico.
- **Revisão independente:** [parecer/reavaliação](revisao-final-planejamento-2026-10-16.md) e [resposta](resposta-revisao-final-planejamento-2026-10-16.md). R1–R6 fechados no desenho; sem bloqueador material remanescente identificado.

## 1. Resultado pretendido e escolhas fechadas no desenho

| Tema | Decisão documental | Autoridade |
|---|---|---|
| Oráculo | Projetar clones executados e estado pós-exceção; conservar cache por sequência e isolar variantes | [0156](../specs/features/0156-cpu-logic-remaining/spec.md) |
| Energia | Slots substituíveis/canceláveis e prioridades; teto RCL8 por controller/tick; gasto continua estimado | [0154](../specs/features/0154-energy-report-experiments/spec.md) |
| Readiness | Entrega por consumidor/prazo, renda líquida, canais compartilhados e admissão viva por owner | [0157](../specs/features/0157-operational-readiness/spec.md) |
| Métricas | Utilização energética por ação, ocupação ponderada por trabalhador/tick e produção/gasto separados | [0157](../specs/features/0157-operational-readiness/spec.md) |
| Cobertura | Inicialmente heap limitado e gaps explícitos; publicação/ack duráveis DEFERRED até necessidade demonstrada | [0157](../specs/features/0157-operational-readiness/spec.md) |
| Boost | labBoostReservations canônica, seleção real por count, cleanup independente de idle drain e takeover/quarentena explícitos | [0149](../specs/features/0149-lab-boosts/spec.md) |
| Reset do boost | Reconciliar corpo/pending e cancelar preparação automática; não retomar plano antigo | [0149](../specs/features/0149-lab-boosts/spec.md) |
| Reação operada | Primitive comum no modelo/runtime/executor; strict default, boundedSurplus opt-in orçado; término confirmado | [0150](../specs/features/0150-power-creeps/spec.md) |
| Emergência | Piso independente e deduplicado, após autoscale/override; defesa/essenciais precedem builder emergencial | [0148](../specs/features/0148-on-demand-population/spec.md) |
| Experimento | Overlay removível por owner/geração, sem restaurar escrevendo sobre configuração-base | [0154](../specs/features/0154-energy-report-experiments/spec.md) |
| Power off | Separar processamento, economia e gestão safe/manual; GPL/cancelamento consumados são irreversíveis | [0150](../specs/features/0150-power-creeps/spec.md) |
| Mercado | Sete dias é cancelamento gerido; diferenciar refund potencial da expiração natural | [0153](../specs/features/0153-listing-policy-review/spec.md) |

Scope de cadeia usa receita/política canônica, não ID de lote. Fases e reservas temporárias sob a mesma política são estados observados; mudanças de política/pool/pin persistente criam nova coorte. Cache continua invalidando por mutação viva, sem confundir assinatura de decisão com identidade estatística.

A execução incremental mantém esses contratos; persistência sofisticada é condicional. Checkboxes só avançam com evidência do pacote, sem concluir aceite live por teste offline.

## 2. DAG técnico e pacotes isoláveis

Estado de execução: 0156-A offline concluído; etapa 2/T1–T2 de 0154-A implementada localmente ([entrega](entrega-0154-a-2026-10-16.md)). Fluxos/waits gerais, relatórios/experimentos e validação live permanecem pendentes. A tabela mantém entregas previstas mais amplas.

| Pacote | Entrega futura | Pré-requisitos técnicos |
|---|---|---|
| 0156-A | Reparo/autoteste/isolamento do oráculo | Fixtures e autorização do pacote |
| 0154-A | Slots, fluxos atribuídos, waits e qualidade | Fontes observáveis; testes diretos, sem depender do oráculo |
| 0153-A | Política pura e testes de listagem/pixel/taxas/prazos | Independente de 0154/0156 |
| 0157-A | Contexto/cálculo/admissão/utilização e cobertura inicial no heap, sem protocolo persistente | Eventos 0154-A; census/roomCache/claims vivos |
| 0154-B | energyReport e experimento por overlay | 0154-A + contrato 0157-A |
| 0155-A | Observação final/confirmacão/relatório de labs | cobertura/qualidade inicial no heap e contrato de origem do executor |
| 0149-A | Adaptador de reservas e integração de todos os leitores | Contrato 0149 + claims/readiness; sem exigir piloto boost |
| 0156-B/L2 | Otimização de listagens | 0156-A + política 0153 revisada como referência |
| 0156-B/L3 | Otimização de seleção/geometria de labs | 0156-A + observação 0155 + adaptador 0149-A |
| 0148 piloto | População sob demanda numa sala elegível | Readiness + experimento/medição 0154; autorização operacional própria |
| 0149 piloto | XLH2O próprio em builder, sem compra | 0149-A + benefício/demanda/entrega válidos + medição; autorização própria |
| 0150 fase 0 | Processamento para target GPL configurado | GPL/quotes/retorno e orçamento atual válidos, reconciliação de logística; autorização própria |
| 0150 labs | Compatibilidade de quantidades/quotas/confirmacão/modelo | Contrato 0150; testes diretos e ledger/owners compatíveis |
| 0150 fase 2 | Operador opt-in/manual após gate | Compatibilidade completa + 48h de baseline do regime atual + gargalo marginal/ops/reagentes/transporte/venda |
| Expansão | Mais salas, compostos, níveis/poderes | Resultado do piloto e revalidação do novo regime; autorização separada |

0154-A é observação; 0157-A é cálculo/contexto; 0154-B é apresentação. Não há ciclo de require proposto.
0156 inteira não bloqueia todos os pilotos. L4/L7/O3 seguem contratos próprios; L6 exige spec/revisão de latência separada.
Fase 0 não depende de reações operadas; seus gates econômicos continuam obrigatórios. Falta de retorno demonstrável não é suprida pela ausência dessa dependência.

Ordem de organização recomendada: fundamentos isolados → contrato comum → relatórios/experimentos → otimizações por item e pilotos elegíveis → compatibilidade/operador → nova evidência antes de expansão.
Mudança intencional de política usa AC diretos; equivalência é exigida apenas onde a meta é preservar comportamento.

## 3. Configuração inicial proposta, sem ativação

| Parâmetro | Valor/regra proposta | Natureza |
|---|---|---|
| power.targetLevel | 3; metas maiores só configuradas manualmente | Decisão registrada do dono: marco inicial, não teto |
| power.enabled / creep.enabled | false | Opt-in futuro |
| power.creep.managed | false até adoção explícita; safe quando managed=true e economia off | Off total só pela entrega manual documentada |
| power.allowCancel | false; dry-run primeiro | Cancelamento inteiro mínimo por número de ordens, livre primeiro |
| power.maxPaybackDays | 30 | Default econômico a calibrar |
| power.hysteresisFraction | 0.20: entrar <=24 dias; pausar >30; banda mantém preferência | Distinto de readiness.margin |
| power.reviewTicks | 1500 | Cadência de preferência; não estende quote/readiness |
| Listagem gerida | cancelar aos 7 dias reais; manual/pixel protegidos | Não confundir com expiração natural do servidor |
| Pixel listMargin / minBid | 0.03 / referência confiável×0.95 | Profundidade/piso/fees executáveis permanecem gates |
| readiness.margin | 0.20 | Margem conservadora, não adequação provada |
| Readiness histórica | janela600 ticks, seis subjanelas100, cobertura>=0.95, idade<=1 tick | Contexto de saldo/admissão sempre vivo |
| Coverage | >=172800000ms observados, frações temporal/conhecida>=0.95; evidência auditável | Gate de operador preservado; sem exigir infraestrutura persistente inicial |
| Coverage limite (DEFERRED) | 4 escopos×até3 buckets×6 métricas; bucket<=2048; coverage<=32768 unidades UTF-16 | Alocação sob demanda, piloto uma sala |
| Coverage recibos (DEFERRED) | Até32/8192 unidades no executor; coverage+recibos<=40960; publish/replay/ack idempotente | Memória de recuperação, sem journal ilimitado |
| Coverage flush/gap (DEFERRED) | até100 ticks / maxObservedGapMs=30000 | Gap maior desconhecido, sem tick-rate fixo |
| Boost cleanup | 300ticks até quarentena; reavaliar25ticks; pin assume custódia externa | Sem retorno fictício ao pool |
| Boost deadline | até100 ticks desde vinculação ao creep, reduzido pelo horizonte rentável | Default de logística proposto |
| Cancelamento | poolAfterCancel lastreado; até1000nós de busca; unknown sem prova | remaining nominal não prova liberação |
| QuotaMode | strict; boundedSurplus somente opt-in com custo autorizado | Preservar quantidades/tetos estritos |
| Reação stall | 300 ticks após próxima oportunidade conhecida | Replanejar, preservar material |

Esses números não foram calibrados com dados atuais. Nenhum habilita gasto na ausência de validade/readiness.
Requisitos de segurança (proteção/renew) não dependem de preferência econômica válida; controle manual explícito encerra a gestão automática.
0152 permanece aprovada, incluindo os backoffs de cinco ticks já autorizados; não reabrir essa decisão.

## 4. Fontes do motor, fatos e limites

Fatos locais desta análise: oráculo projeta mundo original e reproduz equal:true para claims10/999; ledger original creditava imediatamente (reparado localmente na etapa 2/T1–T2); leitores atuais usam labBoostReservations; modelo/executor assumem lotes5; fase espera quota zerada.
As specs descrevem reparos futuros, não código já corrigido.

Fontes primárias públicas consultadas em 16/10:
- [Prioridades](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/intents.js): presença de repair suprime build; upgrade é independente; fluxos de store precedem trabalho.
- [runReaction](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/run-reaction.js): quantidade depende do efeito e consome a mesma quantidade de ambos os inputs.
- [upgradeController](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/upgradeController.js): teto compartilhado por objeto de processamento; efeito do controller tem corte próprio.
- [Mercado](https://github.com/screeps/engine/blob/master/src/processor/global-intents/market.js): cancelamento e expiração têm caminhos diferentes.

Os links master são referências de pesquisa, não fixtures pinadas. A futura tarefa de fixture deve fixar commit/constants, registrar resultado e, antes de ativar, confrontar comportamentos necessários com o servidor. A revisão instalada não foi identificada; não depender de obter um SHA privado indisponível.
Informações do parecer sobre o último tick observado/driver e reproduções adicionais são evidência do revisor anterior, com o mesmo limite de versão; nem todos esses testes foram reexecutados nesta consolidação.

Warm15.97, cold167–197, taxa3.88M, estoque/preços/GPL antigos são dados históricos. Retorno de OPERATE_LAB, margem20% adequada e ganho de CPU dos caches continuam hipóteses até evidência operacional.

## 5. Matriz de aceite offline e operacional

Cada tasks.md mapeia AC para tarefa e assertion futura. Strings de assertions são nomes propostos, não testes já escritos.

| Feature | Offline obrigatório | Evidência operacional separada |
|---|---|---|
| 0148 | Demanda/capacidade/precedência/emergência/fallback/nenhum candidato; overlay e recuperação | Ausência real, vida de creep+manutenção, trabalho útil, gasto torre, CPU e tempo até reposição trabalhar |
| 0149 | Benefício puro por ação/TTL, reserva canônica em todos os leitores, seleção real por count/corpo inteiro/parcial/reset/off/pin/deadline/cleanup/quarentena | Espera/custo de logística/lab e benefício atribuível no piloto de composto próprio |
| 0150 | GPL/targets/banda/readiness, dry-run/cancelamento, lifecycle e todos os níveis/quotas/caudas | Fase0 consumo/GPL; baseline48h; operador produção final/ops/venda/CPU/payback realizado |
| 0153 | Quotes/fees/procedência/idade/pixel/proteções/off-pending/cancelamento-expiração | Taxas novas, liquidez e execução real sob política ativada |
| 0154 | Slots reais do builder, movimentos desconhecidos, RCL8 em dois ticks, métricas/overlay/manual/ABA | Custo de observação, qualidade atribuível e experimento funcional |
| 0155 | Observação final deduplicada, origem, saída/final, denominadores, coverage/regime | 48h representativas e gargalo da cadeia completa com abastecimento/venda |
| 0156 | Autoteste do oráculo, sequências, invariantes por item, reset/off/intratick | Custo completo de cache/assinatura, spans comparáveis, warm/cold e resets |
| 0157 | Core: estoque entregue/compromissos/concorrência/qualidade/gaps; previsão avançada e protocolo durável DEFERRED | Qualidade real, overhead e calibração; relógio simulado não produz dados reais |

Na consolidação documental original, build e testes de código não foram executados. A execução posterior 0156-A e seus resultados estão no [registro da entrega](entrega-0156-a-2026-10-16.md). DoD de código futuro mantém node --check, smoke, build, atualização do graphify e docs coerentes. O Grunt atual chama mergeFiles e pode copiar ao cliente; não executá-lo como se fosse build isolado. Na futura entrega de código, executar Grunt em processo-filho com LOCALAPPDATA direcionado somente a uma pasta temporária validada dentro da workspace; o script atual deriva dali o destino da cópia. Verificar destino absoluto antes do build e conservar intacto o ambiente persistente do usuário. Isso permite build/cópia de teste sem publicar no cliente real; não é necessário mudar tooling nesta entrega. Nenhum comando de deploy é implícito na autorização de planejar.

## 6. Falhas e autoria de efeitos

A tabela completa está nos specs/plans. Invariantes integradas:
- Off de política impede novas decisões opcionais; reconciliação de submitted/pending e segurança gerida seguem.
- Reset não repete intent por ausência de cache. Reconciliar executor/owners, cancelar reservas não submetidas e abrir lacuna de cobertura.
- Edição manual revoga geração/plano antes de novo gasto; overlay de experimento jamais reescreve base. ABA direto não tem intenção detectável e não é prometido.
- Deadline/morte encerra owner idempotentemente; aplicação boost parcial é conferida no corpo; pin posterior preservado.
- Quota impossível replaneja com motivo; produção uncertain bloqueia dependência. Drenar não equivale a completar quota.
- Custo já incorrido, GPL, taxa e ordem cancelada não são revertidos por flag/rollback.
- Gasto opcional não reduz piso de defesa/spawn/manutenção/trabalho útil; fallback preserva trabalho em faixas preteridas.

## 7. Encerramento documental anterior — histórico

Revisão independente de agente sem autoria do planejamento concluída; seis achados materiais corrigidos e reavaliados, incluindo complemento de prefixos/ACK e escopo estatístico estável. Veredito favorável à conclusão documental, sem implementação/live concluídos.
Checagens documentais: links locais válidos,66AC referenciados nas tarefas futuras e checkboxes de execução abertos; diff check limpo. Fingerprint de154arquivos de runtime/test/tooling/dashboard idêntico ao início desta etapa. Nenhum smoke/build/graphify update/deploy executado.
ARK-141 encerra planejamento/documentação; issues de implementação permanecem Backlog e ARK-128 aberta. A decisão posterior do usuário autoriza execução local por etapas; o próximo agente segue o plano incremental vigente. Revisão favorável não é autorização operacional.
