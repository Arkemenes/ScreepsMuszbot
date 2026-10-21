# 0154 — Energia, abastecimento e experimentos funcionais

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — T1–T2 publicados; energyReport (0154-B: gasto, utilização de WORK, renda proxy, ETA, cobertura) publicado em 2026-10-20; experimentos (T5–T6) e consumo de 0157 pendentes.
- **Issue:** ARK-133 (filha de ARK-128); pacote T1/T2: ARK-143 (filha de ARK-133).
- **Created / revisão documental:** 2026-10-15.
- **Contrato integrado e aceite:** [planejamento vigente](../../../docs/planejamento-integrado-2026-10-16.md); análises anteriores são históricas.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.

## Problem

O ledger original estimava gasto por chamada OK e duplicava chamadas sobrescritas. T1/T2 agora resolvem slots/prioridades/cap e publicam qualidade local; duty integrado e relatórios completos permanecem pendentes.
Δ de storage não mede renda nem energia acessível; decisões de boost/população exigem entrega sustentável e cobertura confiável.

## Desired outcome / In scope

- Primeiro explicitar estimativa/confirmação e contabilizar intents efetivos segundo o motor; preservar decisões de trabalho e combinações permitidas de ações.
- `energyReport(n=600)` e auto-relatório configurável (proposta 1500 ticks; 0 desliga): categorias existentes, WORK elegível, capacidade integrada e utilização efetiva por ação/role/sala.
- Denominador integra WORK ativo ao longo da janela, respeita spawn/morte/corpo/boost; deduplicar observação por entidade/tick e separar ações/populações.
- Reportar gastos estimados e confirmados/conciliados quando disponíveis, desperdício/unknown, waits de energia/viagem/lab, cobertura e gaps/reset.
- RCL/ETA trata mudança de nível sem salto negativo; RCL8 sem ETA fictícia. Δstorage/terminal inclui explicação de compras/envios e não é harvest.
- Observar energia acessível descontadas claims/reservas, renda, consumo essencial/compromissos, transporte e demanda; reusar census/roomCache e consultas existentes.
- Contexto operacional para 0148/0149/0150 inclui validade/cobertura. Falta de fonte confiável é unknown; não assumir excedente ou duty 1.
- Break-even apresenta hipóteses, unidade, energia de boost, vida produtiva e demanda; separar economia de trabalho fixo de valor da capacidade adicional, sem dupla contagem.
- `experiment.start({name,room,setting,value,metrics,guard,ticks})`: metrics/guard são IDs de estratégias registradas mais parâmetros serializáveis, não funções persistidas.
- Um experimento por sala e por caminho qualificado de setting; overlay em configuração central, owner/geração e base observada, sem reescrever a configuração-base; recusar conflitos e relatar encerramento.
- Encerrar removendo só overlay do owner/geração; configuração-base manual permanece intacta. Invalidar needs em start/stop; em reset remover overlay antes da política normal.
- Acumuladores limitados no heap; Memory só recuperação/configuração e resumos persistentes indispensáveis. Não persistir séries por tick.

### Eventos, estimativa e experimentos

0154-A fornece observações/slots/fluxos para 0157. 0154-B energyReport/experimentos consome 0157, sem dependência inversa: readinessContext não importa relatórios.

Slots: último intent aceito por método/creep/tick, com alvo/quantidade/retorno e cancelamento. Registrar fatos observados durante chamadas e finalizar uma estimativa por tick após os roles; snapshot intratick é marcado parcial. Preservar ordem de intents e presença dos que suprimem outros.
Repair suprime build; upgrade é independente. Mesmo repair sem efeito por alvo concorrente não habilita o build suprimido. Movimentos drop/transfer/withdraw/pickup precedem trabalho no motor; reconstruir apenas quando hooks cobrem a sequência. Caso não coberto é unknown ou faixa explícita, nunca energia inicial tratada como resolução exata.
Teto RCL8 é por controller/tick, acrescido do efeito válido de OPERATE_CONTROLLER; divisão entre creeps é estimada e não pode exceder o teto agregado. Boost aumenta progresso, separado do gasto. Recriar objetos de processamento na fixture do tick seguinte, não exigir um reset textual de _upgraded.
Ledger inteiro permanece estimado. Confirmação geral por delta de store fica fora desta fase; fluxos/produção só são confirmados com fonte atribuível. Não usar estatística de progresso boostado como energia gasta.

Eventos: {originTick,entityId,room,role,action,energyEstimate,effectEstimate,quality,reason}; waits e fluxos têm origem/destino/owner para atribuição. Deduplicar por evento/ação/origem. Perda de cauda no reset vira cobertura unknown. Publicação durável/seq/recibo/ack e fechamento seguem exclusivamente 0157 se o evento alimentar coverage; slots isolados não exigem implementar coverage. Confirmar uma origem fechada unknown não publica o mesmo resultado como evento econômico novo. Fórmulas de utilização/ocupação e qualidade são da [0157](../0157-operational-readiness/spec.md).

Experimento: Memory.experiments guarda {id,room,setting,owner,generation,baseRevision,baseObserved,overlayValue,metricsId,guardId,params,startedTick,deadlineTick,state,reason}. IDs referenciam estratégias registradas, nunca funções na Memory.
Estados: proposed → running → stopping → closed/aborted. config.get aplica overlay somente em settings permitidos e todos os leitores desses settings devem migrar para esse acesso central. Comando controlado de configuração incrementa revisão e encerra overlay; edição direta observável diferente da base aborta na próxima leitura. Mudança direta que volta ao mesmo valor (ABA) não tem intenção detectável, mas a restauração jamais escreve sobre a base.
Stop/guarda/prazo/off/reset remove só overlay com owner/geração iguais, invalida needs e registra motivo; repetir stop não desfaz nova intervenção. Reconciliar overlays no início do tick antes de spawn/políticas, mesmo com experimento off. Overlay conflitante/órfão tem encerramento seguro, sem restaurar valor por comparação simples.

## Acceptance criteria

1. Chamadas OK sobrescritas não duplicam energia; contabilização respeita resolução de intents e limite compartilhado RCL8; estimativa não é rotulada como confirmação.
2. Acumuladores longos e snapshot curto coincidem para a mesma base de eventos/ticks, com um registro efetivo por ação; cobertura/gaps/reset e população variável são explícitos.
3. Utilização por ação distingue 1 trabalhador ativo de vários ociosos; ocupação conta uma vez por trabalhador/tick, preservando gastos/efeitos simultâneos; report automático/RCL/ETA funcionam.
4. Storage 0 com links/containers/renda pode ter energia viável; storage cheio reservado ou sem transporte não; Δstock+gasto sem fluxos completos permanece proxy.
5. Relatório informa benefício realizável/break-even condicional dos compostos, espera e energia de aplicação; sem dados suficientes não autoriza boost/power.
6. Experimento aplica/remove somente seu overlay em fim/aborto/guarda/reset, recusa conflito e não sobrescreve intervenção manual posterior; invalida needs e registra motivo.
7. Sem novo scan de Game.creeps/room.find redundante ou JSON por tick; overhead de coleta e relatórios medido antes de endTick e pode ser desligado.

8. Build+repair do mesmo creep/tick contam só o repair; dois builds contam um; upgrade+build preservam os dois, com orçamento resolvido quando conhecido; movimentação/concorrência não coberta fica unknown, sem usar só energia inicialmente carregada.
9. O caso real de `builder.run` (`opportunisticWork` + `runBuild` no mesmo tick, `builder.js:251` e `prototypes/creep.js:141/159`) não duplica energia;
   dois upgraders no RCL8 somam no máximo o teto do controller (com e sem efeito de operador).

## Constitution check

Reusar census/roomCache; configuração em Memory.settings; dados derivados no heap limitado;
somente ownership/recuperação persistente necessária, nunca objetos de jogo; guard e stall guard.
Observações e relatórios novos antes de cpuMeter.endTick. Preservar cascata crítico → saudável → ótimo e fallback.
Smoke e invariantes verificam comportamento, não só ausência de exceção.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.
