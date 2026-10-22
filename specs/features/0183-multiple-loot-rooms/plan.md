# 0183 — Plan

`rooms/looting` centraliza o mapa de missões e IDs persistentes (`lootSequence`
+ Game.time), migração do singleton e resolução por `lootId`. Entrada migrada
tem `legacy` temporário para adotar apenas creeps antigos com a mesma dupla;
novas missões exigem ID e não absorvem looters retirados.

`findMission` resolve a dupla para comandos, `forCreep` resolve identidade,
`checkHealth(mission, creep?)` e `finish(mission, reason)` atuam somente nela.
`lootersWanted` soma vagas da mãe; `nextLoot` escolhe a missão menos atendida.
O role usa a missão resolvida, gera spawnData com ID e preserva a entrega de
carga quando sua missão acaba. Não há pausa por ameaça.

Spawning ignora veredito ocioso quando há vagas de looter. Help/status/cancel
descrevem a pluralidade. Regressões anteriores passam a consultar a missão
explicitamente; novas verificam destinos, mães, cotas, mortes, saúde, término,
legado, reinício e reativação de spawn.
