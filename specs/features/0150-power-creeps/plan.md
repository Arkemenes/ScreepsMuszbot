# 0150 — Power, GPL e operador — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** planned — execução local autorizada em etapas; não implementada.
- **Issue:** ARK-137; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

powerPolicy.decide é pura: GPL/constantes, target, custo total/restante, payback marginal, preferência e autorização expirada. powerLogistics usa terminalOps e admission/owners persistentes. powerSpawn.run e feedJob consultam autorização viva inclusive para saldo já no spawn.
reactionAmount e política de cauda são primitivas comuns de labPlanModel/runtime/executor; craftLedger contabiliza quantidade conciliada, não 5 fixo.
powerOperator gere Game.powerCreeps em passagem própria sob guard; compartilha lifecycle futuro com 0122, sem habilitar factory.

## Data flow e falhas

Política: recalcular GPL atual e orçamento líquido → reservar lote → feed/transfer → revalidar → processPower → reconciliar progresso/consumo observado. Não contar estoque/listing/trânsito duas vezes; meta alcançada pausa imediatamente. reviewTicks não é validade de autorização.
Cancelamento: powerPlan simula poolAfterCancel de compromissos físicos entregáveis, sem efeitos. Prefixo só sob premissas de pool linear/lastreado; demais casos têm busca pura limitada1000nós e unknown sem prova. Sobrecompromisso/identidade incerta não cancela. Livre cobre déficit → zero cancelamentos. allowCancel + gate válido permite uma submissão; reconciliar e refazer orçamento antes da próxima. Manual/pixel protegido nunca é candidato. Ordem desaparecida não inventa refund/estoque.
Reação: planejar quantidade/cronologia/quotaMode/budget/quotaKey por owner+item+produto+geração → reservar ambos os inputs e capacidade → registrar pending → confirmar e atribuir movimentos → avançar apenas com quota confirmada/pending vazio. Mudança de efeito/owner/capacidade invalida antes do intent. Cauda inexequível vai a replanning/stall guard.
Operador: unspawned/spawnPending/active/safe/renewPending/respawnWait; ler TTL/cooldown/shard antes do próximo intent. managed mantém manutenção em suspensão econômica; entrega manual encerra intents do bot. Reset concilia antes de repetir. Target alterado replaneja logística revogável; custo consumado permanece.

## Validation / Rollout

Fase 0: fixtures de GPL/target maior manual, E=20/31.6/70 e power±30%, banda 24–30 dias, quotes/readiness vencidos, stock no spawn com off, livre antes de listados, físico100 com listagens100+100, ordem sem lastro, pools distintos, busca incompleta e cancelamento parcial/concorrente e dry-run sem mutação.
Suporte operado: testar base e níveis 1–5, último tick, aplicação/renovação bloqueada no mesmo tick, efeitos desconhecidos, capacidade, insumos compartilhados, strict/boundedSurplus, meta10/A7, entrega final e ausência de stall.
Fase 2: coletar baseline 48h do regime atual; demonstrar gargalo marginal, orçamento de ops/energia/reagentes/logística e demanda executável. Criação/upgrade manuais só após autorização separada. Revalidar novo regime antes de expansão. CPU inclui renew/trânsito/coleta; medir contribuição final/venda, não apenas throughput bruto.

## Risks & mitigations

Payback depende de atribuição e demanda: unknown bloqueia investimento. Cancelamento/GPL irreversíveis: dry-run, budget e reconciliação. Operador abandonado no off: gestão safe separada. Overshoot invisível: quotaMode explícito e custo propagado. Buscas/step machines limitadas, nextWakeTick e stall guard no spec.
