# 0180 — Plan

`utils/squadBreach` monta uma grade numérica de caminhada e dano a partir do
cache de estruturas/terreno. Dijkstra com min-heap evita quantização do
CostMatrix (custos de ruptura podem ser de milhares de ticks). A busca retorna
caminho completo até alcance do objetivo e o primeiro bloqueio; a aproximação
fica no trecho transitável anterior ao bloqueio. Rampart do objetivo é
selecionado mesmo quando o destino da busca fica fora de seu tile.

Cache por objeto de squad no heap: objetivo, topologia, composição/DPS, TTL e
resultado, incluindo resultado negativo. Não cachear por posição a cada tick;
replanejar periodicamente cobre desvio, dano e reparo. Mudança de IDs/posição/
propriedade/passabilidade ou destruição invalida imediatamente.

`squad` fornece `attackTarget` para os roles e usa a aproximação como destino
do líder (range 0). Fallback antigo permanece quando não houver objetivo
estratégico; plano inviável mantém o líder parado, sem mirar outra muralha.
`defenderStriker` mantém precedência dos creeps armados; `squadDismantler` usa
o mesmo alvo em vez do primeiro find. `roomCache.hostileStructures` evita
repetir FIND_HOSTILE_STRUCTURES entre planejamento, missão e roles.

Revisão: custo absoluto, sem clamp por tile; plano não torna barreiras
fisicamente transitáveis na movimentação. Casos offline cobrem rotas
alternativas reais, camadas, alcance, boosts, cache e execução pelos roles.
