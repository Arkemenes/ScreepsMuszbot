# 0150 — Power, GPL e operador — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — compatibilidade de deals/sends/labs e quotas strict implementada localmente; piloto/ops/lifecycle e aceite live pendentes.
- **Issue:** ARK-137; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

Prioridade de 17/10/2026: labs e terminal, conforme [avaliação e sequência](../../../docs/prioridade-labs-terminal-2026-10-17.md). Os módulos abaixo são propostas, não runtime entregue.

Terminal: primitiva pura de custo/cooldown efetivo compartilhada com terminalOps, terminalFuel e terminalRouting, preservando custo bruto separado do efetivo para impedir desconto duplo. Mapear iniciador/pagador de cada send/deal antes de reservar combustível. Separar requiredEnergy bruto exigido pela API de expectedDebit descontado; preservar buffer físico, conciliar sobra sem lançá-la como gasto. Não alterar política de ordens/cadência global para aproveitar efeito.

Orçamento comum de ops e decisão por retorno marginal para lab/terminal; uma pendência compromete saldo antes de avaliar outro candidato. Reusar cobertura/snapshots; diagnóstico sob demanda. nextWakeTick usa oportunidade concreta, sem polling adicional de todas as salas. Sem efeito e com flags off, preservar comportamento e evitar inicialização pesada.

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
Fase 2: coletar baseline 48h do regime atual; demonstrar gargalo/economia marginal e orçamento de ops/energia/logística; reagentes e demanda executável quando o retorno depende de produção/venda adicional. Economia de frete sobre operações úteis existentes não exige nova venda. Criação/upgrade manuais só após autorização separada. Revalidar novo regime antes de expansão. CPU inclui renew/trânsito/coleta; medir contribuição final/venda, não apenas throughput bruto.

## Risks & mitigations

Terminal T1 custa 100 ops/aplicação para fator0,9; geração T1 ideal é 20 ops/1.000 ticks. Alto volume de anúncios passivos não paga frete próprio. Medir sends/deals próprios, economia arredondada e espera por cooldown. Poll de5 pode absorver vantagem10→9; não responder com poll global de1. Pilotos separados e combinado precisam demonstrar retorno e ausência de aumento sustentado da CPU total frente à baseline comparável (usuário relata19,5/6h). Carga diferente é comparação inconclusiva, não sucesso.

Payback depende de atribuição e demanda: unknown bloqueia investimento. Cancelamento/GPL irreversíveis: dry-run, budget e reconciliação. Operador abandonado no off: gestão safe separada. Overshoot invisível: quotaMode explícito e custo propagado. Buscas/step machines limitadas, nextWakeTick e stall guard no spec.

## Implementação T10-A — 17/10/2026

[Pacote de deals/reservas](../../../docs/entrega-0150-terminal-a-2026-10-17.md) implementado localmente; compatibilidade de sends, concorrência de efeitos e operador continuam pendentes. Não confundir suporte a efeito já observado com ativação do poder.

## Compatibilidade B — 17/10/2026

[Entrega e gate live](../../../docs/pacote-power-compatibilidade-2026-10-17.md): sends deferidos/parciais, quantidade comum de labs e quota strict, cronologia de efeitos e powerStatus sob demanda. Operador/ops/readiness/piloto continuam pendentes; aguardam fatos e validação em jogo antes de acrescentar controle ativo.
