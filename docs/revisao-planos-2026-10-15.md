# Revisão dos planos de CPU, economia e capacidades — 2026-10-15

- **Status:** revisão independente feita em 2026-10-16 ([relatório](revisao-independente-2026-10-16.md)); aguardando validação final independente e autorização do usuário.
- **Issue de acompanhamento:** ARK-128 (In Progress); features ARK-133–ARK-139 continuam pendentes.
- **Escopo desta entrega:** documentação. Nenhuma implementação, alteração de configuração, ordem de mercado, commit ou deploy.
- **Autor da avaliação:** Codex. A revisão independente ainda não aconteceu.

## 1. Parecer e decisões confirmadas

Manter as iniciativas, mas não implementar os planos anteriores sem corrigir os contratos abaixo.
Há incompatibilidades com o runtime, lacunas de validação e premissas econômicas ainda não demonstradas.
Os novos spec/plan/tasks são propostas para revisão; a autorização desta entrega é somente documental.

Decisões do usuário nesta conversa:

1. Lógica antes de redução de unidades; preservar trabalho útil de construção, reparo e RCL/GCL.
2. Permitir liberar o power necessário ao marco inicial, inclusive cancelando somente as ordens necessárias após avaliação econômica.
3. **GPL 3 é somente o target inicial.** A meta será configurável; atingir o marco pausa o processamento para reavaliação. Evoluções posteriores são previstas, mas não automáticas.
4. Rentabilidade teórica exige capacidade operacional: um builder boostado sem energia disponível pode passar a vida ocioso e perder o investimento.
5. Outro agente fará a revisão independente antes de fechar o planejamento e de autorizar implementação.
6. Defaults já aprovados da 0152 e ausência de A/B intercalado permanecem. Não reabrir esses experimentos nesta entrega.

## 2. Evidências e limites

Legenda: **C** = inspeção do código atual; **R** = reprodução offline; **H** = dado histórico do handoff;
**I** = inferência a validar; **P** = proposta, não comportamento implementado.

- **R:** `node test/smoke.js "C:\Users\Arkemenes\Documents\code\screeps\world\ScreepsMuszbot"` passou na avaliação anterior desta conversa (exit 0). Isso é baseline do código existente, não teste das novas propostas.
- **R:** a reprodução mínima abaixo declarou equivalência apesar de efeitos distintos em `claims`.
- **H:** warm 15,97 em 583 intervalos e cold tick 167–197 são medições relatadas pelo agente anterior; não foram coletadas novamente nem conferidas em Grafana nesta revisão.
- **H:** auditoria de 19/30 ordens acima do mercado, taxa estimada 3,88 M e 997 pixels é snapshot histórico; não representa estoque ou preço atual, nem economia recuperável.
- **C:** a taxa de `ordersAudit` é uma estimativa baseada no preço atual e total da ordem, não reconstrução exata de taxas históricas. Ordens intershard podem não ter `created` em ticks.
- **I:** as faixas de ganho dos planos anteriores se sobrepõem; somar spans inclusivos e estimativas não demonstra teto de CPU nem impossibilidade de chegar a <10.

## 3. Achados por gravidade

### R01 — Alta: OPERATE_LAB incompatível com o executor atual (0150)

**C:** `src/utils/labPolicyRuntime.js`, `tick`, suspende a política ao encontrar efeitos ativos (`state.wait = {room:"powers"}`).
`confirm` trata efeitos como confirmação incerta e contabiliza +5. `src/utils/labReactions.js`, `execute`, assume 5 em reservas,
quota, disponibilidade, capacidade, pendências e `craftLedger.production`.

**Risco:** operador interromper a cadeia ou produção/consumo divergirem do ledger. O motor aumenta produção e consumo dos dois reagentes na mesma quantidade.
**P:** quantidade efetiva por reação derivada de `LAB_REACTION_AMOUNT`, `POWER_INFO` e efeitos; registrar quantidade nos intents pendentes,
confirmar no tick seguinte, proteger insumos compartilhados e tratar cauda de lote sem overspend. Reconhecer o efeito suportado explicitamente;
efeitos desconhecidos continuam conservadores. Isso é pré-requisito do operador, não simples remoção do bloqueio.

### R02 — Alta: oráculo pode ignorar efeitos (0156 / pré-requisito geral)

**C/R:** `test/equivalence/compare.js` executa funções com clones, mas entrega `world` original à projeção.

```javascript
const compare = require('./test/equivalence/compare').compareImplementations;
compare(
    w => { w.claims = 10; return true; },
    w => { w.claims = 999; return true; },
    [{claims: 0}],
    (result, world) => ({result, claims: world.claims})
);
// Observado: { equal: true, divergences: [] }
```

**Risco:** equivalência de retorno ocultar intents, claims ou Memory diferentes.
**P:** projetar cada mundo isolado após execução; comparar retorno, estado e intents; falhas inesperadas não contam como sucesso só porque ambas lançaram.
Executar sequências com cache aquecido e mutações intratick, não apenas mundos independentes que reconstruam o cache.
Clones JSON não preservam métodos: adaptadores do harness devem reconstruir stubs e isolar globais/módulos.

### R03 — Alta: rentabilidade sem abastecimento realizável (0148/0149/0150)

**C:** as propostas anteriores usam preço, duty histórico e estoque, mas não fecham um contrato de entrega de energia durante a vida produtiva.
**I:** builder pronto e boostado com storage zerado e sem abastecimento pode não realizar o benefício calculado.
**P:** aplicar o contrato operacional da seção 4 em população, boost, power e labs. Storage 0 não é veto isolado;
storage cheio também não prova capacidade logística. Não financiar atividade opcional retirando energia já comprometida com trabalho útil.

### R04 — Alta: consumo estimado tratado como exato (0154)

**C:** `energyLedger.credit*` estima consumo a partir de chamadas OK, antes da resolução do servidor.
`roles/builder.run` chama `opportunisticWork` antes do estado principal; ambos podem emitir e creditar a mesma ação.
O diagnóstico anterior `docs/cpu-optimization-plan-2026-10-15.md`, P3, já descrevia duplicação de build/creditBuild.
`creditUpgrade` também não modela sozinho o limite compartilhado do controller RCL8.

**Risco:** duty, renda e retorno derivados de energia inflada. A correção da fórmula base do boost não tornou todo o ledger exato.
**P:** contabilizar intents efetivos segundo as regras do motor, sem deduplicar indiscriminadamente categorias que possam coexistir;
distinguir estimativa, confirmação e cobertura. Não mudar prioridade de trabalho para consertar apenas a telemetria.

### R05 — Alta: modelo de boost confunde objetivos e duty (0149/0154)

**C:** o duty proposto era ticks com algum gasto na sala / ticks. Não mede utilização por parte WORK nem separa população elegível.
**I:** valor de progresso adicional com energia constante difere da economia para executar trabalho fixo.
**P:** para trabalho fixo, benefício é energia/ações evitáveis; para capacidade adicional, contar somente progresso útil executável.
Não somar os dois sobre o mesmo trabalho. Considerar boost parcial, corpo real, multiplicadores, demanda, uso misto build/repair,
vida restante após preparação e valor alternativo do composto. Incluir 20 energia e 30 composto por parte.
O indicador `E*/duty` só é válido com hipóteses e unidades explícitas; não é o gate completo.

### R06 — Alta: boost não integra energia, drenagem e disputa por lab (0149)

**C:** `src/utils/transientStock.js`, `energyTarget`, define meta 0 para lab por padrão; `excess` drena energia e minerais não autorizados.
`labPolicyRuntime.resolve` exclui labs reservados, podendo alterar a geometria da cadeia.
**P:** reserva quantitativa de composto e energia com owner/deadline; integrar retenção/drenagem, haulers, claims e pins manuais.
Piloto somente com XLH2O próprio e lab disponível sem interromper cadeia. Reserva não pode roubar estoque listado/comprometido.
Liberar e drenar o restante de forma segura após sucesso, timeout, morte, reset ou desativação. Confirmar o boost no corpo, não apenas pelo OK.

### R07 — Alta: retirar builder pode retirar trabalho útil (0148)

**C:** builder repara, constrói e faz upgrade como fallback. `needs` ainda aplica autoscale, overrides e desconto de upgraders convertidos.
`damagedStructures.ids` tem cadência própria; `needs.roomNeeds` também mantém cache temporal existente.
**P:** demanda inclui reparos elegíveis saudáveis/ótimos e upgrade útil, não só emergência. Considerar energia e cobertura real das torres,
fila de spawn, viagem e coleta. Não confundir `tower.criticalRatio` (energia da torre) com razão de hits do alvo.
Anticipar reposição e invalidar needs ao iniciar/restaurar política. Guardas de resgate não dependem somente da lista atrasada de danificados.
Experimento só produz conclusão após ausência efetiva do builder e horizonte de manutenção; manter uma vida de creep enquanto ele ainda existe não valida a remoção.

### R08 — Alta: medição de labs observa intenção de agir, não produção (0155)

**C:** `assignments` atribui `ready` antes de `execute`; o executor pode escrever `reservation` ou `intent:<code>` depois.
Há early returns por planejamento, powers e indisponibilidade. Múltiplas consultas futuras/cache podem distorcer contadores por chamada.
**P:** uma observação final por lab/tick; distinguir ready, intent aceito, reação confirmada, cooldown, entrada, transporte,
troca, capacidade, reserva, erro, planejamento, manual/boost, sem demanda e unknown. Separar produto/fase e denominadores.
Cooldown alto não demonstra gargalo da cadeia completa. Contar produção confirmada, sem dupla contagem entre etapas intermediárias e produto final.

### R09 — Alta: listagens e extensões de pixel (0153)

**C/I:** `0,95 x P >= bid x (1 + margem)` favorece também um P irrealisticamente alto. Competitividade só na criação não protege extensão.
**P:** exigir competitividade, piso e orçamento na criação e em cada extensão; preço alto sem chance de execução não justifica nova taxa.
Excluir ordens próprias e ordens sem quantidade executável; livro indisponível não equivale a livro vazio.
Novo pixel vai primeiro a bids elegíveis com profundidade; excedente livre só estende a única ordem existente quando todos os gates passam, senão fica em estoque.
Separar estoque novo do saldo já exposto; venda por deal e extensão não podem comprometer os mesmos pixels.

### R10 — Média: prazo real, limpeza e taxas (0153)

**C:** `swing.expire` usa ticks e só alcança ops swing/fixedListing; ordens manuais/intershard precisam de tratamento explícito.
**P:** prazo por timestamp persistente e/ou `createdTimestamp`, não idade reconstruída com média móvel de tick-rate.
Ordens legadas sem timestamp entram em observação com idade desconhecida, sem cancelamento em massa.
Expirar apenas listagens automáticas geridas; preservar ordens manuais e a listagem de pixel protegida. Limpeza de esgotadas só após reconciliação
de operações, taxas, pendências e recibos; `active=false` ou `amount=0` não prova esgotamento (`remainingAmount` é distinto).
Taxa já paga é histórica; deal em bid não paga nova taxa de listagem. Não aplicar 0,95 automaticamente ao bid.

### R11 — Alta: power, excedente e segurança do operador (0150)

**C:** `powerSpawn.run` processa com power disponível; `powerFeedJob` não tem gate econômico. `optionalConsumer` ordena entrega,
não comprova excedente sustentável nem protege sozinho upgrade e todos os compromissos.
**P:** gate vivo em alimentação e processamento, inclusive energia já no spawn; meta calculada de `Game.gpl`, estoques e trânsito atuais.
Liberar estoque livre primeiro; quando necessário cancelar ordens inteiras mínimas e reconciliar o saldo, sem vender e processar o mesmo lote.
Manter excedente livre em estoque por padrão; venda futura só via bids conforme política aprovada.
Payback usa contribuição marginal da cadeia completa, reagentes/ops/logística, venda executável e cobertura; mostrar custo total e restante separadamente.
Ao atingir `power.targetLevel` (inicial 3), pausar; meta maior explicitamente configurada reabre avaliação, não autoriza consumo cego.
CPU cap suspende operação econômica, mas mantém proteção e renovação; não é teto rígido garantido após executar chamadas nativas.
Renovação considera caminho, TTL e margem; respeitar cooldown real de respawn, GPL livre e shard. Reutilizar infraestrutura na futura 0122.

### R12 — Média: cache, picos, cold start e limpeza (0156)

**C:** `transitSafety.observeRoom` já deduplica por sala/tick. Hostis, eventos, vítimas do tick anterior, propriedade e expiração continuam dinâmicos.
**P:** medir assinatura + invalidação + reprodução dos efeitos; probe é limite superior, não prova de hit-rate completo.
Separar cálculo puro de atualizações por tick (observação de labs, tempos e confirmação). Não cachear a máquina inteira como valor imutável.
Começar por redundâncias locais; não criar `decisionCache` genérico antes de demonstrar utilidade.
Distribuir scans muda momento da decisão e exige contrato próprio de latência, frescor, justiça e starvation; não chamar isso equivalência exata.
Hidratação preguiçosa deve preservar segmentos e defesa; ganho frio também afeta a média quando resets são frequentes.
Não remover recuperação/migração apenas porque uma coleta retornou zero; preservar recuperação de `Memory.abTest` até confirmar ausência de dependências.

## 4. Contratos transversais propostos

### 4.1 Quote executável e validade

Reusar `purchaseCost`, `orderBook`, claims, ledger e terminalOps; evitar novo motor econômico paralelo.
Uma quote fornece quantidade atendida, preço efetivo, frete/energia, taxas incrementais, instante, validade/cobertura e motivo.
Snapshot histórico serve como referência; execução exige livro suficiente e orçamento atual. `orderBook.byResource` pode disparar `all()`:
não prometer O(1) ou ausência de fetch só por usar esse helper; preferir consulta filtrada/reuso explícito quando cabível.
Taxas afundadas continuam na contabilidade do resultado; não são novo custo marginal de uma decisão futura.
Sem dados válidos, manter preferência histórica para diagnóstico, mas bloquear novos compromissos e pausar consumo opcional ainda não executado.

### 4.2 Operational readiness: retorno realizável

Política pura recebe contexto previamente observado: energia acessível após claims/reservas, renda e consumo essenciais,
compromissos concorrentes, capacidade de transporte, demanda útil, vida disponível, cobertura e idade dos dados.
Retorna elegibilidade, orçamento/quantidade viável, benefício realizável, motivo e entradas usadas; desconhecido não vira zero nem aprovação.
Não exigir todo o combustível de uma vida em storage: abastecimento contínuo pode bastar. Não contar capacidade teórica de sources como renda medida.
`Δstock + gasto` isolado não mede harvest: transferências, compras/vendas, drops e energia em trânsito precisam ser discriminados ou o valor rotulado como proxy.
Revalidar imediatamente antes de boost, compra/transferência e processamento; após boost aplicado não se recupera o investimento simplesmente desligando a flag.

### 4.3 Medição e experimentos

Acumuladores limitados no heap; Memory somente configuração, ownership/recuperação e metadados persistentes indispensáveis.
Uma observação por entidade/tick; loops reutilizam census/roomCache. Evitar dependência circular entre ledger e relatório.
Novos relatórios, guardas e coleta entram sob `guard()` **antes** de `cpuMeter.endTick`; medir overhead separadamente.
Reportar tempo real, ticks cobertos, resets/gaps e causa de insuficiência. Janela de lab pode ser impressa cedo, mas conclusão econômica exige
ao menos dois dias reais válidos; reset reinicia cobertura, não inventa continuidade. Handoff anterior de 1 dia não basta para esse gate.
Experimento persiste somente registro serializável (sem callbacks); métricas/guardas são identificadas por nome e config.
Recusar conflitos por sala e setting. Restauração só modifica valor ainda pertencente ao experimento; não sobrescreve edição manual posterior.
Restaurar em conclusão, aborto, guarda e reset, invalidar needs e registrar motivo; rollback de config não ressuscita creep já ausente.

## 5. Sequência única proposta (somente após as duas revisões)

1. Pré-requisitos de validação: corrigir oráculo/isolamento e contabilidade dos intents necessária às medições; referências congeladas e regressões.
2. **0153 / ARK-138:** competitividade de criação/extensão, limpeza reconciliada, prazo real, descida opcional e pixel.
3. **0154 / ARK-133** e **0155 / ARK-134:** energia, abastecimento, experimentos e labs; coletar cobertura válida sem mudar política.
4. **0156 / ARK-139:** lógica antes de unidades; redundâncias locais e caches comprovados. Scans fatiados ficam condicionados a contrato específico.
5. **0148 / ARK-135:** piloto em uma sala elegível, preservando trabalho útil. Se nenhuma for elegível, não ativar.
6. **0149 / ARK-136:** XLH2O próprio em builders, somente com benefício realizável, energia/logística e lab livre sem interromper cadeia.
7. **0150 / ARK-137 fase 0:** processamento com meta inicial configurável GPL 3, dados/economia/abastecimento válidos e liberação mínima de listagens.
8. **0150 fase 2:** somente após suporte a reações operadas, medição e gate econômico; criação/upgrade de operador continuam manuais.

Não somar ganhos esperados como promessa. Fusão de roles, compra de boosts no piloto, boosts upgrader/CARRY, factory avançada,
poderes adicionais e mudanças de latência não entram silenciosamente nesta primeira ativação.

## 6. Critérios e defaults para o revisor conferir

- Preservar 0152; nenhum novo A/B intercalado. Flags novas desligáveis; capacidades de unidades, boosts e power inicialmente desligadas.
- Propostas mantidas para revisão: 7 dias de listing automática, pixel minBid relativo `R x 0,95`, margem de extensão 3%, descida off,
  histerese 20%, payback máximo 30 dias. Histerese exige limiares de entrada/saída distintos e não substitui validade dos dados.
- Builder: marcas anteriores container 40%, road 30%, critical 300 ticks são guardas de resgate, não estratégia de manutenção;
  atuar antes delas conforme tempo de reposição. Não tolerar 300 ticks numa estrutura com sobrevivência menor.
- Boost rentável sem energia acessível e sem reposição: rejeitar. Storage 0 com alimentação sustentável: avaliar, não vetar automaticamente.
- Energia reservada para defesa/economia essencial: não disponível. Lab tardio/hauler insuficiente: reduzir benefício e rejeitar se não pagar.
- Deterioração entre seleção e aplicação: seguir sem boost e liberar reserva; spawn nunca espera por boost.
- Power/lab lucrativos mas sem energia, reagente, transporte ou venda suficiente: não presumir benefício.
- Target inicial atingido: pausar e pedir reavaliação; target futuro configurado pode retomar sob os mesmos gates.
- Testar concorrência, mutações intratick, efeitos começando/expirando, lote residual, reset, morte, falha, timeout, flag off,
  ordens sem timestamp, indisponibilidade de API e ausência de profundidade. Comparar estado/intents, não só retorno.
- Verificação de código futura: node --check, smoke, build **sem publicação**, graphify e invariantes; deploy somente sob autorização própria.
  Grunt atual copia bundle ao cliente quando LOCALAPPDATA existe. Nesta entrega documental não executar Grunt nem graphify update.

## 7. Pedido de revisão independente

Leia este relatório como hipótese a ser contestada, não como conclusão obrigatória. Confronte cada achado com o código atual,
spec/plan/tasks e fontes primárias. Registre confirmado/contestado/inconclusivo, gravidade, evidência, mitigação alternativa e
impacto nas dependências. Verifique em especial modelos econômicos, abastecimento real, integração dos labs, oráculo e rollback.
Revise também se os critérios permitem preservar trabalho útil e impedir consumo sem dados válidos.
Entregue divergências e bloqueadores ao usuário; não implemente nem publique. O usuário fecha o planejamento após essa revisão.

### Rastreabilidade das propostas

| Feature revisada | Achados principais | Contrato de validação |
|---|---|---|
| [0148](../specs/features/0148-on-demand-population/spec.md) | R03, R07 | Demanda útil, abastecimento, reposição antecipada e ausência efetiva no experimento. |
| [0149](../specs/features/0149-lab-boosts/spec.md) | R03, R05, R06 | Retorno realizável, energia/logística, lab livre e revalidação antes de boost. |
| [0150](../specs/features/0150-power-creeps/spec.md) | R01, R03, R11 | Meta evolutiva, orçamento de energia/power, reações operadas e manutenção do operador. |
| [0153](../specs/features/0153-listing-policy-review/spec.md) | R09, R10 | Competitividade na criação/extensão, timestamps e reconciliação. |
| [0154](../specs/features/0154-energy-report-experiments/spec.md) | R03, R04, R05 | Intents efetivos, WORK integrado, cobertura e ownership dos experimentos. |
| [0155](../specs/features/0155-lab-utilization/spec.md) | R08, R11 | Observação final deduplicada, confirmação, cobertura e contribuição marginal. |
| [0156](../specs/features/0156-cpu-logic-remaining/spec.md) | R02, R12 | Oráculo de efeitos, sequências aquecidas e custo completo do cache. |

### Verificação desta entrega documental

Foram atualizados 27 documentos, contando este relatório novo. O script de edição comparou SHA256 de 152 arquivos
em `src/`, `test/` e `grunt-scripts/` antes/depois e confirmou que permaneceram idênticos. O arquivo auxiliar foi removido.
Validação documental inclui links relativos, leitura UTF-8, status de revisão, checkboxes de implementação abertos e `git diff --check`.
Não foram executados Grunt, graphify update ou validação live; não há código novo a testar. O smoke aprovado citado na seção 2 é baseline da avaliação anterior.

## 8. Fontes e navegação

- [Constituição](../specs/constitution.md), [workflow](../specs/README.md), [roadmap](../specs/ROADMAP.md), [arquitetura atual](../specs/ARCHITECTURE.md).
- [Handoff revisado](handoff-agente-2026-10-15.md), [prompt do revisor](prompt-proximo-agente.md).
- [Análise anterior preservada como histórico](roadmap-otimizacao-e-capacidades-2026-10-15.md) e [diagnóstico anterior de CPU](cpu-optimization-plan-2026-10-15.md).
- Fontes primárias consultadas na avaliação: [power](https://docs.screeps.com/power.html),
  [API](https://docs.screeps.com/api/), [constantes](https://github.com/screeps/common/blob/master/lib/constants.js),
  [run-reaction](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/run-reaction.js),
  [build](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/build.js),
  [repair](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/repair.js),
  [upgradeController](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/upgradeController.js),
  [power-creeps](https://github.com/screeps/engine/blob/master/src/game/power-creeps.js).
  São fontes públicas; confirmar constantes e comportamento do servidor antes da ativação. Nenhum dado live foi coletado nesta entrega.

## 9. Resultado da revisão independente (2026-10-16)

R01–R12 foram confirmados contra o código e o motor; R04 foi agravado e R06 ganhou um ponto de integração existente (`craft.labEnergyTarget`).
Surgiram a feature 0157 (contrato de readiness/cobertura) e os ajustes aprovados nas specs 0148, 0149, 0150, 0153, 0154, 0155 e 0156.
O texto deste relatório fica como registro da avaliação original; o estado vigente está em [revisao-independente-2026-10-16.md](revisao-independente-2026-10-16.md).
