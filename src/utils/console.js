// Console command reference. `require`d once (side-effect) by utils/index.js
// so `help()` is always available from the Screeps console, whether or not
// the module that owns a given command has run yet this tick.
//
// Each command is defined with `global.X = ...` in the module that owns it
// (architect.js, builder.js, scout.js, hostiles.js, memory.js, remotes.js,
// raiding.js, structures/observer.js, pioneering.js, rooms/needs.js,
// roles/hauler.js, utils/census.js, utils/move.js) - this file only prints
// a reference, it doesn't define the commands themselves.
// Keep this list in sync when adding/removing a console command.
global.help = function () {
    const sections = [
        {
            title: "Planejamento de sala",
            commands: [
                ["replanRoom(roomName)", "apaga o plano da sala e reconstrói do zero nos próximos ~13 ticks (não demole nada já construído)"],
                ["replanRoom(roomName, {fresh: true})", "igual, mas planeja só pelo terreno: ignora o spawn atual como âncora e não reaproveita containers/links/torres construídos; nada é demolido, o que ficar fora do plano você remove"],
                ["destroyUnplannedRoads(roomName)", "destrói toda estrada construída que não está no plano atual"],
                ["destroyUnplannedRoads(roomName, true)", "mesma coisa, mas só lista (dry run), não destrói"],
                ["testSpawnPosition(roomName)", "calcula e desenha a melhor posição de spawn pro core da base (não altera o plano)"],
                ["planVisual(ticks=50)", "muda o intervalo de refresh forçado da prévia visual do plano (ela também redesenha na hora que algo é construído/destruído)"],
                ["planVisual(false)", "desliga a prévia visual do plano"],
            ],
        },
        {
            title: "Fila de construção",
            commands: [
                ["prioritizeBuild([id, ...])", "força essa ordem de canteiros primeiro pro builder (aceita 1 id ou array)"],
                ["clearBuildPriority()", "remove a prioridade forçada, volta à ordem normal"],
            ],
        },
        {
            title: "Aliança",
            commands: [
                ["addAlly(name)", "adiciona um jogador à lista de aliados"],
                ["removeAlly(name)", "remove um jogador da lista de aliados"],
                ["listAlly()", "lista os aliados atuais"],
                ["avoidPlayer(name)", "bloqueia manualmente trânsito nas salas conhecidas de um jogador, sem mudar diplomacia"],
                ["allowPlayer(name)", "libera trânsito e apaga bloqueio manual/aprendido; um novo ataque confirmado pode bloquear novamente"],
                ["routeAvoidStatus()", "mostra bloqueios de trânsito manuais e aprendidos, com prazo restante; aprendizado usa eventos de dano e expira por routing.allyAttackAvoidTicks"],
                ["rampartGates()", "mostra, por sala própria, as ramparts-portão calculadas: as poucas que um aliado atravessando a sala (de uma saída a outra) precisa pisar quando todo caminho passa por rampart; elas abrem enquanto há aliado e nenhum hostil/claimer na sala, as demais ficam sempre fechadas. 0 portões = o aliado passa por fora da muralha"],
            ],
        },
        {
            title: "Ofensiva",
            commands: [
                ["addTargetEnemy(name)", "adiciona um jogador à lista de alvos ofensivos válidos (opt-in - por padrão o bot só faz defesa/PvE)"],
                ["removeTargetEnemy(name)", "remove um jogador da lista de alvos ofensivos"],
                ["listTargetEnemies()", "lista os alvos ofensivos atuais"],
                ["raidRoom(roomName, motherRoomName?)", "despacha um raider - sala neutra com invader core (PvE, sempre liberado) ou sala fraca de um targetEnemy (sem torre/hostil visto, RCL baixo)"],
                ["raidSquad(roomName, mission, motherRoomName?)", "cria e retorna o ID de uma squad de 4: 'combat' (2 striker + 2 medic) ou 'siege' (2 dismantler + 2 medic). Pode repetir para o mesmo destino; cada grupo tem montagem independente, com fila por mãe. Aceita até raiding.squadMaxTowers (1) torres e RCL até raiding.squadMaxTargetRcl (8)"],
                ["defendRoom(roomName, motherRoomName?)", "defende uma sala MINHA fraca (ex.: RCL baixo) com um raider da sala-mãe (padrão: a sala própria com spawn mais perto) - ataca só creeps hostis, nunca estruturas; limpa a sala, fica de guarda nela até morrer; repõe se morrer antes"],
                ["lootRoom(roomName, motherRoomName?)", "adiciona uma missão e retorna seu ID; vários destinos/mães simultâneos, reposição até loot.maxHaulers (3) por missão. Repetir a dupla mantém o pedido. Energia só com loot.minEnergyAmount (30) ou mais por fonte; entrega na sala própria mais próxima com espaço para toda a carga em storage ou container, priorizando storage. Torre/creep armado não pausa; vida de qualquer membro em loot.cancelHpRatio (50%) ou menos cancela somente sua missão; sobreviventes entregam a carga"],
                ["cancelLoot(roomName?, motherRoomName?)", "cancela os saques selecionados; sem argumentos, cancela todos. Os looters entregam a carga e são reciclados"],
                ["lootStatus(roomName?)", "lista IDs, mães, destinos e quantidade de looters das missões ativas; aceita filtro por destino"],
                ["cancelDefend()", "cancela o pedido de defendRoom (o raider já em campo continua de guarda)"],
                ["raidRemote(roomName, motherRoomName?)", "despacha um raider em missão de assédio - mata o reserver/miner de um targetEnemy numa sala que ele só reserva (não é dona), sem tocar estrutura nenhuma"],
                ["contestRoom(roomName, motherRoomName?)", "cerco deliberado (attackController) numa sala já reivindicada/reservada por um targetEnemy - lento, várias gerações de creep; sempre manual, nunca automático"],
                ["cancelContest()", "cancela o cerco em andamento de contestRoom()"],
            ],
        },
        {
            title: "Scout",
            commands: [
                ["signRoom(roomName, text, fromRoomName?)", "enfileira uma assinatura de controller; com origem, o scout retorna a essa sala antes de seguir ao destino"],
                ["signRoom(roomName)", "cancela a assinatura pendente dessa sala"],
                ["signQueue()", "mostra a fila de assinaturas pendentes"],
                ["planLayout(roomName)", "prévia do plano de construção da sala (não constrói nada, sala não precisa ser nossa) - usa um observer em alcance se tiver, senão manda o scout"],
                ["cancelLayout(roomName)", "cancela uma prévia de layout pendente/em andamento"],
                ["layoutQueue()", "mostra a fila de prévias de layout pendentes"],
            ],
        },
        {
            title: "Observer",
            commands: [
                ["observe(roomName, ticks=10)", "mantém um observer em alcance apontado pra sala por N ticks (atualiza Memory.rooms via intel; sem fallback pro scout)"],
            ],
        },
        {
            title: "Remote mining",
            commands: [
                ["reserveRoom(roomName, motherRoomName?)", "marca a sala como remote - despacha um reserver (mãe = sala própria mais perto se omitida)"],
                ["unreserveRoom(roomName)", "remove a sala da lista de remotes - reserver/remoteMiner/remoteHauler daquela sala recolhem pra casa"],
                ["claimRoom(roomName, motherRoomName?)", "despacha um reserver pra dominar (claimController) a sala - só 1 claim por vez no império; recusa se a viagem não couber nos 600 ticks de vida de um corpo com CLAIM"],
                ["cancelClaim()", "cancela a ordem de claim pendente - o claimer já em trânsito não é chamado de volta, só a fila de respawn de reposição"],
                ["claimStatus()", "consulta a ordem ativa e o último encerramento: posição, vida restante, fase e retorno da API; desaparecimento sozinho não prova ataque nem expiração"],
                ["routeCheck(fromRoomName, toRoomName)", "mostra a rota sem restrição e a rota evitando hostil (blockHostiles) entre duas salas - usa quando um reserver/claimer fica parado sem avançar, pra saber se é intel de hostil velha, hostil real bloqueando o único caminho, ou nenhuma rota"],
            ],
        },
        {
            title: "Pioneer",
            commands: [
                ["pioneerStatus()", "mostra o resgate automático de sala sem spawn passo a passo: quem tá spawnless, quem foi escolhido pra ajudar, e quantos pioneers faltam/já tem"],
            ],
        },
        {
            title: "População",
            commands: [
                ["setWanted(roomName, role, count)", "sobrescreve manualmente a contagem-alvo de um role numa sala (ex.: mais upgrader com tudo cheio e sem canteiro) - vale até ser removido"],
                ["clearWanted(roomName, role?)", "remove o override de um role (ou todos, se omitido), volta a fórmula normal de rooms/needs.js"],
                ["listWanted(roomName?)", "mostra os overrides ativos de uma sala, ou de todas"],
            ],
        },
        {
            title: "Refino",
            commands: [
                ["setLabReaction(roomName, mineral1, mineral2)", "produz uma reação contínua nos labs da sala (acha 3 labs a alcance 2 sozinho) - ex.: setLabReaction('W1N1', 'H', 'O') produz OH"],
                ["cancelLabReaction(roomName)", "cancela a reação ativa da sala"],
                ["boostPreview(creepName, compoundType, count?)", "prevê partes e custos por lab, sem aplicar nem reservar"],
                ["boostEvaluate(creepName, compound, context)", "avalia retorno estimado com demanda, custos e entrega explícitos; não reserva"],
                ["boostPrepare(creepName, labId, context)", "prepara XLH2O próprio após avaliação; exige boost.enabled e boost.room; ainda não aplica boost"],
                ["boostCancel(roomName, labId)", "encerra preparação e libera o lab somente após limpeza segura"],
                ["boostStatus(roomName?)", "mostra preparação, faltas, pending e encerramento; estoque pronto não significa boost aplicado"],
                ["powerStatus(roomName?)", "diagnóstico somente leitura de GPL, poderes, ops armazenados, labs/terminal e gates pendentes; não ativa operador"],
                ["boostCreep(creepName, compoundType, count?)", "aplica boost manualmente a alcance 1; count inteiro positivo; respeita reservas automáticas"],
                ["setFactoryProduct(roomName, resourceType)", "produz uma commodity de nível 0 continuamente (nível 1+ precisa de Power Creep/GPL, fora de escopo - recusa com o motivo)"],
                ["cancelFactoryProduct(roomName)", "cancela a produção ativa do factory da sala"],
            ],
        },
        {
            title: "Mercado",
            commands: [
                ["terminalFuelStatus(roomName?)", "reserva dinâmica de energia: frete previsto, taxas carregadas, carga protegida, margem e escassez"],
                ["swingStatus(roomName?)", "candidatos do mercado oportunista: preços efetivos, referências, saldo livre e bloqueios; inicia em simulação"],
    ["swingReference(resourceType, kind = \"buy\")", "diagnóstico atual da referência: amostras totais/válidas, mínimo configurado, idade e motivo de bloqueio; kind buy ou sell"],
                ["Memory.settings.swing = Object.assign({}, Memory.settings.swing, {test:false})", "ativa negócios oportunistas; true simula. Logística de estoque funciona nos dois modos"],
                ["Memory.settings.stockPolicy.rooms[roomName].targets", "mapa de alvos de uso no storage por sala (inicialize os objetos antes); reserva de energia do terminal fica separada"],
                ["Memory.settings.stockPolicy.creditReserve", "piso livre compartilhado com flip/craft, padrão 100000; ordens swing têm preço fixo e expiram após 1209600 ticks"],
                ["marketPrice(resourceType?)", "mostra o preco justo temporal e melhor compra/venda atuais; sem argumento lista recursos com preco calculado"],
                ["marketHistoryStatus()", "estado da persistência do histórico: páginas, bytes, segmentos pendentes e erros; usa segmentos 0..9, sem truncar amostras para caber"],
                ["marketHistoryFlush()", "grava/migra agora o histórico já hidratado, sem criar amostra extra nem alterar a cadência; retorna ok e estado da persistência"],
        ["terminalRelayQuote(fromRoom, toRoom, resourceType, deliveredAmount, options?)", "compara frete direto e via hub; apenas cotação, sem envios; energia inclui o desconto do hub"],
        ["terminalRelayStatus(); terminalRelayStats(); setTerminalRelayEnabled(true|false)", "acompanha relay e habilita novas rotas com chave privada e dono aliado do hub; status não exibe a chave"],
        ["message(playerName, text); messageStatus(); setAllyRoom(playerName, roomName) [override]", "descobre salas dos aliados configurados automaticamente; enfileira texto em inglês pelo terminal (1 energia + frete); o hauler abastece o terminal se faltar energia"],
        ["terminalTransfer(fromRoom, toRoom, resourceType, amount)", "cria uma transferência storage → terminal → destino; valida recurso, salas e energia de taxa antes de enfileirar"],
                ["terminalBuy(roomName, resourceType, amount, maxUnitPrice, createListing=false)", "prioriza SELL elegível; máximo inclui frete/taxas e energia usa unidades líquidas. amount é bruto. Sem oferta, publica BUY somente com createListing:true; teto percentual opcional em terminalOps.maxBuyFreightShare"],
                ["terminalSell(roomName, resourceType, amount, minUnitPrice, createListing=false)", "vende pelas BUY orders de maior retorno líquido acima do piso; sem candidato, só espera/retenta, a menos que createListing:true liste o saldo restante"],
                ["terminalSell(room, resource, cumulative, floor, listing, skipFeeCap, {owner:{kind:'manual',id:'meu-lote'},lotId:'produto'})", "opcional: atualiza quantidade acumulada do lote, incluindo o já vendido; retentativas são idempotentes e saldo novo agrega à venda compatível"],
                ["terminalOperations()", "lista as operações de terminal persistentes e seus estados"],
                ["terminalOperation(id)", "mostra uma operação de terminal só (estado, limite, erro e, se não vende, o último motivo em noCandidate: melhor ordem, preço, custo de entrega)"],
                ["cancelTerminalOperation(id)", "cancela a operação; uma ordem pública gerenciada pelo bot também é cancelada"],
                ["marketFlipStatus()", "modo atual (test/live), tick do último scan, oportunidades encontradas e flips ativos do arbitrador automático (ROADMAP 0110)"],
                ["marketFlipStats()", "contadores acumulados do arbitrador automático: flips concluídos, lucro líquido total, cancelamentos por stall guard, bloqueios por guardrail"],
                ["craftStatus()", "modo (test/live), candidatos de fabricação (factory/lab) com custo, receita, margem e T, motivos de descarte por guardrail e disjuntores (ROADMAP 0111)"],
                ["craftScan()", "força um scan de fabricação no próximo tick, sem esperar craft.scanInterval (ainda respeita craft.minBucket) (ROADMAP 0111)"],
                ["craftConfig(all=false)", "mostra os ajustes craft.* sobrescritos em Memory.settings (valor efetivo x padrão); com true mostra todos (ROADMAP 0111)"],
                ["craftReplan(roomName?)", "refaz, com a estratégia de lab atual (craft.labStrategy), as etapas ainda NÃO iniciadas das cadeias de lab em andamento (cadeias abertas antes da estratégia larga mantêm a fila antiga); a etapa que já roda termina como está e nada fica preso no lugar. Sem argumento, todas as salas (ROADMAP 0116)"],
                ["craftCancel(roomName)", "aborta a cadeia de fabricação ativa da sala: cancela ordens abertas, libera créditos e flags; os insumos já comprados ficam em estoque (ROADMAP 0111)"],
            ],
        },
        {
            title: "Manutenção",
            commands: [
                ["findCreeps(role)", "lista nome e sala de todo creep vivo desse role, no império inteiro"],
                ["GCStructureMemory()", "limpa Memory.structures de estruturas que não existem mais (rodar de vez em quando, ex.: a cada 10k ticks)"],
                ["profile(ticks=100)", "liga o profiler por função por N ticks (L2 do medidor de CPU, ROADMAP 0113); no fim imprime o relatório de calls/tempo/média por função e a tabela do cpuTop da mesma janela, publica o top 15 por tempo próprio em Memory.stats.cpu.meter.fns (Grafana) e DESINSTALA todos os embrulhos - sem custo residual. Não precisa mexer em Memory.settings.profiler na mão"],
                ["cpuTop(n=15)", "imprime o CPU da janela em andamento por módulo, role, tipo de estrutura e span nomeado (cpuTop(0) imprime e reinicia a janela). Os mesmos números saem em Memory.stats.cpu.meter a cada stats.cpuWindowTicks (60) ticks e vão para o Grafana"],
                ["cpuReport(n=600)", "mede n ticks novos a partir do próximo tick, limitado ao ring; imprime o balanço isolado após a finalização do último tick. Cobertura/flags diferentes dão incomplete; módulos/roles usam sua própria janela recente. Reset global cancela"],
                ["ordersAudit({gap:0.05, days:7, top:12})", "auditoria só de leitura das ordens próprias do mercado: taxa estimada de criação (5% x preço x total), idade, restante e quanto o preço está acima do melhor concorrente; lista as piores. Faz 1 consulta ao mercado (use só no console)"],
                ["cpuAuditMemory()", "tamanho da Memory por raiz e custo de serializá-las (ROADMAP 0145); só leitura"],
                ["cpuAuditRoomFields()", "tamanho de cada campo de Memory.rooms[*] somado nas salas, com o nome do campo; só leitura"],
                ["moveStats(true/false)", "TEMPORARY (investigação de CPU) - liga/desliga o tally por role de por que utils/move.js repathou (ou não) no último tick"],
                ["moveStats()", "imprime o tally do último tick fechado"],
                ["builderStats(true/false)", "TEMPORARY (investigação de CPU) - liga/desliga a medição do CPU próprio de opportunisticWork() por tick"],
                ["builderStats()", "imprime a medição do último tick fechado"],
                ["resetTerminalLedger(roomName)", "reseta o ledger de retirada do terminal do hauler - usa quando o saldo já existente no terminal ficou preso como \"protegido pra sempre\" (ex.: build antigo, ou saldo de antes desse recurso existir); a partir do próximo tick o saldo atual vira a nova baseline, já liberado"],
            ],
        },
    ];

    console.log("=== Comandos disponíveis ===");
    for (const section of sections) {
        console.log("-- " + section.title + " --");
        for (const [signature, description] of section.commands) {
            console.log("  " + signature + "  ->  " + description);
        }
    }
};
