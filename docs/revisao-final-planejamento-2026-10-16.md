# Revisão independente do planejamento consolidado

> **Veredito atual: favorável à conclusão documental do planejamento integrado r2**, incluindo as precisões de protocolo e regime conferidas na reavaliação. R1–R6 estão fechados no desenho. Veja a [reavaliação da candidata r2](#reavaliação-da-candidata-r2). Isso não autoriza implementação ou ativação.

## Parecer r1 — histórico preservado

O texto e as referências de linha desta primeira rodada correspondem à candidata r1. O veredito vigente está na reavaliação ao final.

Data: 2026-10-16. Issue documental: ARK-141. Objeto: candidata **r1** do [planejamento integrado](planejamento-integrado-2026-10-16.md) e spec/plan/tasks de 0148, 0149, 0150 e 0153–0157.

**Veredito: planejamento parcialmente pronto para futura autorização por pacote.** A candidata resolve substancialmente os bloqueadores do parecer anterior, mas ainda precisa fechar os seis achados abaixo antes de ser chamada de versão final integrada. Isso é revisão do desenho; não é aprovação de implementação, ativação, desempenho ou retorno live.

O revisor não foi autor da candidata. O autor manteve os arquivos normativos estáveis durante esta leitura. Sugestões de correção recebidas durante a revisão não são tratadas como correções já incorporadas. A investigação e esta escrita não alteraram código, configuração, jogo, Linear ou outros documentos; não executaram build, smoke completo, graphify update, commit ou deploy.

## Método e natureza da evidência

- **F — fato:** texto atual inspecionado, código local consultado, comportamento do código público consultado ou cálculo pequeno reproduzido. Um fato sobre o motor público não identifica a versão do servidor do usuário.
- **I — inferência:** consequência do contrato diante de um cenário permitido; não é alegação de incidente observado no jogo.
- **H — hipótese:** adequação econômica, previsão ou ganho ainda dependente de medição operacional.
- **D — histórico:** informações anteriores, inclusive números do parecer anterior, sem nova atualização live.

Foram lidos AGENTS.md/RTK, constituição, workflow, trechos pertinentes da arquitetura e roadmap, prompt da revisão, integrado, os 24 spec/plan/tasks e o histórico da proposta/parecer. O grafo existente foi consultado antes das buscas; serve de orientação, pois é anterior à candidata. Os achados abaixo foram conferidos nos arquivos atuais. Inspeções de código usaram consultas direcionadas, incluindo reservas físicas, drenagem, executor e oráculo.

## Achados materiais

### R1 — Alta — índices de partes desejadas não são uma operação oferecida por boostCreep

**Local:** [0149 spec:32](../specs/features/0149-lab-boosts/spec.md#L32), [0149 spec:40](../specs/features/0149-lab-boosts/spec.md#L40), [0149 plan:17](../specs/features/0149-lab-boosts/plan.md#L17) e [0149 plan:19](../specs/features/0149-lab-boosts/plan.md#L19).

**F:** o registro usa eligiblePartIndexes, o cálculo considera partes elegíveis e o plano diz que a segunda aplicação só inclui índices ainda elegíveis. A API pública recebe apenas bodyPartsCount. O [handler público boost-creep.js](https://raw.githubusercontent.com/screeps/engine/master/src/processor/intents/labs/boost-creep.js) filtra partes não boostadas compatíveis sem exigir hits positivo, inverte a ordem para partes diferentes de TOUGH e toma a quantidade solicitada. A [API pública no motor](https://raw.githubusercontent.com/screeps/engine/master/src/game/structures.js) não recebe uma lista de índices.

**Contraexemplo — I:** corpo com WORK[0] vivo e WORK[1] destruído, ambos sem boost. O planejador considera apenas WORK[0] rentável e pede uma parte. Na seleção pública consultada, o índice escolhido é 1. Há consumo de composto/energia sem o benefício atribuído ao WORK vivo. O cálculo read-only dessa seleção retornou selectedIndexes=[1] e zero WORK vivo selecionado. Mesmo sem dano, guardar índices em ordem diferente da ordem do motor pode fazer a confirmação procurar as partes erradas e preparar nova aplicação desnecessária.

**Impacto:** retorno superestimado, custos em partes sem capacidade produtiva e confirmação/reaplicação incorretas. É bloqueador do contrato de aplicação e benefício da 0149.

**Correção concreta:** definir uma função de seleção do subconjunto efetivamente atingível por bodyPartsCount, conforme motor/constants da fixture. O benefício deve usar esse subconjunto, incluindo partes danificadas selecionáveis e seus custos; se ele não for rentável, não aplicar. Índices são observação/previsão da seleção do motor, nunca argumento da API. Confirmar alterações no corpo inteiro, reavaliar quantidade e custo após parcial e não pressupor capacidade de saltar partes arbitrárias. Incluir AC/tarefa/assertion de ordem inversa, parte destruída no subconjunto, corpo misto e parcial. Confrontar o comportamento necessário com o servidor antes de ativar; a versão instalada continua desconhecida.

### R2 — Alta — o resumo persistente não distingue a qualidade de cada população usada no gate

**Local:** [0157 spec:65](../specs/features/0157-operational-readiness/spec.md#L65), [0157 spec:75](../specs/features/0157-operational-readiness/spec.md#L75), [0155 spec:19](../specs/features/0155-lab-utilization/spec.md#L19), [0155 spec:32](../specs/features/0155-lab-utilization/spec.md#L32) e [0157 tasks:19](../specs/features/0157-operational-readiness/tasks.md#L19).

**F:** o bucket enumera labTicks, eligibleOutputTicks e knownLabTicks, com reasons agregado. O gate requer fração conhecida de pelo menos 0,95 do denominador de **cada** métrica econômica usada. As saídas elegíveis e todos os labs físicos têm denominadores diferentes.

**Contraexemplo — I:** duas histórias têm 100 labTicks, 10 eligibleOutputTicks, 95 knownLabTicks e cinco observações unknown. Na primeira, as cinco desconhecidas pertencem a saídas elegíveis: qualidade dessa população é 5/10. Na segunda, pertencem somente a entradas: qualidade das saídas é 10/10. Os totais enumerados são iguais, inclusive o motivo unknown, e os resultados de produção podem ser iguais. Um gate das saídas deve reprovar a primeira e pode aceitar a segunda. Não é possível recuperar a associação perdida usando somente esses agregados ou interpolando buckets.

Há também que fechar quais numeradores de utilização/estados sobrevivem: labTicks e eligibleOutputTicks não bastam para reconstruir utilização produtiva por população. Se a utilização por ação de WORK for usada economicamente no horizonte persistido, energySpentEstimated agregado não substitui os numeradores e a qualidade por ação. Um relatório curto no heap pode ter dados mais ricos; isso não resolve um gate que usa exclusivamente buckets persistidos.

**Impacto:** aprovação econômica com qualidade errada, ou bloqueio indiscriminado de uma janela válida. A regra de 48h fica temporalmente correta, mas semanticamente insuficiente para a conclusão declarada.

**Correção concreta:** enumerar estatísticas suficientes, unidades e tipos por métrica: por exemplo eligibleOutputTicks, knownEligibleOutputTicks e numeradores/estados dessa mesma população, além da disponibilidade física. Separar produção confirmada, estimativa conhecida e desconhecido. Persistir somente métricas realmente necessárias ao gate; métrica não reconstruível deve ser null/unknown e não sustentar aprovação. Estabelecer a associação de motivos às populações e recalcular o orçamento serializado com o esquema completo. AC/T4 devem incluir as duas histórias acima, correção tardia da qualidade e pior caso de tamanho. Não basta acrescentar um teste genérico de coverage.

### R3 — Média — monotonicidade do consumidor não fecha o protocolo de publicação/replay dos produtores

**Local:** [0157 spec:68](../specs/features/0157-operational-readiness/spec.md#L68), [0157 spec:72](../specs/features/0157-operational-readiness/spec.md#L72), [0157 plan:23](../specs/features/0157-operational-readiness/plan.md#L23) e [0154 spec:38](../specs/features/0154-energy-report-experiments/spec.md#L38).

**F:** o texto exige eventSeq monotônico por produtor e grava cursores com agregados, mas não define identidade/geração durável do produtor, emissão após reset, recibo de consumo ou responsabilidade por republicar o mesmo evento lógico com o mesmo identificador. Pendências continuam pertencendo a executores distintos.

**Contraexemplos — I:** após coverage persistir cursor 100, um produtor reconstruído com contador de heap reiniciado tem seus eventos novos rejeitados como replay. A exigência de monotonicidade impede essa implementação, mas não descreve como cumpri-la. Mesmo continuando em 101, um executor que volta a publicar uma confirmação já aplicada usando uma sequência nova pode duplicar produção: o cursor reconhece a sequência, não a identidade lógica da confirmação. Uma exceção entre publicação e encerramento do pending torna essa fronteira relevante, além do reset normal. Persistir cursor e soma juntos protege o consumidor, mas não especifica essa segunda metade do protocolo.

**Impacto:** perda prolongada de dados ou duplicação após recuperação; a cobertura pode ficar artificialmente válida ou inutilizável. A lacuna é de protocolo, não uma reprodução de duplicação no runtime atual, que ainda não implementa esses eventos.

**Correção concreta:** declarar owner da sequência, chave do produtor/geração e recuperação monotônica; definir ID estável do evento lógico, republicação e recibo/ack persistente compatível com o checkpoint. Não é necessário guardar um journal ilimitado: pode-se usar pending/recibo durável do executor e retenção limitada até consumo, ou outro protocolo explicitamente equivalente. Mudança de geração deve ter regra de ordenação e lacuna. Incluir testes de reset antes/depois do checkpoint, exceção entre publish/ack, replay do mesmo evento e confirmação tardia, sem transformar uma repetição em evento novo. Identidade perdida precisa produzir unknown, não contagem nova.

### R4 — Alta — draining normal pode nunca devolver o lab ao pool

**Local:** [0149 spec:38](../specs/features/0149-lab-boosts/spec.md#L38), [0149 spec:43](../specs/features/0149-lab-boosts/spec.md#L43), [0149 spec:56](../specs/features/0149-lab-boosts/spec.md#L56), [0149 plan:20](../specs/features/0149-lab-boosts/plan.md#L20). Código atual pertinente: [transientStock.js:55](../src/utils/transientStock.js#L55), [transientStock.js:84](../src/utils/transientStock.js#L84) e [hauler.js:1112](../src/roles/hauler.js#L1112).

**F:** o contrato mantém exclusão em draining até vazio/compatível e manda transientStock executar drenagem normal. A autoridade atual não oferece mineral à drenagem quando craft.drainIdleLabs=false; holds/labLoad/reação também podem fazer allowedMineral conservar o mineral. O hauler só cria o job a partir de excess.

**Contraexemplo — I:** preparação deixa XLH2O no lab; o prazo vence e a reserva entra em draining com craft.drainIdleLabs=false. Mesmo havendo hauler e destino, a drenagem normal não retorna mineral. O lab fica excluído sem prazo de encerramento, contrariando AC8. Também não se pode resolver simplesmente ignorando todos os holds: um pin manual posterior deve ser preservado, e pode ter assumido legitimamente o conteúdo.

**Impacto:** lab permanentemente indisponível para a cadeia e custo de oportunidade não limitado pelo deadline de boost. Timeout da preparação não é timeout do ownership.

**Correção concreta:** definir encerramento próprio, ainda na autoridade transientStock: obrigação de drenar material do owner automático ou entrega explícita a owner/pin compatível, sem depender do toggle geral de idle labs. Remover somente holds/jobs/claims da geração encerrada. Definir compatível objetivamente e distinguir espera por destino/transporte de transferência manual de ownership; sem condições físicas não prometer retorno imediato. Acrescentar stall guard, motivo e recuperação idempotente sem liberar um lab incompatível para uso automático. Testes de drainIdleLabs=false, hold antigo, destino indisponível, pin posterior e reset durante draining precisam aparecer na tarefa/assertion do lifecycle.

### R5 — Alta — mínimo por remainingAmount nominal pode cancelar ordens sem liberar power

**Local:** [0150 spec:51](../specs/features/0150-power-creeps/spec.md#L51), [0150 spec:52](../specs/features/0150-power-creeps/spec.md#L52), [0150 plan:18](../specs/features/0150-power-creeps/plan.md#L18) e [0150 tasks:17](../specs/features/0150-power-creeps/tasks.md#L17). Código de lastro: [terminalClaims.js:52](../src/utils/terminalClaims.js#L52) e [terminalClaims.js:102](../src/utils/terminalClaims.js#L102).

**Origem:** contraexemplo sugerido pela autoauditoria do autor durante esta revisão; conferido independentemente contra as fontes atuais e por cálculo. Não é achado independente de autoria do revisor nem incidente live.

**F:** a seleção propõe prefixo de quantidades decrescentes para minimizar número de ordens. physicalReservations pode acumular compromissos acima do físico; physicalFree/physicalPool limitam o resultado inferior a zero. remainingAmount é exposição, não liberação marginal garantida de estoque.

**Contraexemplo — I:** há 100 power físicos e duas listagens/reservas de 100 cada, com livre calculado zero; o lote desejado é 50. O prefixo nominal diz que basta cancelar uma ordem. Depois de cancelá-la, a outra ainda compromete todos os 100: livre continua zero. O cálculo reproduzido foi livre antes=0, após uma=0, após duas=100. Reconciliar e recalcular depois protege o processamento, mas não desfaz o primeiro cancelamento e não torna correto o dry-run original. Em múltiplos pools, escolher antes uma ordem grande sem lastro pode ainda cancelar mais IDs do que uma alternativa menor lastreada.

**Impacto:** cancelamento irreversível sem liberação prevista, objetivo de mínimo necessário não demonstrado e possível renúncia de restituição potencial sem benefício operacional. Definir apenas um objetivo nominal não satisfaz a escolha do usuário de liberar o necessário com cancelamento mínimo.

**Correção concreta:** simular a remoção dos compromissos normalizados no pool físico vivo e calcular liberação marginal entregável, preservando os demais owners. Se houver sobrecompromisso, identidade/lastro incertos ou busca sem prova, retornar unknown e não cancelar; isso é alternativa conservadora suficiente. Só aplicar o prefixo quando suas premissas de lastro/liberação forem verificadas. Revalidar depois de cada confirmação continua obrigatório. AC/T2–T3 devem cobrir reservas sobrepostas, ordem sem lastro, pools diferentes, mudança concorrente e ausência de cobertura total.

### R6 — Média — a aproximação por 16 intervalos pode impedir alimentação contínua viável

**Local:** [0157 spec:29](../specs/features/0157-operational-readiness/spec.md#L29), [0157 spec:35](../specs/features/0157-operational-readiness/spec.md#L35), [0157 spec:39](../specs/features/0157-operational-readiness/spec.md#L39), [0157 spec:81](../specs/features/0157-operational-readiness/spec.md#L81) e [0157 tasks:16](../specs/features/0157-operational-readiness/tasks.md#L16).

**F:** debita-se toda demanda de cada intervalo no início e oferta incerta no fim, com no máximo 16 intervalos. Essa aproximação é segura contra uma falsa aprovação, mas não representa genericamente as curvas contínuas de renda/demanda também propostas.

**Contraexemplo — I, cálculo puro:** localFree=12, oferta líquida sustentada de 1,2/tick, demanda de 1/tick, H=600 e margin=0,20. Os envelopes afins satisfazem todo prefixo: 12+1,2t >= 1,2t. Qualquer divisão de 600 em até 16 intervalos contém um intervalo de pelo menos 37,5 ticks. Antecipar nele a demanda com margem exige pelo menos 45 de buffer, embora o envelope tenha folga constante de 12; a aproximação reprova. Representar cada entrega/demanda como evento exato, em vez disso, pode exceder o limite de fronteiras e retornar unknown. Esta é uma construção matemática de capacidade, não previsão de renda live garantida.

**Impacto:** workers continuamente alimentados podem nunca ser admitidos, mesmo quando a evidência demonstra os limites usados no modelo. A feature volta a exigir estoque inicial volumoso em casos que pretendia suportar com renda; reduzir lote só ajuda compromissos que realmente sejam divisíveis.

**Correção concreta:** permitir segmentos afins de oferta/demanda com limites conservadores e verificar seus extremos/fronteiras, mantendo demanda inicial e chegadas discretas explícitas. A antecipação integral pode permanecer fallback para dados sem limite de taxa/chegada. Alternativamente, declarar formalmente a limitação e restringir o aceite a lotes suportados, sem prometer cobertura genérica do caso contínuo. Incluir o exemplo viável e sua versão com atraso real de oferta, que deve continuar bloqueada. Proposta de melhoria também identificada pelo autor; o cálculo e esta classificação foram feitos pelo revisor.

## Contratos que a candidata fecha adequadamente no nível documental

- Readiness separa estoque local/remoto, entrega por prazo, recorrência protegida, fontes físicas e transferência interna. Quote não concede recurso; admissão é viva, atômica por bundle/owner, com pendência conservada após OK. O texto impede aprovar renda proxy ou evidência unknown. R6 é limitação de disponibilidade da aproximação, não retorno ao antigo saldo final agregado.
- A unidade energética de repair está correta e utilização por ação foi separada da união de ocupação por trabalhador/tick. Build+upgrade conserva ambos os gastos/efeitos. População, dano observado, spawning, denominador zero e unknown estão delimitados. O ledger permanece estimado; os slots não são promovidos a confirmação geral de store.
- A regra temporal de coverage exige duração observada, qualidade, mesmo regime, segmentos consecutivos e fração temporal, sem tick-rate fixo. Reset preserva resumos e perde a cauda, e o recorte não inventa uma janela móvel intrabucket. R2/R3 são limites de informação/protocolo ainda necessários para executar essa regra.
- A reserva de boost é canônica em labBoostReservations, reconhece legado externo e integra todos os leitores. Totais-alvo e missing são distintos, há owner/geração, reset não retoma preparação e pending incerto não reaplica. R1/R4 ainda impedem concluir que o ciclo todo está fechado.
- Reações operadas têm primitive comum, quantidade variável, proteção dos inputs/capacidade, atualização de pending entre saídas, confirmação e término de fase explícitos. Strict é default; boundedSurplus é opt-in orçado e propagado pelo modelo/cadeia. A cauda inexequível vai a replanning, sem ser escondida pela drenagem. Não encontrei nova contradição material nesses contratos. Isso não prova que modelo, múltiplos outputs, ledger e executor já os satisfaçam.
- O oráculo passa a exigir mundo executado, estado pós-exceção, trace ordenado, sequências com caches preservados e isolamento entre variantes. Os autotestes divergentes e equivalentes são específicos. Esse pacote continua isolável para futura autorização.
- Off suspende decisões opcionais e preserva reconciliação; overlays deixam a base manual intacta, incluindo o limite declarado de ABA direto. Segurança do operador é separada da economia e da entrega manual de gestão. Pisos/emergência da0148 têm precedência e retorno ao legado explicitamente alterado. A ausência de worker não é tratada como reversível instantaneamente.
- Não identifiquei ciclo no DAG observação0154-A → cálculo/contexto0157 → apresentação0154-B. L2 depende da política0153 revisada; L3 depende da observação0155 e do adaptador0149. A fase0 não exige compatibilidade de reação operada, mas conserva seus gates econômicos. Os AC novos aparecem nas tarefas; os seis achados exigem ampliar suas assertions específicas.

## Pacotes e aceite após a revisão

O reparo do oráculo0156-A, slots/estimativa restrita0154-A e funções puras/testes diretos0153-A têm desenho isolável para uma eventual autorização própria. Esta revisão não dá essa autorização. O requisito R3 precisa ser fechado antes de usar os eventos de0154-A para coverage persistente; a parte de slots isolada não depende desse gate.

R2/R3/R6 atingem o contrato comum0157 e seus consumidores. R1/R4 atingem0149 e as premissas de disponibilidade/assinatura de labs. R5 atinge cancelamentos da0150; não é motivo para impedir diagnóstico ou um lote suprido inteiramente por power realmente livre. Compatibilidade operada e operador continuam entregas separadas de fase0. Não há justificativa para bloquear todos os pacotes pelo conjunto inteiro de otimizações0156.

Os testes offline propostos devem provar regras, invariantes e transições; não demonstram 48h reais, qualidade de atribuição live, payback realizado, redução de CPU Screeps ou preservação de trabalho durante ausência efetiva de workers. Essas evidências permanecem separadas e abertas. O cuidado documental de isolar o build da cópia para o cliente é pertinente; nenhum build foi executado nesta revisão.

## Limites, fontes e decisões preservadas

Não houve leitura do jogo, Grafana, estoque/GPL/preços atuais ou revisão instalada do servidor. Não foram reexecutados os testes completos do parecer anterior. O defeito atual do oráculo e as hipóteses fixas dos labs foram conferidos no código; os cálculos pequenos acima reproduzem somente contraexemplos de desenho, sem executar intents reais. A seleção de boost usa fontes primárias públicas consultadas em16/10 e precisa ser pinada/confrontada na futura fixture; master pode mudar.

Fontes atuais não oferecem ainda os novos observadores atribuídos de renda/entrega e coverage descritos pelas features: isso é trabalho futuro explícito de0154-A/0157, com fallback para estoque entregue ou unknown. A aprovação de um consumidor alimentado por renda deve esperar essa implementação/evidência; capacidades teóricas de source, snapshots de stock e chamadas OK não a substituem.

Warm15,97, cold167–197, taxa3,88M e demais números antigos seguem **D**. Ganho de CPU dos caches, adequação das margens e retorno de OPERATE_LAB seguem **H**. Não se somam ganhos de janelas/regimes incompatíveis.

Permanecem preservadas as decisões do usuário: GPL3 como marco configurável; power livre primeiro; cancelamento mínimo após gate; trabalho útil; spawn sem esperar boost; sete dias como cancelamento gerido e não expiração natural; 0152 já aprovada. As propostas corretivas acima não reabrem essas decisões.

Para chamar o planejamento integrado de final, incorporar ou delimitar expressamente R1–R6 em spec/plan/tasks e submeter as alterações à reavaliação. O encerramento da tarefa documental deve registrar resposta e veredito atualizado; não concluir AC de runtime nem converter esta revisão em autorização operacional.

## Reavaliação da candidata r2

Data:2026-10-16. Conferidos a [resposta do autor](resposta-revisao-final-planejamento-2026-10-16.md), os spec/plan/tasks alterados de0149/0150/0157, ajustes de0154/0155, integrado e handoff. O grafo foi consultado novamente antes das buscas; os contratos atuais prevaleceram sobre o mapa anterior. A reavaliação incluiu o complemento R3 e a precisão de escopo/regime incorporados durante esta rodada, depois conferidos no texto normativo.

**Veredito atualizado: o planejamento integrado está adequado como versão documental final para futura autorização por pacote. Não resta bloqueador material identificado em R1–R6 ou nas correções examinadas.** A conclusão não afirma que os contratos já estejam implementados ou validados no jogo. Nenhum AC de runtime/live foi concluído por esta revisão.

| Achado | Status documental | Evidência atual e consequência do contraexemplo |
|---|---|---|
| R1 — seleção de boost | **Fechado** | [0149 spec:32](../specs/features/0149-lab-boosts/spec.md#L32)–41 e T1/T4 distinguem count de índices, reproduzem ordem/prefixo do motor, incluem destruídas no custo e rejeitam esse prefixo no piloto. Count0 não chama a API; TOUGH, corpo misto, parcial e corpo inteiro/custos atribuíveis entram nas fixtures. WORK vivo seguido de destruído deixa de sustentar aprovação por seleção arbitrária. |
| R2 — qualidade por população | **Fechado** | [0157 spec:64](../specs/features/0157-operational-readiness/spec.md#L64)–83 e T3/T4 definem metricSet/version, denominadores por métrica/população, classes disjuntas e numeradores separados. As histórias com unknown nas saídas ou entradas agora produzem buckets diferentes. Duty persistido sem metricSet work-role é unknown; estimativa não é confirmação. Motivos/qualidade não podem ser reconstruídos do total físico. |
| R3 — publicação/replay | **Fechado após complemento desta rodada** | [0157 spec:87](../specs/features/0157-operational-readiness/spec.md#L87)–96, AC5/T4 e [0154 spec:38](../specs/features/0154-energy-report-experiments/spec.md#L38) fecham sequência/identidade duráveis, prefixos de publicação/commit, ACK global por produtor, descarte explícito da cauda e separação de pending físico. O contraexemplo adicional abaixo foi incorporado à fixture. |
| R4 — drenagem | **Fechado** | [0149 spec:44](../specs/features/0149-lab-boosts/spec.md#L44)–49, AC8/T5 tornam cleanup independente de drainIdleLabs, preservam owners/pins alheios e definem compatibilidade, takeover e quarentena com recuperação. Configuração de idle drain desligada deixa de justificar retenção automática eterna quando a logística existe; falta física de destino deixa de ser declarada retorno bem-sucedido. |
| R5 — liberação física por cancelamento | **Fechado** | [0150 spec:52](../specs/features/0150-power-creeps/spec.md#L52), AC10/T2–T3 usam poolAfterCancel e exigem prova de suficiência/mínimo. Sobrecompromisso, lastro incerto ou busca limitada sem prova dão unknown e zero cancelamentos. Físico100/listagens100+100 não é aprovado por um prefixo nominal. A revalidação após cada confirmação permanece. |
| R6 — alimentação contínua | **Fechado** | [0157 spec:39](../specs/features/0157-operational-readiness/spec.md#L39)–41, AC3/T1 aceitam segmentos afins inferiores/superiores e verificam extremos e saltos. Local12/oferta1.2/demanda1/H600 passa; latência real continua no envelope. A antecipação integral é fallback de resolução, com unknown, não declaração de inviabilidade física. |

### Contraexemplo novo de R3 e seu fechamento

A primeira r2 ainda permitia ordenar eventos pelo momento da confirmação, enquanto o checkpoint era recortado por originTick. **F/I:** considere seq10/origem103 já fechado antes de seq11/origem101, cuja confirmação chega depois; outra fonte mantém o corte global em101. Persistir soma da origem101 e cursor11 também reconheceria seq10 sem agregar origem103. Persistir só cursor9, mas já somar seq11, deixaria a soma de101 sujeita a replay. O cálculo read-only confirmou que um cursor11 reconheceria o evento103 não incluído. Isso era uma lacuna material do protocolo, não incidente observado no jogo.

O texto final da rodada proíbe essa publicação: frames saem em ordem de origem, eventSeq é atribuído nessa ordem e closedThroughTick é prefixo contíguo. Uma origem com frames parcialmente publicados não avança watermark/ACK; todos os seus escopos entram atomicamente. O checkpoint só agrega e reconhece prefixo contíguo de sequência até o corte temporal, com ACK global por produtor. Cursor por bucket ficou somente como proveniência. Assim, o cenário deixa de ser uma sequência permitida pelo contrato; não exige um conjunto ilimitado de IDs já consumidos.

O fechamento também distingue origem aberta de resultado imutável: conciliar antes de fechar ou expirar em até5ticks como unknown; tardio após unknown fechado é diagnóstico. Reset conserva agregados e nextSeq, registra descarte da cauda/tombstone sem numerador/duração e continua recuperando efeitos físicos. Fonte sem operação só fecha zero com coleta válida; fonte ausente não fabrica zero. Não identifiquei outra contradição material entre fechamento, qualidade, seq, ACK e reset no desenho revisado.

### Escopo estável, limites e rastreabilidade

Conferida a precisão de [0157 spec:64](../specs/features/0157-operational-readiness/spec.md#L64)–65: chainRecipeId identifica receita/política canônica, não lote/owner efêmero. Fases e reservas automáticas temporárias sob a mesma política entram nos estados/denominadores; não fragmentam 48h por creep. Política, pool estrutural ou pin persistente alterados criam coorte. Isso conserva representatividade sem tornar o gate impossível sob ciclos normais. Não permite reutilizar geometria em cache sem revalidação: assinatura de decisão continua invalidando por reserva/efeito vivo. A avaliação econômica permanece da cadeia completa, com custos e ocupações temporárias observados.

Os tetos revisados são explícitos:4escopos,3buckets,6métricas,2048unidades UTF-16 por bucket,32768coverage; até32recibos/8192unidades e40960combinados. Overflow produz unknown e preserva pending físico. A cadência máxima de100ticks não dispensa respeitar a capacidade dos recibos; a implementação poderá precisar de checkpoint anterior, sempre após o fechamento permitido. Testes de pior caso, publicação parcial, reset e overflow continuam obrigatórios; esta revisão de desenho não mediu tamanho de uma implementação inexistente nem adequação dos defaults em carga real.

As correções estão em spec/plan/tasks, com assertions nomeadas e AC futuros abertos. A quotaKey por owner+item+produto+geração explicita agregação entre outputs sem mudar strict default/boundedSurplus opt-in. Adoção do operador começa managed=false; safe exige adoção explícita. Não surgiu ciclo ou bloqueio artificial novo no DAG, nem regressão documental das escolhas preservadas no parecer r1.

### Limite do veredito vigente

O parecer é favorável ao **encerramento documental** de ARK-141 após o autor registrar a resposta e sincronizar estados/referências finais. Implementação continua dependente de autorização própria, por pacote e seus pré-requisitos. Não foi concedida autorização para investimento, cancelamento, operador, ativação ou deploy.

Permanecem obrigatórios na futura implementação os testes offline específicos e o DoD de código. Evidência real de48h, atribuição, preservação de trabalho, overhead, CPU, mercado e retorno econômico continuam gates operacionais separados; não são pendências desta tarefa exclusivamente documental. Fontes públicas do motor ainda precisam de fixture pinada e confronto pertinente com o servidor. Dados históricos continuam históricos e hipóteses de ganho continuam hipóteses.

Nesta reavaliação o revisor alterou somente este relatório, preservando o parecer r1 e acrescentando o veredito atual. Não executou implementação, testes completos, build, graphify update, publicação ou mutação de estado externo.
