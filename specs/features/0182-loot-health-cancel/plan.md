# 0182 — Plan

`rooms/looting.checkHealth(creep?)` lê os looters vivos via census e o creep
chamador, filtra pela dupla mãe/destino e encerra a missão no limite inclusivo.
O role chama antes de capturar `Memory.lootTarget`/active, e `lootersWanted`
chama antes de produzir novas vagas. A ordem entre roles não altera o cancelamento.

Remover pausas e detecção de ameaça do módulo e do role, inclusive o aviso de
intel no comando. `travelToRoom` recebe `blockHostiles:false`. O fluxo existente
de missão inativa já entrega carga e retorna/recicla; nenhuma nova máquina de
retorno é necessária. Limpar `pausedUntil` legado na checagem evita estado morto
e mantém o pedido atual. Atualizar config/help/specs/arquitetura.

Revisão: cancelar a missão inteira (pedido do usuário), nunca disparar coleta
depois da checagem crítica; preservar entrega de todos os sobreviventes. Dano
observado dispara uma única mensagem por missão, pois finish remove seu estado.
