# 0154 — Eventos de energia, relatórios e experimentos — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — etapa 2/T1–T2 implementada localmente; coleta ampliada, relatórios/experimentos e aceite live pendentes.
- **Issue:** ARK-133; pacote T1/T2 em ARK-143; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

### Implementado localmente — etapa 2/T1–T2

energyWork.js resolve slots no heap, prioridade/energia/teto RCL8, efeito separado e qualidade. energyLedger.invoke observa antes da chamada e conserva status/exceção; os call sites de WORK existentes usam essa entrada. Hooks auxiliares observam apenas slots relevantes, com uma passagem por corpo/entidade/tick, sem scan de Game.creeps/room.find. Registros detalhados de events() são construídos apenas quando solicitados.

Main finaliza sob guard após executores e antes de stats/endTick; stats publica energySpent e energySpentQuality (versão, tick, janela, parcialidade, estimativa, faults/gaps/off, efeitos). Históricos são apenas heap, na janela existente; falha do observador invalida cobertura e não impede ação/recuperação no próximo tick.

Default do reparo do ledger existente: energyLedger.observeWork=true; false suspende coleta WORK a partir do próximo tick, sem modificar ações nativas. Ganho/custo CPU ainda não medido live. Essa correção não liga experimentos/população/boost/power. Contrato/detalhes e fontes: [entrega](../../../docs/entrega-0154-a-2026-10-16.md).

Pacote A: energyLedger/call sites (builder, creep prototypes, pioneer) guardam slots/fluxos e qualidade. Nenhum require de relatório/readiness para observar.
Pacote B: energyReport importa observações e 0157, integra WORK/waits/RCL/estoques e imprime limites. experiment/config adiciona overlay apenas aos settings permitidos; auditar todos os leitores para não contorná-lo.
Main reconcilia overlays antes de spawn; finaliza observação depois dos roles e antes de endTick, sob guards distintos. autoReportTicks proposto1500; zero desliga impressão, não recuperação.

## Data flow e falhas

Observar chamada/retorno/cancelamento → substituir slot da ação → finalizar estimativa por regras de prioridade → agregar evento de origem uma vez → 0157 calcula → report apresenta.
Fluxos de energia têm origem/destino/owner e classificação de atribuição; interno não vira renda. Movimento ou concorrência não cobertos deixam estimativa desconhecida/faixa explícita. Cap RCL8 é compartilhado; alocação entre creeps não vira confirmação.
Snapshot intratick é parcial; acumulador final não o soma como outro evento. Reset perde cauda não persistida e abre lacuna.

Experimento proposed/running/stopping/closed/aborted salva somente registro serializável e overlay por owner/geração. Config base permanece intacta. Setter controlado incrementa revisão e aborta; alteração direta observável aborta na leitura. ABA direto não é detectável, sem promessa de detectar intenção.
Guarda/off/deadline/reset remove só overlay do próprio owner, invalida needs e relata. Boot recupera antes da política, mesmo com feature off. Nenhuma restauração por igualdade simples do valor aplicado.

## Validation / Rollout

Fixtures reais de builder duplicado, prioridades, cancelamento, transfer/drop/withdraw/pickup, alvo concorrente, RCL8 com dois creeps e novo tick, corpo/boost. Gasto sempre estimado, separado de efeito.
Relatório: janela longa/curta da mesma base, WORK por tick, build+upgrade com ocupação única, RCL mudando, RCL8 sem ETA, Δstock explicado.
Experimento: conflitos sala/setting, fim/guarda/reset/off/manual/ABA e remoção idempotente de overlay com nova geração.
Offline mede scans/hooks/limites; live mede overhead, atribuição e break-even observável. 0157 consome A; B consome 0157; não há ciclo.

## Risks & mitigations

Confundir OK com execução: qualidade explícita e fixtures deferidas. Perder energia em transit: atribuição e unknown. Override invisível: lista de settings permitidos e auditoria dos leitores. Ganho de boost superestimado: demanda/ação/vida produtiva separadas. Recuperação viva independente da flag de relatório.
