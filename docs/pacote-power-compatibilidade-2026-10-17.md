# Pacote de compatibilidade de powers — 17/10/2026

## Entrega local e limite operacional

ARK-137 em andamento. Após T10-A, implementados sends com confirmação deferida, quantidade de reação comum no modelo/runtime/executor/ledger, quotas estritas quantitativas e diagnóstico sob demanda. Nenhum Power Creep foi criado, adotado, movido ou ativado. O processamento legado de powerSpawn permanece com sua configuração anterior; não confundir isso com um operador novo.

**O próximo gate é um teste em jogo deste pacote e leitura dos fatos da conta.** CPU média relatada19,5/6h não comprova orçamento incremental. Sem resultado live e evidência de pelo menos48h válida do regime-base, não autorizar piloto/investimento. Não acrescentar um controlador ativo antes de verificar os caminhos mecânicos modificados e obter GPL/poderes/ops reais.

## Transferências

`send()` aceito guarda pendingSend e mantém carga+frete bruto reservados, inclusive contra jobs do próprio owner. Só uma transação compatível ou movimentos atribuíveis nos dois terminais confirmam envio e custo. Parcial mantém amount original, acumula sentAmount e custo, entrega a parcela e reenvia apenas remaining. A chegada gerida não cria receipt concorrente enquanto o intent está pendente.

Buffer de admissão continua bruto; débito econômico usa o fator observado. Sem movimento, esperar a janela de confirmação antes de liberar/repetir. Movimento ambíguo mantém reserva, não reenvia e mostra motivo; stall guard encerra tentativas automáticas, sem liberar material sem prova. Cancelamento aguarda o intent e entrega o que já saiu; não envia o saldo cancelado. Operações legadas já enviadas continuam reconhecidas.

Mudança não atribuível no efeito durante confirmação deixa contabilidade incompleta e suspende novo gasto daquela operação. Valor previsto não vira prova de custo realizado. A mesma proteção foi aplicada aos deals de T10-A. Não há recuperação automática que invente custos ou apague a dúvida.

## Labs e quotas

`labReactionAmount` lê base/POWER_INFO e cria snapshots escalares. Quantidades de7/9/11/13/15 exigem os mesmos totais dos dois inputs e capacidade de output. Reservas de inputs são compartilhadas por tick; produto criado neste tick não financia outro intent. Pending guarda quantidade, efeito e quotaKey por owner/item/produto/geração da fase.

O modelo passou a simular quantidade, expiração e conservação; o runtime aceita somente OPERATE_LAB reconhecido, invalida planejamento quando o efeito muda e mantém desconhecidos suspensos. Confirmação usa cooldown e cronologia do efeito, em vez de presumir5. Ledger consome/produz a quantidade confirmada; efeito concorrente não atribuível marca produção/economia incompletas.

Strict permanece padrão. Uma pequena tabela de resíduos módulo5 considera o número limitado de reações operadas ainda possíveis antes da expiração; não faz busca proporcional ao tamanho do lote. Exemplo: meta10/A7 não inicia uma reação que deixaria3 impossíveis; pode esperar expirar e produzir5+5. Meta14 permite7+7 quando há oportunidades suficientes. Outputs comuns e operados podem contribuir à mesma quota, sem excedê-la. Stall guard preserva material e força replanning sem inventar conclusão. boundedSurplus continua adiado/indisponível nesta primeira versão; não é necessário ao caminho estrito.

Teste completo executa cadeia XLH2O com layout misto, estoques, transporte, cooldowns e reset; todas as etapas chegam exatamente à meta. Os testes novos de ledger verificam consumo real de cada reagente e rejeição de efeito concorrente incerto.

## CPU e Memory

Escopo desta seção: compatibilidade de powers T10-A/B. A auditoria posterior dos bundles confirmou que o deploy completo também incorporou trabalho anterior de boosts minerais e bootstrapStorage; esses caminhos acrescentam verificações em haulers e uma chamada guardada por sala/tick. Ver a análise live abaixo; a afirmação sobre ausência de observadores novos na compatibilidade não descreve todas as diferenças entre os bundles publicados.

Não foram adicionados observadores por tick, consultas de mercado, room.find fora de roomCache, passagem sobre Game.creeps ou histórico persistente. Poll global de terminal continua igual. O modelo sem efeito mantém caminho direto; a tabela de caudas e snapshots adicionais dos outputs só entram quando necessários. Novos dados de recuperação são escalares e temporários por intent/estado ativo.

Isso evita trabalho estrutural novo, mas não prova overhead zero. Helpers, metadados e conciliação têm custo que precisa ser medido no servidor. Os contadores offline e número de assertions não medem CPU Screeps.

## Diagnóstico e teste necessário do usuário

`powerStatus(roomName?)` é somente leitura e só executa quando chamado. Informa GPL, poderes/níveis/cooldowns/TTL observados, geração ideal, ops armazenados (não presumidos livres), efeitos/labs/terminal/powerSpawn, transfers ativas e incertezas. Não cria histórico nem autoriza gasto. `automatedOperatorImplemented=false` e `investmentReady=false` são explícitos enquanto o controlador/gates ainda não existem.

1. Antes de trocar versão: `cpuReport(150)` na versão implantada, mantendo flags e carga comparáveis. Solicitação já enviada ao usuário nesta sessão.
2. Publicar manualmente o bundle local quando a janela anterior terminar; o agente não copiou ao cliente nem publicou.
3. Após aquecimento: executar `powerStatus()` e enviar o resultado; depois `cpuReport(150)` sem mudar flags durante a janela.
4. Observar produção das cadeias e conclusão de transferências reais. PendingSend por um curto intervalo é normal; pending persistente/uncertain, contabilização incompleta, erro de efeito ou parada de cadeia precisam ser investigados antes do operador.

Sem tráfego de transferências ou efeito de lab real, isso valida somente caminhos que efetivamente rodaram. O diagnóstico mostrará se há operador/poder já disponível; criação/upgrade e piloto continuam condicionados à escolha explícita e evidência operacional. Não pedir ao usuário que ative powers para este teste de compatibilidade.

## Fontes e validação

Motor público a90d26fc9eb943147799e65d0bf9d4d0d79a2722 e constantes2fb779b26eef9b4b0f412584f6bd47c897949766; fixtures autorais em test/fixtures/0150-terminal-power.json e0150-lab-power.json, com hashes das fontes. [run-reaction](https://github.com/screeps/engine/blob/a90d26fc9eb943147799e65d0bf9d4d0d79a2722/src/processor/intents/labs/run-reaction.js), [mercado/transferências](https://github.com/screeps/engine/blob/a90d26fc9eb943147799e65d0bf9d4d0d79a2722/src/processor/global-intents/market.js). Versão instalada no servidor ainda não identificada; fixtures não são um emulador completo.

Evidência local em graphify-out/validation-0150-b/. Smoke12.645 assertions OK; sintaxe dos19 JS tocados, diff check e build isolado de130 módulos concluídos. Cliente real preservado pelo hash da baseline; bundle local SHA256 a99aeeb8b7b3e5c1f230b818d18fbf5a7ba3943d2175b52bb48c9488fba259f0. Grafo AST atualizado. Nenhum commit/deploy/ativação.

## Próximas partes

Orçamento conjunto de ops com reservas comprovadas, retorno marginal dos destinos, observação/readiness de48h, lifecycle managed/safe e agendamento do operador permanecem pendentes. Diagnóstico de fatos não conclui T11 nem prova retorno. Criação/upgrade são manuais após gates; factory e outros poderes continuam posteriores. Boost mineral0149 não é concluído por esta entrega.

## Baseline live recebida — antes do pacote

Relatório do usuário: cpuReport armado18:29:04, concluído18:39:39, shard3, ticks83711555–83711704. Janela completa150/150, settingsMatch=true, sem intervalos inválidos/perdidos e sem reset. Flags observadas: reuseOrderBook=false; listingPolicy=false.

CPU inferida/cobrada19,74/tick; headroom médio0,26; script pareado17,639 e resíduo não observado2,101; máximo38. Essa folga média não é orçamento garantido para um operador. A tabela de módulos/roles/spans veio de outra janela: parcial46/60, ticks83711660–83711705, script18,50; não atribuir seus custos à janela isolada inteira nem somar spans inclusivos como custos independentes.

Pós-deploy do pacote130 módulos deve manter ambas as flags false para isolar a mudança de código. O padrão local reuseOrderBook=true solicitado pelo usuário permanece; um override persistido false não é sobrescrito pelo deploy. Habilitar true depois desta comparação é experimento separado, sem misturar efeitos. Depois de aquecer: console.log(powerStatus()); cpuReport(150); enviar resultado e verificar transfers/cadeias.

## Primeira janela após deploy — aquecimento ainda não isolado

Relatório recebido: snapshot de powerStatus no tick83711992 às18:59:30; janela CPU83711993–83712142, concluída19:10:13. Completa150/150, mesmas flags false/false, settingsMatch=true, sem intervalos inválidos/perdidos. CPU cobrada20,173/tick, headroom−0,173, script pareado18,38, resíduo1,793, máximo76. Frente à baseline19,74, aumento observado de0,433 CPU (aproximadamente2,19%). Ainda não aprovado o orçamento de CPU.

Boot83711990: a janela começou somente3 ticks depois do reset, enquanto a baseline anterior era de um global antigo. Em cpuAccounting, warmUsed exclui apenas o próprio bootTick; não certifica estabilização de caches. Aquecimento pode contribuir, mas não está demonstrado como causa do aumento. Solicitação de repetição sem deploy, sem mudar flags, já enviada ao usuário.

A tabela de módulos pertence a outra janela, parcial34/60 (83712110–83712143), script17,78. Mostra carga diferente:37,2 chamadas de creeps/tick e14,2 de miners, contra34 e11 na tabela anterior; duas cadeias trabalhando contra três. Esses números contextualizam a diferença, sem permitir atribuir os0,433 a um módulo ou ao pacote. Não somar spans inclusivos nem misturar as janelas de150 e34 ticks.

Snapshot: GPL1, progress400/progressTotal3000, nenhum operador, opsStored0 e nenhuma sala powerEnabled. Nenhum efeito operado em labs/terminais; as rotas com powers reais continuam sem validação live. W7N49 possui powerSpawn com power0/energy5000; isso não representa orçamento livre para investimento. O processamento legado continua habilitado.

Os logs mostram conclusão de produção de750 XLH2O em W7N49 às19:05:14 e deals aceitos posteriormente. Isso comprova avanço da cadeia comum observada, sem comprovar por si só toda a conciliação econômica. O snapshot inicial não tinha incertezas de terminal/cadeia e mostrava transfers terminal-15248 (505 energia para E1N47) e terminal-15249 (427 para W7N49) queued, sem envio confirmado. Como antecede a coleta, não prova conclusão nem travamento posterior; pedir status atualizado junto da repetição.

Decisão: preservar a versão e as flags durante a repetição; não ativar operador, comprar ops ou acrescentar trabalho recorrente antes de verificar CPU aquecida e transferências. Próximos passos de orçamento/lifecycle continuam pendentes. Nenhuma alteração de código, deploy ou ativação foi feita para analisar esta amostra.

## Repetição aquecida e auditoria do escopo publicado

Usuário também observou no Grafana aumento de19,2 para21,7 CPU (+2,5; aproximadamente13%), removendo cold tick e estabilização. Essa evidência de uma janela mais ampla permanece aberta: a amostra isolada seguinte não a invalida e aquecimento não explica por si só o resultado relatado.

Repetição completa150/150 nos ticks83712164–83712313, sem reset, mesmas flags false/false, settingsMatch=true: CPU19,787, script pareado17,91, resíduo1,877, headroom0,213, máximo49. Diferença contra baseline19,74: +0,047 (aproximadamente0,24%); não é queda de CPU nem prova de equivalência estatística. Não pedir outra coleta idêntica antes de aproveitar os dados e auditar o código. Folga continua insuficiente para assumir controlador adicional.

Tabela contextual de módulos agora parcial25/60 (83712290–83712314), diferente da janela150 e da baseline46/60. Miners11→13,6 chamadas/tick e1,930→2,691 CPU/tick; haulers12→12 chamadas e3,841→4,474 CPU/tick. Uma chamada de role corresponde ao despacho de um creep por tick, inclusive se seu run sair cedo ou estiver nascendo; não conta chamadas internas. Maior contagem indica mais creeps com role miner na amostra, sem provar spawn incorreto. Custo médio aproximado por despacho de miner0,175→0,198; crescimento da quantidade não explica sozinho toda a diferença contextual. Sobreposição de substitutos é possível pela política existente de leadTime/TTL, mas não foi demonstrada com os snapshots recebidos.

Auditoria comparou o bundle anterior salvo (SHA256 af6dc58e1103f9f4095c62ac0afa4d6f9cf62c2e19033e10d087549607c9eda9,120 módulos), correspondente ao hash do cliente nas baselines locais A/B, com o bundle130 (a99aeeb8b7b3e5c1f230b818d18fbf5a7ba3943d2175b52bb48c9488fba259f0). Normalizados somente IDs/referências do bundler e marcadores de módulo; miner.js, spawning.js, census.js e cpuMeter.js ficaram idênticos. Evidências e diff completo em graphify-out/validation-0150-live-audit/.

O deploy completo acrescentou10 módulos e alterou22 módulos existentes. Além da compatibilidade de labs/terminal, incluiu preparação de boosts minerais0149 (reservas, proteção de estoque e alimentação; padrão desabilitado) e armazenamento inicial/migração bootstrapStorage0158. Esses componentes já estavam no código local antes de T10-A/B, mas não no bundle anterior implantado. Main agora chama prepareRoom por sala a cada tick e verifica reservas de boosts; hauler/needs/prototypes receberam integração de armazenamento e reservas. Portanto, descrever o deploy inteiro como apenas powers, sem trabalho recorrente novo, foi incorreto. BootstrapStorage mediu0,140/tick na tabela parcial mais recente; esse custo isolado não explica os2,5 CPU relatados no Grafana, e o trabalho indireto nos haulers precisa ser distinguido.

Compatibilidade torna quantidades, reservas e conciliação corretas quando houver powers; não foi implementada como redução imediata de CPU. Sem efeitos ativos não há ganho operacional dos powers nesta coleta. reuseOrderBook permaneceu false: seu reaproveitamento não foi exercitado, apesar do default local true (já presente no bundle anterior).

Status83712163: novos transfers15256/15257 com sent2249/1400 e remaining0, sem pending; recebimento0/1366 respectivamente. Isso exercitou confirmação de envio, mas descarga continua pendente, com motivos withdraw−4 e sem hauler disponível. Não classificar como falha de envio nem como entrega concluída; as operações15248/15249 anteriores desapareceram do status de ativas, o que sozinho não prova seu estado final. Sem incertezas de cadeia/terminal; nenhum operador/efeito ativo.

Próxima investigação: usar o diff completo como limite do deploy, revisar custos dos caminhos sem reserva/efeito e o comportamento indireto de bootstrapStorage/haulers; correlacionar população/renovação e CPU por role na janela do Grafana já disponível. Corrigir somente um caminho com causa demonstrada e comparar pacote isolado. Não alterar política de miner, desligar reservas de recuperação ou ativar powers com base apenas nessas médias. Nesta etapa houve análise/documentação, sem alteração de código, build ou deploy.
