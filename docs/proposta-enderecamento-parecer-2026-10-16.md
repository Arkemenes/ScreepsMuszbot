# Proposta de endereçamento do parecer — 0148–0157

> Histórico da proposta inicial. Consolidada nas specs e no [planejamento integrado vigente](planejamento-integrado-2026-10-16.md), que prevalecem em divergências. Quotas strict permanecem default; excedente exige opt-in orçado.

Data: 2026-10-16. Issue: [ARK-141](https://linear.app/arkemenes/issue/ARK-141/fechar-contratos-e-rastreabilidade-do-planejamento-integrado-0148-0157).

Status: proposta para revisão do usuário. Este documento não altera as specs vigentes, não conclui seus AC e não autoriza implementação ou ativação. As issues das features continuam responsáveis pelas entregas.

O parecer é procedente nos bloqueadores centrais. Recomenda-se fechar os contratos abaixo e dividir a entrega por dependências reais. O reparo do oráculo, a correção restrita do ledger e os testes diretos da política de listagens podem ser tratados como pacotes isolados.

## Base da análise

- Lidos a constituição, o workflow, as specs 0148–0150 e 0153–0157, os trechos relevantes dos planos/tarefas, arquitetura e roadmap.
- Consultado o grafo de 15/10 antes da inspeção dos arquivos atuais. O grafo serve de orientação; as contradições documentais foram verificadas no checkout.
- Reproduzido no oráculo atual: referência grava `claims=10`, candidata grava `claims=999`, ambas retornam `ok`; uma projeção de retorno e claims ainda recebe `{equal:true, divergences:[]}`.
- Confirmados nos arquivos os créditos imediatos do ledger, os consumidores de `labBoostReservations`, os lotes fixos do simulador e a condição de avanço de fase que exige quota concluída.
- Conferidos os handlers públicos do motor para prioridades, build, repair, upgradeController, runReaction e mercado. Não foi identificada a revisão instalada no servidor do usuário. Os testes de motor citados no parecer não foram todos reexecutados nesta análise.
- Nenhuma medição atual de CPU, preço, estoque, GPL ou Grafana foi obtida. Não foram executados smoke ou Grunt nesta entrega documental.

## 1. Oráculo de equivalência — 0156 / ARK-139

**Aceitar integralmente o achado.** A projeção deve receber o mundo executado: o defeito está em [compare.js](../test/equivalence/compare.js), que passa o original.

Contrato proposto:

1. Criar um mundo independente por variante, reconstruindo stubs, métodos e providers com uma factory de fixtures.
2. Executar uma sequência inteira em cada variante, conservando seus módulos/caches entre passos. Isolar módulos e globais entre variantes e cenários; restaurar globais em `finally`.
3. Comparar em cada passo retorno, estado pós-execução, Memory relevante e trace ordenado de intents/claims/taxas. A ordem do trace é observável; ordenar chaves de objetos não deve ordenar arrays.
4. Capturar exceção por tipo/mensagem e também projetar o estado parcial posterior. Exceções iguais com efeitos diferentes divergem.
5. Declarar o formato suportado pelos snapshots; valores não serializáveis não podem desaparecer silenciosamente da comparação.

Autotestes obrigatórios: claims 10/999; intent diferente; ordem diferente; apenas estado diferente; apenas erro diferente; mesmo erro com estado parcial diferente; par equivalente; sequência em que o segundo passo depende do cache do primeiro; ausência de vazamento de globais/providers.

O reparo permite confiar nas comparações que cubram os observáveis declarados. A completude da projeção e das fixtures continua sendo responsabilidade de cada otimização.

## 2. Ledger estimado e RCL8 — 0154 / ARK-133

**Aceitar a correção por slots, delimitando seu alcance.** [energyLedger.js](../src/utils/energyLedger.js) hoje registra créditos imediatamente por chamada. Os slots devem registrar o último intent aceito de cada método por creep/tick e respeitar cancelamentos.

- Resolver supressão por presença de intents e a ordem de processamento do motor, preservando as decisões dos roles. Repair suprime build; upgrade é independente. Um repair que perde efeito por alteração concorrente não libera automaticamente o build suprimido.
- Manter gasto, efeito produzido e qualidade da estimativa em campos separados. `OK` significa intent aceito.
- Delimitar fixtures para transfer/drop/withdraw/pickup anteriores ao trabalho, alvos modificados por outros atores, cancelamento e intents suprimidos. Onde os hooks não permitirem reconstruir os efeitos, registrar `unknown` ou limites conservadores; não usar apenas o store inicial como execução exata.
- Aplicar o teto compartilhado por controller/tick. O total e a distribuição entre creeps devem explicitar incerteza de ordem; não atribuir uma distribuição arbitrária como fato.
- Testar renovação do teto no tick seguinte, boost, efeito de operador, dano observado no corpo e pouco trabalho restante no alvo.
- Continuar rotulando o ledger como **estimado**. Confirmação geral por delta de store permanece fora desta fase. Numerador desconhecido não vira zero nos relatórios nem sustenta gate econômico.

Fixtures mínimas: o caminho real `builder.run → opportunisticWork → runBuild`, dois builds, repair+build, build+upgrade com combustível suficiente/insuficiente, dois upgraders RCL8 e uma segunda rodada no tick seguinte.

Referência: [prioridades do motor](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/intents.js). A fixture deve registrar o commit efetivamente usado, em vez de depender de `master` indefinidamente.

## 3. Contrato de motor e validade de versão — 0150/0153/0154

**Incorporar os resultados públicos, preservando o limite de versão.** Remover das specs as pendências já resolvidas nas fontes consultadas:

- `OPERATE_LAB` usa `endTime > gameTime`; o último tick observado como ativo deve ter fixture própria. Aplicar/renovar o efeito no mesmo tick requer tratamento separado de ordem.
- Cancelamento manual remove a ordem sem devolver taxa. Expiração natural possui ramo de restituição sobre o restante.
- O limite `_upgraded` deve ser validado em dois ticks com objetos de processamento reconstruídos, sem exigir uma atribuição textual `_upgraded=0`.

Registrar revisão do engine/constants, cenário, resultado esperado e data das fontes nas fixtures. Não generalizar o corte temporal de um poder para outro: o handler público de `upgradeController`, por exemplo, usa `>=` para o efeito de controller.

Antes da ativação, identificar a versão do servidor quando exposta. Se não houver SHA disponível, registrar essa limitação e obter evidência operacional dos comportamentos necessários; a proposta não depende de descobrir um SHA privado inacessível.

Fontes: [runReaction](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/run-reaction.js), [upgradeController](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/upgradeController.js), [mercado](https://github.com/screeps/engine/blob/master/src/processor/global-intents/market.js).

## 4. Reações operadas, quotas e término — 0150 / ARK-137

**Aceitar o diagnóstico e substituir a solução de cauda.** Drenar reagente não satisfaz a quota restante. O suporte deve incluir [labPlanModel.js](../src/utils/labPlanModel.js), além de executor, runtime, reservas, confirmação e craftLedger.

Recomendação: metas de produção podem admitir **um último lote inteiro com excedente limitado e previamente orçado**. Quotas declaradas estritas só aceitam planos exequíveis; rejeitar/replanejar os demais antes do gasto.

- Uma função pura comum calcula a quantidade efetiva a partir da base, nível e cronologia do efeito. Planejador e executor usam a mesma regra e a mesma política de cauda.
- Antes de um intent, exigir necessidade ainda positiva após produção confirmada e todos os intents pendentes. Admitir o lote completo somente com orçamento de ambos os reagentes, capacidade da saída e autorização para o excedente.
- O último lote pode exceder a meta em menos que sua quantidade efetiva. Exemplo: meta 10, lote 7 → produzir 14, registrar excedente 4, consumir 14 de cada reagente e reservar esse custo antes de começar. O excedente não vira receita presumida.
- Atualizar a necessidade após cada reserva intratick: outros labs não podem emitir lotes adicionais sobre a mesma cauda. Surplus existente é reaproveitado no planejamento seguinte, sem arredondar repetidamente a mesma demanda.
- Propagar o arredondamento e os insumos adicionais por toda a cadeia. Não alterar silenciosamente uma quota máxima ou um teto de gasto informado pelo usuário.
- Avançar fase quando produção **confirmada** atingir a meta e não houver intents pendentes; finalizar cadeia somente após entrega final conforme seu contrato. O resto é inventário identificado, não trabalho pendente fictício.
- Se o efeito mudar depois de planejar, revalidar quantidade e orçamento antes do intent. Sem solução executável, sair para replanejamento com motivo e stall guard; não esperar indefinidamente por uma quantidade impossível.
- Na primeira implementação, não aplicar/renovar `OPERATE_LAB` e reagir no mesmo lab/tick. Se efeitos de terceiros tornarem a quantidade incerta, reservar o maior consumo plausível e toda a capacidade necessária, ou adiar. Reservar apenas a base não protege inputs compartilhados.
- A confirmação compara o delta observado e a quantidade prevista. Ambiguidade por outras mutações fica `unknown`; não inventar produção. Transferências precisam participar da atribuição antes de chamar delta de confirmação.

AC6/9 devem testar quantidades 5/7/9/11/13/15, efeito no último tick, aplicação/renovação, outputs mistos, inputs compartilhados, capacidade perto de 3000, reset, meta 10 com lote 7, budget sem espaço para excedente e **término da cadeia sem stall**.

Este pacote bloqueia o operador/fase 2, sem criar dependência de compatibilidade de labs para o processamento da fase 0.

## 5. Reserva canônica de labs — 0149 / ARK-136

**Escolher `Memory.rooms[room].labBoostReservations` como armazenamento canônico.** É a chave já consumida por [refining](../src/rooms/refining.js), [labReactions](../src/utils/labReactions.js) e [labPolicyRuntime](../src/utils/labPolicyRuntime.js). Substituir a proposta paralela `labReserve` por registros estruturados nessa chave.

Criar um adaptador único de leitura/alteração, com views para exclusividade, retenção e orçamento. Cada registro automático contém versão, reservationId, ownerRequestId/ownerCreepId, geração, compound, partsTarget, requiredMineral, requiredEnergy, deadline e estado. São identificadores e números, nunca objetos de jogo.

- `requiredMineral/requiredEnergy` significam **total-alvo ainda necessário para as partes não confirmadas**, não deficit de transporte. `missing = max(0, required - stockNoLab - entregasPendentesDoOwner)` é calculado no uso.
- Confirmação de boost parcial reduz as partes restantes e suas necessidades. Um simples `OK` não reduz a reserva.
- O mesmo owner deve lastrear os compromissos econômicos, as retiradas e as entregas; inventário em trânsito não pode ser contado duas vezes.
- `transientStock` continua autoridade de retenção/drenagem. Excluir o lab reservado de refining, seleção de geometria, planejamento, executor e claims de outros donos.
- Reservas booleanas legadas/manuais continuam protegidas como externas; a limpeza automática não ganha ownership sobre elas.

Estados: `reserved → loading → applying → confirming → draining → released`, com cancelamento seguro para `draining`. A exclusão do pool continua durante drenagem; a retenção de boost termina quando já não há aplicação/confirmacão a proteger. Liberar para produção após fronteira segura, lab compatível e ausência de intent pendente.

**Reset:** cancelar a tentativa automática, reconciliando primeiro o corpo se houve aplicação pendente. Não retomar automaticamente a antiga reserva. Morte, prazo e flag off seguem o mesmo encerramento idempotente. Um pin manual posterior é preservado; limpar apenas o registro com owner/geração ainda pertencentes à operação.

Testar todos os leitores, boost parcial, concorrência com reação, morte, prazo, reset entre intent e confirmação, pin manual e retorno ao pool. Spawn segue imediatamente; sem viabilidade o creep trabalha sem boost.

## 6. Readiness: orçamento entregável por consumidor — 0157 / ARK-140

**Reescrever o contrato comum.** `claimDiagnostics` trata conquista; reservas físicas vêm de `terminalClaims`, `reservations`, reservas de entrega e compromissos dos owners. Evitar descontar duas vezes um mesmo compromisso representado em mais de uma view.

Entrada e saída devem declarar consumidor, sala, recurso, horizonte em ticks, instante da observação, validade, regime, qualidade, atraso inicial, orçamento e motivos. Resultado distinto: `ready`, `blocked` por insuficiência conhecida ou `unknown` por evidência ausente. Somente `ready` permite compromisso opcional novo.

Definições:

- Estoque livre por localização: físico menos pisos, claims, retiradas aceitas e compromissos existentes, deduplicados por owner/operação.
- Renda líquida: fluxo observado menos consumo recorrente protegido e compromissos futuros. Estoque e renda futura são parcelas disjuntas.
- Entrega: limitar **estoque e renda** pelo caminho viável até aquele consumidor, capacidade compartilhada de transporte, fila e tempo de chegada.
- Horizonte produtivo: descontar preparo, viagem, espera de energia/lab e TTL perdido. Custos iniciais, como energia de aplicação do boost, entram em seus próprios prazos.

Trocar a desigualdade de saldo final por uma verificação de entregas acumuladas em prazos relevantes. Para cada prazo `t` até o horizonte `H`:

`energiaLocalLivre + entregaLíquidaAlocávelAté(t) >= demandaAcumuladaAté(t) × (1 + margem)`

O modelo pode começar conservador, com poucos intervalos e limites inferiores de entrega demonstrada. Precisa cobrir o início e os intervalos de trabalho, além do fim. Transporte teórico sem evidência suficiente dá `unknown`; não é necessário implementar um simulador completo da economia.

Uma autoridade de admissão consome/aloca o orçamento quando aprova uma operação. Dois consumidores não recebem o mesmo estoque, renda ou slot de transporte. Operações de vários ticks persistem só o compromisso mínimo necessário e o reconciliam por owner. A revalidação do próprio owner não desconta sua reserva duas vezes.

Excluir energia do terminal é uma escolha conservadora do piloto, não prova de que toda ela esteja comprometida com frete. O orçamento considera também reservas localizadas em storage/containers; `physicalPool` de storage+terminal sozinho não representa toda a logística do consumidor.

Fixtures: storage zero com entrega sustentada; storage cheio sem hauler; renda bruta alta consumida pelos essenciais; energia suficiente só no fim do horizonte; atraso que elimina benefício do boost; claims localizadas; dois consumidores disputando saldo e transporte; renovação da reserva do próprio owner; dados ausentes/vencidos.

## 7. Cache e revalidação viva — 0157/0156

Cachear no heap apenas observações estáveis e cálculos puros: geometria, census do tick e amostras históricas com validade declarada. Ler descontos, claims, orçamento concedido e entregas pendentes **a cada admissão** e imediatamente antes do efeito.

A primeira versão deve reutilizar as autoridades vivas existentes; uma revisão global de invalidação só será necessária se houver prova de que cobre todas as mutações. Contagem de estruturas ou passagem de tick não invalida sozinha alterações de owner/provider/configuração.

Teste obrigatório: primeira decisão aprova e reserva; segunda decisão no mesmo tick é reprovada ou recebe somente o restante. Repetir com retirada, liberação, substituição de provider e alteração de reserva. Um cache hit jamais pode pular confirmação, manutenção ou observação final.

## 8. Duty, ocupação e produção — 0157/0154

**Separar três métricas.** O duty por ação será uma utilização energética equivalente estimada, com unidade explícita. Para as regras-base atuais:

| Ação | Energia por WORK/tick em carga plena | Conversão |
|---|---:|---|
| build | `BUILD_POWER` = 5 | energia estimada / 5 |
| repair | `REPAIR_POWER × REPAIR_COST` = 1 | energia estimada / 1 |
| upgrade | `UPGRADE_CONTROLLER_POWER` = 1 | energia estimada / 1 |

As constantes e o efeito de arredondamento/parcialidade devem constar da fixture. Esta métrica não afirma conhecer quais partes individuais produziram cada efeito.

- **Utilização por ação:** somar os equivalentes dessa ação e dividir pelo WORK elegível integrado. Não somar build e upgrade em um duty escalar comum.
- **Ocupação do trabalhador:** por creep/tick, contar uma única vez o WORK do trabalhador que apresentou alguma atividade produtiva estimada. É uma união de atividades no nível trabalhador/tick, ponderada por WORK; não reconstrói a união exata de partes individuais a partir de totais agregados.
- **Produção e gasto:** manter energia e efeito de cada ação. Um WORK que faz build e upgrade pode ter utilização 1 nas duas ações e ocupação 1, com ambos os gastos/efeitos registrados.

População elegível: creeps da sala/role declarados, não spawning, WORK observado com hits > 0; integrar variação de corpo, morte, spawn e conversão ao longo da janela usando census. Denominador zero resulta em `null` com motivo. Amostras de gasto desconhecido têm qualidade/cobertura próprias; não desaparecem do denominador nem viram ociosidade comprovada.

Retorno de XLH2O usa as ações beneficiadas e demanda realmente atendível. Ocupação agregada não atribui benefício ao trabalho de upgrade; boost aumenta efeito, sem multiplicar automaticamente o custo energético da mesma ação. Próximo do fim do alvo, arredondamentos e saturação precisam do modelo específico.

Fontes dos custos/efeitos: [build](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/build.js), [repair](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/repair.js).

## 9. Cobertura persistente e regime — 0155/0157

**Preservar agregados confirmados após reset e descontar tudo que ficou desconhecido.** Retirar as frases que simultaneamente mandam reiniciar e continuar o mesmo período.

Contrato recomendado:

- Escopo estável por sala, cadeia/produto e regime. Regime inclui versão da política, topologia, reservas/pins que alterem a geometria, targets de população, templates de corpo e política de boosts. Alterar qualquer desses descritores cria nova coorte. Envelhecimento, morte/reposição normal e dano observado entram nos denominadores e na qualidade da entrega; não mudam o regime a cada tick. Perda de capacidade que interrompa a entrega invalida readiness mesmo sem alteração da configuração.
- Registrar `first/lastObservedTick`, `first/lastObservedAt`, último flush, versão, resets, gaps, tempo observado, tempo desconhecido e ticks observados. Por bucket: denominadores de labs/WORK, estados, quantidades finais confirmadas e agregados de entrega/consumo com qualidade separada.
- Contar duração real entre observações consecutivas, com relógio injetável. Descontinuidade de tick/coleta, intervalo excessivo, falha ou relógio regressivo abre lacuna. Default inicial proposto: `maxObservedGapMs=30000`; intervalo maior é desconhecido, sem conversão por velocidade fixa. Flush a cada no máximo 100 ticks observados e no encerramento normal da coleta.
- O tempo ainda não persistido na hora do reset é perdido conservadoramente. Retomar a partir da nova observação, sem preencher o intervalo desde o flush. Confirmações e agregados precisam de cursor/idempotência para não recontar eventos.
- Flag off encerra o segmento observado. A retomada abre outro; o intervalo desligado é lacuna. Falha do observador também não conta como cobertura.
- Gate proposto: **pelo menos 172800 segundos efetivamente observados**, no mesmo regime, cobertura temporal mínima proposta de 95% do intervalo considerado e pelo menos 95% do denominador relevante com qualidade conhecida para cada métrica usada no cálculo econômico. Os restantes são desconhecidos e não geram benefício presumido; entrega/produção usadas no gate vêm do limite inferior demonstrado. É um mínimo observado de 48h, não apenas duas datas ou duas frações de dias. Os 95% são defaults propostos para calibração.
- Havendo apenas buckets diários agregados, incluir buckets inteiros conhecidos ou descartar conservadoramente as bordas; não interpolar uniformemente produção/cobertura dentro do bucket.
- Cobertura histórica de regime anterior permanece diagnóstica; não aprova o regime novo. Renovar a evidência após população, boost, topologia ou política alterarem materialmente o sistema. A baseline pode habilitar avaliação de um piloto; o piloto exige revalidação de seu resultado.

Tetos propostos para a primeira implementação: até 8 escopos explicitamente acompanhados, 3 buckets UTC por escopo, `JSON.stringify(bucket).length <= 1024` e `JSON.stringify(Memory.coverage).length <= 32768` **caracteres**. São limites superiores, com alocação sob demanda e piloto em uma sala. O teste mede exatamente essa unidade. Resumos de escopo entram no teto total; ao excedê-lo, podar dados vencidos ou recusar nova coorte com motivo, sem elevar limites silenciosamente nem declarar cobertura que foi descartada.

Teste offline: dias parciais que não somam 48h, velocidades de tick diferentes, gaps, reset entre flushes, replay de confirmação, flag off/on, mudança de regime, relógio inválido, poda e limite de serialização. Evidência de 48h reais continua sendo validação operacional.

## 10. Rastreabilidade e dependências — todas as features

Reescrever os blocos genéricos de cada plano com entrada, campos, owner, estados, transições, confirmação, encerramento, falhas e assertions específicas. Referenciar o contrato comum sem copiar interpretações conflitantes.

| Feature | Tarefas que precisam ser explicitadas |
|---|---|
| 0148 | AC7: emergência após morte/rollback; AC8: fallback; AC9: nenhuma sala elegível |
| 0149 | AC8: reserva, drenagem e retorno ao pool; AC9: fallback; reset e parcial no AC5 |
| 0150 | AC9: quantidades, caudas e término de cadeia; AC10: dry-run/allowCancel; estados do operador |
| 0153 | Cancelamento versus expiração, refund possível e desligamento com intents pendentes |
| 0154 | AC8/9: regressões reais do builder e RCL8; qualidade do ledger; ownership do experimento |
| 0155 | AC7: persistência, duração, gaps e regime, ajustando o critério de dois buckets |
| 0156 | AC7: autoteste do oráculo, incluindo exceção com estado parcial; manutenção em cache hit/off |
| 0157 | Reescrever AC1–6 para entrega, concorrência, métricas separadas e cobertura temporal |

DAG recomendado, com pacotes internos sem inventar dependências universais:

1. **0156-A:** oráculo e fixtures. **0154-A:** slots/observações/fluxos estimados. **0153-A:** política pura e testes diretos. Estes pacotes podem avançar independentemente.
2. **0157-A:** cálculo puro, contexto com saldos vivos, admissão e cobertura. Consome os eventos de 0154-A; não importa energyReport.
3. **0154-B:** apresentação/experimentos consomem 0157-A. **0155-A:** observação final/confirmacão de labs e cobertura por escopo. O sentido de dependência é eventos → cálculo/contexto → apresentação.
4. **0156-B/L2:** exige oráculo e política 0153 revisada como referência. **0156-B/L3:** exige o contrato de observação 0155 e de reservas 0149; medir sem congelar essa manutenção. Outros itens de CPU seguem seus próprios pré-requisitos.
5. Pilotos 0148, 0149 e 0150 fase 0 seguem seus gates e autorizações próprios. 0156 inteira não é pré-requisito obrigatório de correção desses pilotos. A fase 0 mantém seus gates econômicos; não depende do suporte a reações operadas.
6. Compatibilidade completa das reações + evidência representativa da cadeia atual + logística/mercado/ops → avaliação e piloto do operador/fase 2.
7. Toda mudança material de regime → nova coleta e revalidação econômica antes de expansão. Não somar ganhos de CPU de janelas incompatíveis.

Atualizar roadmap, handoff e prompt de continuidade com a mesma sequência quando as decisões forem incorporadas. A arquitetura deve continuar distinguindo código existente de desenho futuro.

## 11. Falhas, desligamento e rollback — contratos por feature

| Feature | Decisão proposta |
|---|---|
| 0148 | Precedência após autoscale: pisos de segurança; depois override manual/política autorizada/legado. Contagem manual maior é preservada; zero manual não reduz piso crítico. Emergência de builder fica abaixo de defesa/economia essencial e acima de consumo opcional. Deduplicar builder vivo/spawning/fila. Flag off restaura decisão legada, acrescida da correção de segurança explicitamente documentada; mede detecção → fila → spawn → chegada → trabalho. Rollback não ressuscita worker. |
| 0149 | Reset cancela tentativa automática após reconciliar corpo/intent pendente. Timeout/morte/off liberam somente ownership próprio e entram em drenagem segura. Boost aplicado é custo/estado consumado; não é removido por rollback. |
| 0150 | Separar processamento, autorização econômica e gestão do operador. `power.enabled=false` interrompe alimentação/processamento. Operador gerido entra em modo seguro quando sua economia está off/suspensa: mantém proteção/retorno/renew, sem novos powers econômicos. Entrega explícita da gestão ao usuário (`managed=false`) interrompe intents automáticos e declara que manutenção deixou de ser garantida. Reset reconcilia intents/TTL/spawn cooldown; morte entra em espera de respawn real, sem spawn repetido; alteração manual de target invalida o plano e reavalia GPL atual. GPL/cancelamento já processados são irreversíveis. |
| 0153 | Off bloqueia decisões novas de criar/estender/alterar/cancelar; reconciliação de ações aceitas, taxas, claims e recibos continua. Não recriar ordem cancelada como rollback nem prometer recuperar ID/taxa. |
| 0154 | Preferir overlay de experimento para settings selecionados via configuração central: guardar owner/geração e remover só o overlay próprio ao encerrar, sem reescrever a configuração-base. Comandos controlados de configuração têm revisão monotônica e podem abortar o overlay. Edição direta de Memory que muda e volta ao mesmo valor não tem intenção detectável; documentar esse limite, sem prometer detecção universal. A base não é sobrescrita na restauração. Invalidar needs em start/stop/reset. |
| 0155/0157 | Off/erro/reset abrem lacuna; agregados confirmados sobrevivem. Mudança de regime impede reaproveitar automaticamente evidência econômica. |
| 0156 | Descartar cache/flag off nunca desliga confirmação/recuperação de operações pendentes. Exercitar desligamento entre intent e confirmação. |

Uma correção independente do piso emergencial da 0148 deve ter AC próprio. Ajustar a promessa “flag off conserva decisões antigas” para explicitar esse comportamento de segurança, em vez de manter duas regras incompatíveis.

## 12. Cancelamento, defaults e validação — 0153/0150 e transversal

**Política de ordens:** conservar o prazo de sete dias como decisão do usuário para ordens automáticas elegíveis. O comando executado nesse prazo é cancelamento gerido; não chamá-lo de expiração natural do servidor. `ordersAudit` deve separar taxa já paga, taxa incremental, restituição futura potencial renunciada e custo de oportunidade da venda. Venda ao preço pedido não é receita garantida; usar probabilidade explícita ou cenário conservador.

Para power: dry-run lista déficit, power livre e comprometido, IDs elegíveis, quantidades, alternativas e custos. `allowCancel=false` por padrão. Cancelar somente dentro do plano autorizado e com saldo/IDs revalidados; reconciliar antes de continuar a liberar mais ordens. Declarar o objetivo da seleção de ordens inteiras e respeitar proteções manuais/pixel. Ausência de ordem após o intent exige reconciliação, não crédito automático de power ou de taxa.

**Defaults:** GPL 3, sete dias, margem de extensão de 3%, margem de readiness de 20% e referência de payback de 30 dias são propostas compatíveis com as decisões registradas; sua adequação econômica segue por medir. Separar readiness e histerese em campos distintos.

Para fechar a histerese de power, sugestão inicial: entrar com payback <= 24 dias; sair/pausar acima de 30 dias (`30 × (1 − 0,20)` na entrada). Entre 24 e 30, manter a preferência anterior. Dado inválido, falta de orçamento ou margem não positiva sempre bloqueia gasto novo, independentemente da preferência. Estes limiares são calibração proposta, não resultado observado.

**DoD offline:** assertions específicas e identificáveis no smoke; `node --check` nos JS tocados; smoke verde; build local; atualização do graphify após código; docs e checklist coerentes. O build deve ser isolado da tarefa que copia/publica para o cliente, pois o Grunt atual tem esse efeito. Esta proposta não executa build nem altera a aprovação da 0152.

**Aceite operacional separado:** medir overhead no Screeps, CPU sob carga comparável, preservação de trabalho durante ausência real de workers, benefício de boost atribuível, produção final/vendas do operador e período representativo real. Smoke pode testar a regra de 48h com relógio injetado; não produz 48h reais de evidência nem prova payback realizado.

## Critério para encerrar os bloqueadores

- Cada decisão aceita acima aparece no spec/plan/tasks correspondente, sem marcar implementação como concluída.
- A matriz AC → tarefa → assertion offline ou evidência operacional é explícita.
- Orçamento entregável, concorrência, duty, cobertura, reserva e cauda têm um único contrato cada.
- Cada feature tem transições de reset/off/morte/edição manual e encerramento idempotente.
- A revisão seguinte avalia esses contratos e suas fixtures; autorização pode ser por pacote isolado, sem liberar antecipadamente toda a integração.
