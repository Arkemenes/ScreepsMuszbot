# 0113 — Medidor de CPU unificado (níveis L0/L1/L2) e dashboard

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-10-02

## Problem

### Investigação de regressão — ARK-116 (2026-10-12)

Média relatada subiu de 7–8 para 16–18 CPU entre 11/10 e 12/10.
A meta é recuperar média abaixo de 9 CPU, comprovada em jogo. Antes de
atribuir a regressão a scout/claimer, medir os módulos existentes e separar
`routing.realSearch`, `move.localSearch`, `move.native`,
`intel.transitSafety` e `intel.keeperTransit` nos spans existentes.
As medidas incluem callbacks/matrizes das buscas, preservam retornos e
exceções, e não acrescentam buscas, scans, logs automáticos ou dados por
creep na Memory. Spans são inclusivos: não somar seu custo novamente aos
módulos/roles. Testes offline comprovam atribuição e reutilização do cache;
a redução real de CPU permanece pendente de perfil live antes/depois.


O CPU do shard3 ficou perto do limite (20) e achar o gasto exigiu rodar `cpuTop` e
`profile(100)` na mão. Hoje há dois mecanismos separados: o medidor do `guard()` em
`main.js` (por subsistema, só leitura no console) e o `utils/profiler.js` (por função,
só sob demanda). Nenhum publica em `Memory.stats`, então o Grafana não vê CPU por
módulo, role ou função. E o profiler, uma vez ligado, **nunca desinstala os embrulhos**
dos métodos de protótipo: depois de `profile(N)` cada chamada continua passando pela
camada extra até o próximo reset de global (medido: ~2 CPU/tick de diferença).

## Desired outcome

### Diagnóstico ARK-116 — 2026-10-13

Separar `craft.chains` em execução por estado (`craft.chain.working`,
`buying`, `selling`), `craft.strandedSweep`, `craft.startItem` e
`craft.partialSales`. Dentro da política de labs, medir resolução,
perfil logístico, confirmação, seleção/avaliação, entrada e atribuições
(`labPolicy.*`). Medir `hauler.stockPolicy` e `hauler.terminalFuel`
para distinguir estoque/combustível de busca de caminho.

As medições preservam retornos, exceções e a ordem das operações; não
introduzem scans, logs por tick nem mudanças de planejamento. Chaves são
fixas, sem sala/creep/produto. Testar a atribuição usando o executor real
dos labs e manter a produção existente verde. São spans inclusivos, não
CPU adicional a somar ao pai. Ganho e causa dominante continuam sujeitos
à medição live; o diagnóstico não promete redução de CPU.

Um só conceito, `utils/cpuMeter.js`, com três granularidades sobre o mesmo formato de
dado (`{avg, max, calls}` por chave):

- **L0 (sempre):** subsistemas do `guard()` (`modules`).
- **L1 (sempre):** `roles` (por papel de creep), `structures` (por tipo de estrutura) e
  `spans` (pontos críticos nomeados, ex. `hauler.pickMineralJob`, `needs.compute`).
- **L2 (sob demanda):** função a função, ligado e desligado por `profile(N)`. Ao fim da
  janela o top de funções por tempo próprio é publicado (`fns`) e os embrulhos são
  **removidos**, sem custo residual.

Tudo é publicado a cada `stats.cpuWindowTicks` (60) ticks como média por tick em
`Memory.stats.cpu.meter`, exposto ao Prometheus pelo `exporter.py` (label `span`) e
visualizado em painéis novos do dashboard.

## In scope

- `src/utils/cpuMeter.js` (acumuladores em heap, janela, snapshot, `top`/`reset`);
  `cpuTop` passa a usá-lo.
- Medição L1 por role/estrutura no loop do `main.js` e `spans` nomeados nos pontos que o
  profile apontou como candidatos.
- `profile(N)`: publica o top de funções (`fns`) e desinstala os embrulhos ao fechar
  (`profiler.disable()`), re-instalando no próximo `profile(N)`.
- `stats.js` copia o snapshot para `Memory.stats.cpu.meter`.
- `exporter.py`: label `span` para `cpu.meter.{modules,roles,structures,spans,fns}`.
- Painéis novos no dashboard (`screeps-dashboard.json`, cópia em `grafana.json`).

## Out of scope

- Amostragem contínua de função (1 tick em N): descartada a pedido do usuário; L2 só por
  `profile(N)`.
- Alertas do Grafana; histórico além do que o Prometheus já guarda.
- Corrigir os gastos de CPU encontrados (cada um é seu próprio ajuste).

## Acceptance criteria

Correção ARK-116 (2026-10-13): na fronteira de publicação, `cpuTop` usa
última janela fechada se a janela corrente tem zero ticks, identificando
tick de fechamento. Detalhes de terminalOps são spans do mesmo medidor:
não dividir acumulador legado por ticks de outra janela. Testar consulta
imediatamente após publicação, preservação do snapshot e ausência de valor
legado artificial; nenhuma alteração das decisões das operações.

1. `cpuMeter.record(group, key, used)` acumula `cpu`, `calls` e `max` por chave; o
   snapshot traz `avg = cpu / ticks` e `calls` por tick, arredondados.
2. A cada `stats.cpuWindowTicks` ticks o snapshot é regerado e os acumuladores zeram;
   entre publicações o snapshot não muda.
3. `guard()` alimenta `modules`; o loop de creeps alimenta `roles` pelo papel; o de
   estruturas alimenta `structures` pelo tipo (nunca por nome/id de objeto).
4. `cpuMeter.span(key, fn)` mede e devolve o resultado de `fn`, e propaga a exceção.
5. `Memory.stats.cpu.meter` existe após o `stats()` e traz `window`, `ticks`, `modules`,
   `roles`, `structures`, `spans`; `fns` só depois de um `profile(N)`.
6. Ao fechar uma sessão `profile(N)`: o top de funções vai para `fns` (por tick: `self`,
   `total`, `calls`), os métodos de protótipo voltam às versões originais e uma nova
   `profile(N)` instala os embrulhos de novo.
7. `cpuTop(n)` continua imprimindo a tabela e `cpuTop(0)` zera.
8. O `exporter.py` gera `screeps_stat_value{path="cpu.meter.roles.avg",span="hauler"}`.
9. O dashboard tem a linha "CPU por módulo / role / função" com painéis para
   `modules`, `roles`, `structures`, `spans`, `fns` e `calls`.

## Constitution check

- Um `Game.creeps`/`room.find` por tick: o medidor não adiciona passadas.
- Nada de objeto de jogo em `Memory`: só números e chaves de texto.
- Acumuladores no heap; só o snapshot (≈ 60 chaves × 3 números) vai ao Memory.
- Chamadas do `main.js` continuam sob `guard()`.
## Movimento de pioneers — ARK-116 (2026-10-13)

Chamadas normais de `moveToRoom` distinguem `routing.movePlanned` e
`routing.moveFallback`, preservando destinos, callbacks e resultados.
Spans inclusivos separam execução nativa de validação (`routing.realSearch`).
Motivação live: pioneer18,555 e move.native13,695 CPU/tick em 60 ticks;
snapshot mostra travelers sem rota validada. Hipótese do fallback caro
aguarda atribuição; não se alteram políticas de roteamento por suposição.
# ARK-116: atribuição do custo restante do hauler (2026-10-13)

Follow-up at83630308: janela60 total14,535/bucket3141, assignments0,523
sem ganho isolado confirmado; hauler3,632/pickMineralJob1,232. Hipótese de
owner exclusivo descartada: código atual permite concorrência. Próximo
corte em consumerAvailable: saldo físico menos withdrawals pendentes é
limite superior antes das reservas de operações. Se <=0, retornar zero sem
varrer operações/ordens. Nenhum cache entre decisões; novo saldo no mesmo
tick continua avaliado e saldo positivo preserva proteção de carga de venda.

Janela60 at83628440: runMineralJob1,300/2,6calls. Entrega stockPolicy de
energia ao terminal chama fuel.keep duas vezes sem mutação entre leituras:
primeiro decide desvio para storage, depois limita amount. Compartilhar
essa previsão apenas dentro da execução atual; próxima decisão deve
recalcular e enxergar saldo/reserva alterados no mesmo tick. Valores
protegidos e desvio de destino permanecem; medir1leitura em vez de2.

Janela60 at83627489: pickDeliver0,637/2,883calls; cover0,034 e terminalJob
0,020. Próxima correção no seletor: candidatos spawn/extension continuam
filtrados por necessidade/segurança/reservas. Se um deles já está adjacente,
entregar diretamente sem findClosestByPath; se a lista está vazia, não
chamar busca. Candidatos distantes mantêm a busca por caminho e seu fallback.
Prioridade de produção sobre torres/consumidores opcionais permanece.
Teste antes/depois mede chamadas do seletor; ganho live ainda pendente.

Janela atual41ticks at83627372: hauler2,992/6calls, mineral selection0,530.
Parte do role ainda não tem span: segurança, terminal job, execução de
mineral job e seleção da entrega. Instrumentar hauler.cover,
hauler.terminalJob, hauler.runMineralJob e hauler.pickDeliver sem alterar
prioridades, retornos ou intents. Spans são inclusivos; seleção de minerais
e stockPolicy já têm medição, não somar pais/filhos. Nenhum ganho de CPU
é atribuído à instrumentação; aguardar janela em jogo antes de otimizar.
# ARK-116: atribuição do pioneer (2026-10-13)

`routing.graphRoute` inclui a seleção do grafo e validação do cache,
enquanto `routing.graphSearch` permanece restrito à busca nova do engine.
`routing.clearance` inclui leitura do próximo passo e liberação entre creeps.
São spans inclusivos, sem mudanças de política, cadência ou limites de CPU.

`pioneer.pickLoad` mede seleção da fonte em casa, incluindo energia,
reservas e findClosestByPath. `pioneer.travel` mede o fluxo completo de
viagem; spans internos continuam inclusivos. Instrumentação não altera
seleção de fontes, movimento, reservas ou decisões do role.
