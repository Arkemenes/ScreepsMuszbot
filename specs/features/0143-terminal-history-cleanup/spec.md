# Limpeza automática do histórico do terminal (ARK-131)

## Problema e resultado

Retenção padrão10000ticks mantém496operações finais/385KB no snapshot live.
O usuário pede remover automaticamente o que terminou e limpar a consulta.
Finalizadas completed/cancelled/failed sem dependentes devem sair na próxima
coleta (cadência existente60ticks ou criação); retenção padrão0, configurável
por terminalOps.operationRetentionTicks. Não manter arquivo paralelo.

Preservar operações ligadas a craft/flip ativos, inclusive descoberta por
owner em migração, pais de recibos retidos, jobs de haulers, intents pendentes
e ordens de mercado ainda existentes com saldo. Remover depois que vínculos
terminarem. Preservar eventos recentes, seenIncoming, totais do craft/flip,
economics e custos das cadeias. Limpar lotTargets órfãos pelo mesmo critério
de proprietário vivo. Consulta terminalOperations() mostra ativas; opção
includeFinalized:true inclui finalizadas temporariamente protegidas/retidas.

## Review

Só mudar10000→0 perderia compras já concluídas antes do flip/craft consumi-las
e pais de recibos/carga antiga. Portanto proteção vem de vínculos vivos,
nunca só de idade. Percurso de pais usa visited e fila limitada aos IDs do
dicionário; ciclos não podem travar coleta. Sem nova varredura de Game.creeps:
usar census.allOwned. Configuração explícita de retenção continua respeitada.

## Aceitação

Teste deve falhar antes:500finais livres somem, sem alterar agregados;
dependentes sobrevivem/reset e são removidos após liberar os vínculos;
eventos/seenIncoming preservados; consulta legível e retenção opcional.
Ganho de CPU live é medido depois, sem promessa proporcional ao volume.
