# Execução incremental — CPU, população, boosts e power

- **Decisão do usuário, 16/10/2026:** plano aceito para implementação passo a passo; infraestrutura persistente sofisticada de histórico somente se a necessidade for demonstrada.
- **Autoridade de sequência:** este documento atualiza o escopo e as dependências do [planejamento integrado](planejamento-integrado-2026-10-16.md). Os contratos mecânicos/econômicos e AC das specs continuam válidos, com o componente persistente da 0157 explicitamente adiado.
- **Linear:** ARK-128 acompanha o resultado global; ARK-139 as otimizações; [ARK-142](https://linear.app/arkemenes/issue/ARK-142/0156-a-corrigir-e-validar-o-oraculo-offline-de-equivalencia) isola o primeiro pacote. ARK-141 concluiu o planejamento anterior, não a implementação das features.
- **Execução:** alterações locais em pacotes pequenos estão autorizadas. Publicação, ativação, experimentos live e investimentos seguem os gates operacionais abaixo. A primeira entrega é exclusivamente offline.

## Princípios de execução

1. Um pacote produz uma mudança verificável, com evidência própria e registro do que ficou aberto. Não agrupar uma otimização, uma política econômica e um piloto no mesmo aceite.
2. Preservar defesa, alimentação, manutenção, construção útil e progresso RCL/GCL. Queda de trabalho útil não é ganho de eficiência.
3. Falta de evidência bloqueia investimento opcional; não bloqueia o funcionamento essencial existente. Nenhum gate permite gastar saldo/canal já comprometido.
4. Reusar census, roomCache, claims, pending e reservas canônicas. Não criar outro scan global, ledger ou reserva concorrente. Guard, limites de loops e recuperação continuam obrigatórios.
5. Configuração-base/manual preservada. Features de investimento/experimento entram desligadas; seus flags off impedem novas decisões e mantêm reconciliação necessária. Reparos do ledger existente não ativam essas features. Reset não inventa confirmação.
6. Memory recebe apenas recuperação indispensável. Dados derivados e observações locais ficam no heap, limitados; lacuna/reset aparece como unknown. Não criar Memory.coverage, journal por tick ou protocolo publish/replay/ack nesta primeira execução.
7. CPU de otimização, overhead de observação e retorno econômico são avaliações distintas. Não somar probes antigos nem declarar ganho Screeps por benchmark Node.

## Etapas e dependências

A ordem numérica organiza a execução. A coluna de dependências identifica os bloqueios técnicos reais; uma etapa sem dependência de outra não herda um gate artificial. Cada integração de produção tem aceite offline e operacional separados.

| Etapa | Entrega e limite do pacote | Dependências | Aceite para avançar |
|---|---|---|---|
| 0 | Registrar decisões, sequência, alterações preexistentes e baseline antes de cada pacote | Nenhuma | Issues existentes; fonte de verdade atualizada; arquivos alheios preservados |
| 1 | **0156-A: corrigir oráculo offline**: mundos executados, erros/estado parcial, sequências quentes e isolamento | Fixtures próprias; ARK-142 | Divergências deliberadas detectadas; pares equivalentes passam; checks locais; nenhum src/ alterado |
| 2 | **0154-A: corrigir contabilidade de intents de trabalho**: substituição/cancelamento/prioridades, RCL8 compartilhado e qualidade | Fontes/fixtures mecânicas; independente de 1 | Não duplicar gasto; separar estimativa de confirmação; observação sem novo scan global |
| 3 | **0153-A: política de listagens**: decisão pura, taxas incrementais, prazos reais e proteção manual/pixel; integrar manutenção em pacote controlado | Testes diretos; independente de 2 | Decisões/taxas/quantidades/prazos corretos; pending reconciliado no off; efeitos irreversíveis explicitados |
| 4 | **0156-B/L2: otimizar listagens**: reaproveitar cálculo puro, mantendo manutenção viva | 1 e referência 3 revisada | Equivalência de intents/fees/claims/estado; custo completo do cache menor em carga comparável |
| 5 | **0157-core: disponibilidade conservadora**: estoque entregue conhecido, compromissos e admissão por owner; utilização/qualidade em janela de heap | 2 e claims existentes | Dois consumidores não usam a mesma sobra; entrega não comprovada dá unknown; essenciais continuam funcionando |
| 6 | **0154-B: energyReport e experimento mínimo**: uma sala, uma configuração, overlay removível | 2 e 5 | Gasto/efeito/ocupação separados; ausência de dados explícita; remoção do overlay preserva edição manual e invalida decisão antes do spawn |
| 7 | **0155: observação dos labs**: estado final por lab/tick, esperas, entradas e produto final confirmado | 5; origem dos resultados do executor | Observar inclusive em cache hit/sem atribuição; não somar intermediários como venda final; custo de coleta medido |
| 8 | **0149-A: adaptar reserva de boost existente** e todos os leitores | 5; contrato 0149 | Uma autoridade para planner/runtime/executor/hauler/claims; nenhum lab ou reagente prometido duas vezes |
| 9 | **0156-B/L3: otimizar seleção/geometria dos labs** | 1, 7 e 8 | Mesmo planejamento/efeitos/pending; observação viva preservada; ganho líquido medido |
| 10 | **0156/L4, L7, O3: outros ganhos comprovados**, um item por entrega | Contrato local e medição; 1 onde houver equivalência | Eventos sem atraso; cold/recuperação preservados; remoção de migração só sem dependentes; 0152 não é reaberta |
| 11 | **0148: população sob demanda**, com recuperação e piloto em uma sala | 5 e 6 | Demanda útil, manutenção, capacidade e tempo de reposição cobertos; piloto sem reciclar vivos; ausência real observada |
| 12 | **0149: piloto de XLH2O próprio em builders**, sem compra automática | 5, 6, 7 e 8 | Benefício por ação/TTL cobre composto/energia/logística/lab; spawn não espera; parcial/reset/off/cleanup seguros |
| 13 | **0150/fase 0: GPL**, plano explicável e processamento de power livre | 5; GPL/quotes/custos/retorno atuais; logística reconciliada | Target inicial 3 configurável, custo restante real; sem novos anúncios de power; allowCancel=false; consumo/GPL confirmados |
| 14 | **0150/labs: compatibilidade com OPERATE_LAB**, sem ativar operator | Contrato mecânico pinado; reservas/pending compatíveis | Quantidade comum no modelo/runtime/executor; insumos completos; quota strict por padrão; concorrência e caudas terminam corretamente |
| 15 | **0150/operator: avaliar e, se aprovado pelo gate, executar piloto** | 7, 13, 14 e evidência representativa de pelo menos 48h observadas | Gargalo real de reação; reagentes/transporte/ops/venda disponíveis; retorno marginal; criação/upgrade manuais e gestão opt-in |
| 16 | **Expandir salas, compostos ou poderes**, uma dimensão por vez | Resultado útil dos pilotos; novo regime reavaliado | Produção, margem, recuperação e CPU sustentáveis em escala; não extrapolar automaticamente uma sala para dez |

Etapa 13 não depende de 14/15 e pode ser avaliada antes dos pilotos 11/12, mantendo seus próprios gates. Etapas 4 e 10 podem preceder observabilidade mais ampla. A infraestrutura adiada não é pré-requisito das etapas 1–14.

## Histórico: decisão explícita de adiar

O protocolo persistente da seção 4 da 0157 e a tarefa 0157/T4 ficam **deferred**, como referência de requisitos para uma eventual solução. Não serão implementados preventivamente. Os limites antigos de tamanho não são uma autorização para ocupar Memory.

Primeira versão: janelas/resumos limitados no heap e saídas dos relatórios/telemetria existente. Reset, desligamento, mudança de regime e falta de amostra geram lacuna ou reiniciam a janela; nunca viram zero conhecido nem continuidade presumida. Não se promete histórico de 48h através de resets.

O gate de 48h de operator permanece. Pode usar evidência externa auditável ou uma janela contínua comprovada, com regime/qualidade/tempo efetivamente observado identificados. Se não houver evidência suficiente, o piloto não avança. Evidência externa não dispensa os critérios de origem, qualidade e ausência de dupla contagem.

Só reconsiderar persistência se houver uma decisão operacional concreta bloqueada, e se ficar demonstrado que heap, relatório externo e telemetria existente não atendem. Antes de construir: registrar o caso, comparar uma solução menor, estimar tamanho/serialização/CPU, fixar orçamento e revisar o desenho. O antigo protocolo completo não é automaticamente a solução escolhida.

Também ficam condicionais: previsão temporal avançada de abastecimento; busca automática de cancelamentos; boundedSurplus; compra de boosts; ampliação de roles/poderes; factory avançada. Scans fatiados continuam exigindo contrato próprio de latência/frescor/urgência/justiça.

## Aceite de cada pacote

### Offline

- Reproduzir o problema antes do reparo; teste que observa comportamento/efeitos, não apenas ausência de exceção.
- Fixtures mecânicas fixam fontes/constants quando necessárias. O oráculo não emula o motor nem prova observáveis omitidos pelo adaptador.
- node --check em todos os JS tocados, smoke com raiz absoluta, diff check e build local. O grunt padrão copia ao cliente; validar com LOCALAPPDATA apenas do processo-filho apontando para graphify-out/validation-<etapa>/build, conferido dentro do workspace.
- graphify update . após código. Specs/tasks/roadmap atualizados, sem concluir a feature inteira quando apenas um pacote terminou.
- Preservar alterações preexistentes. Não publicar, ativar feature, cancelar ordem nem criar/alterar operator como efeito do check local.

### CPU e comportamento em jogo

- Coletar baseline atual, com versão, salas, creeps, labs, ordens, produção e cobertura. Usar CPU cobrada/bucket e custo total; separar warm, cold e frequência de reset.
- Comparar carga/regime equivalentes, média e picos/percentis, trabalho útil, manutenção, progresso, ordens/contabilidade, Memory e custo de recuperação.
- Para otimizações: assinatura+invalidação+cache+efeitos precisam custar menos que a referência. Abaixo de 15/tick, idealmente 10, continua objetivo global; nenhuma etapa garante esse resultado antecipadamente.
- Para observadores: fixar teto incremental de CPU/Memory a partir da baseline antes de ampliar escopo; começar numa sala. Ainda não há baseline atual para escolher um teto numérico honesto. Estouro do orçamento reduz/desliga coleta opcional, mantendo o essencial.
- Para investimentos: benefício realizado precisa cobrir custos de insumos, energia, transporte, espera, lab, ops e oportunidade. Expansão pode aumentar CPU; deve caber no orçamento e justificar o aumento.
- Preparar reversão por flag/configuração; desligar impede gastos futuros, mas não desfaz boosts/GPL/taxas/cancelamentos nem ressuscita trabalhador. Observar a recuperação real.

## Registro das entregas

| Etapa | Situação | Evidência |
|---|---|---|
| 0 | Documentada | Este plano e rastreio Linear; histórico sofisticado adiado explicitamente |
| 1 | Concluída localmente | [Entrega 0156-A](entrega-0156-a-2026-10-16.md): 28 autotestes OK; smoke11616 OK/zero falhas após ajuste autorizado do teste do dashboard; build isolado/checks/grafo OK; cliente preservado |
| 2 | T1/T2 publicados pelo usuário | [Entrega 0154-A](entrega-0154-a-2026-10-16.md), ARK-143; qualidade local mínima, sem concluir T3 geral/B nem overhead live |
| 3 | 0153-A1 físico implementado localmente | [Pacote](pacote-local-listagens-2026-10-16.md); pixel automático e aceite live pendentes |
| 4 | L2-book implementado localmente | Reutilização de livro existente, sem cache geral de decisões; equivalência e menos consultas offline; CPU live pendente |
| 5–16 | Pendentes | Gates e AC acima; sem ativação nesta entrega |

Avanço autônomo posterior: etapa3 foi dividida em A1 físico (local) e A2 pixel (pendente). A etapa4 entregou somente compartilhamento da fonte de livro, comparado com consultas diretas sob a mesma política física; cache geral de decisões depende do restante da referência0153. Próximos: fechar integração pixel/ownership e0157-core, sem ativar investimentos. Coleta ampliada/T3 somente quando necessária aos consumidores das etapas 5/6, com dado faltante explicitamente unknown. Nenhum ganho de CPU é atribuído ao reparo do oráculo: ele é exclusivamente offline.

## Prioridade funcional atualizada — 16/10/2026

Por orientação do usuário, avançar boosts em paralelo à investigação de CPU, sem aguardar concluir toda a fila de otimizações. A fundação 0149-A tem implementação local parcial; [entrega e próximos passos](entrega-0149-a-2026-10-16.md). Economia/readiness mínimo, bundle/writer e confirmação/cleanup precedem o piloto. Não exigir população sob demanda, meta global <15 CPU ou histórico persistente sofisticado para desenvolver o boost. Gates de gasto e ativação permanecem aplicáveis.

## Progresso autônomo — pacote0149-B

Implementados localmente cálculo de retorno, checker puro de prefixos e preparação física com haulers/claims/lifecycle. Núcleo puro de confirmação não está ligado a intent de boost. [Pacote e limites](pacote-boost-2026-10-16.md). Não ativado/deployado. Próximo gate funcional: contexto observado/admissão de canais e combustível futuro, depois executor/confirmacão e piloto controlado. Persistência sofisticada continua adiada.
