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
            ],
        },
        {
            title: "Ofensiva",
            commands: [
                ["addTargetEnemy(name)", "adiciona um jogador à lista de alvos ofensivos válidos (opt-in - por padrão o bot só faz defesa/PvE)"],
                ["removeTargetEnemy(name)", "remove um jogador da lista de alvos ofensivos"],
                ["listTargetEnemies()", "lista os alvos ofensivos atuais"],
                ["raidRoom(roomName, motherRoomName?)", "despacha um raider - sala neutra com invader core (PvE, sempre liberado) ou sala fraca de um targetEnemy (sem torre/hostil visto, RCL baixo)"],
                ["raidSquad(roomName, mission, motherRoomName?)", "monta um squad de 4 em lockstep 2x2 - mission 'combat' (2 striker + 2 medic) ou 'siege' (2 dismantler + 2 medic); mesma validação de alvo do raidRoom"],
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
                ["boostCreep(creepName, compoundType)", "aplica boost manualmente - acha uma lab com o composto a alcance 1 do creep"],
                ["setFactoryProduct(roomName, resourceType)", "produz uma commodity de nível 0 continuamente (nível 1+ precisa de Power Creep/GPL, fora de escopo - recusa com o motivo)"],
                ["cancelFactoryProduct(roomName)", "cancela a produção ativa do factory da sala"],
            ],
        },
        {
            title: "Mercado",
            commands: [
                ["marketPrice(resourceType?)", "mostra o preco justo temporal e melhor compra/venda atuais; sem argumento lista recursos com preco calculado"],
                ["terminalTransfer(fromRoom, toRoom, resourceType, amount)", "cria uma transferência storage → terminal → destino; valida recurso, salas e energia de taxa antes de enfileirar"],
                ["terminalBuy(roomName, resourceType, amount, maxUnitPrice, createListing=false)", "compra pelas SELL orders de menor custo líquido dentro do teto; sem candidato, só espera/retenta, a menos que createListing:true liste o saldo restante"],
                ["terminalSell(roomName, resourceType, amount, minUnitPrice, createListing=false)", "vende pelas BUY orders de maior retorno líquido acima do piso; sem candidato, só espera/retenta, a menos que createListing:true liste o saldo restante"],
                ["terminalOperations()", "lista as operações de terminal persistentes e seus estados"],
                ["cancelTerminalOperation(id)", "cancela a operação; uma ordem pública gerenciada pelo bot também é cancelada"],
                ["marketFlipStatus()", "modo atual (test/live), tick do último scan, oportunidades encontradas e flips ativos do arbitrador automático (ROADMAP 0110)"],
                ["marketFlipStats()", "contadores acumulados do arbitrador automático: flips concluídos, lucro líquido total, cancelamentos por stall guard, bloqueios por guardrail"],
            ],
        },
        {
            title: "Manutenção",
            commands: [
                ["findCreeps(role)", "lista nome e sala de todo creep vivo desse role, no império inteiro"],
                ["GCStructureMemory()", "limpa Memory.structures de estruturas que não existem mais (rodar de vez em quando, ex.: a cada 10k ticks)"],
                ["profile(ticks=100)", "liga o profiler (screeps-profiler) por N ticks, imprime o relatório de calls/tempo/média por função sozinho no fim e desliga o profiler de novo - não precisa mexer em Memory.settings.profiler na mão"],
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
