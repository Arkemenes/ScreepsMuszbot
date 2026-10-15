# Transferências recentes no dashboard (ARK-130)

terminalTransferStats já retorna somente eventos na janela recente do bot
(padrão60ticks), mas o exporter só atualiza labels presentes: ao expirar uma
rota, o Gauge conserva indefinidamente seu último valor. A legenda também
usa from/to enquanto o exporter declara from_room/to_room.

Correção: coletor dedicado publica o snapshot atual; rotas que saíram recebem
zero uma coleta, depois desaparecem. Estado auxiliar conserva apenas labels
da coleta anterior. Repetir a mesma coleta não soma eventos. Não alterar
cadência/retentiva do bot nem confundir soma recente com contador vitalício.
Painel filtra energy, usa labels corretos, barras e não conecta intervalos
sem dado. Preservar demais painéis e o índice do usuário.

Review: comportamento zero/ausente é definido; perder uma coleta pode perder
eventos como já ocorre com a janela existente. Não prometer auditoria completa
por uma Gauge. Migração para contadores duráveis fica fora deste ajuste rápido.

Plan: extrair update_terminal_metrics; testar expiração/idempotência/recurso;
ajustar painel241 sobre JSON atual. Tasks: testes, implementação, validação
Python/smoke/build/diff/graphify; aplicação externa exporter/Grafana pendente.

## Follow-up 15/10: zeros na origem

Painel continua exibindo valores antigos. Snapshot esparso vazio não consegue
zerar um exporter antigo que só faz set para labels presentes. Produzir zeros
explícitos por rota conhecida no bot, inclusive após reset, e expirar eventos
também entre publicações completas de stats. Não apagar seenIncoming nem
associar eventos a operações já coletadas. Cache no heap invalida somente
quando eventos mudam, prazo da janela vence ou Memory/tick é substituído.
Zeros persistem por rota, não por transação, e não representam histórico de
negócios. Reutilizar snapshot idêntico entre mudanças para não aumentar CPU.
