# Plan

Identidade persistente de owner/lot nas operações; inferência lazy a partir
das referências legadas de craft/flip e policy swing. `terminalClaims` calcula
reservas físicas e registra intents de retirada no heap. ResourcePolicy
continua responsável pelos compromissos de consumidores e entradas futuras.

API interna `sellLot` recebe quantidade acumulada e chave estável de lote;
agrega somente parâmetros econômicos compatíveis. API manual existente se
mantém, com pedidos independentes. Executor confirma deals/cancelamentos e
contabiliza taxas antes de reaproveitar saldo.

O console `terminalSell` também aceita owner/lotId no sétimo argumento para
atualizar uma quantidade acumulada explícita. Memória de alvos é coletada
quando não existe proprietário ativo e termina a janela de retenção.

Compras usam avaliação efetiva compartilhada com diagnóstico; listing limita
preço pelo orçamento restante incluindo taxas já gastas. BUY listada verifica
negócio imediato antes de publicar/extender. SELL concorrente desconta carga
alheia e protege lastro listado. Jobs de hauler validam reservas ao executar.

Sem novos scans de Game.creeps/room.find, sem objetos de jogo em Memory.
Cadência e prioridades existentes preservadas, com desempate por último deal.
Build local sem cópia automática ao cliente; publicação/live separados.
