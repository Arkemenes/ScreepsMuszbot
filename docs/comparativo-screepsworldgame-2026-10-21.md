# Comparativo técnico: ScreepsMuszbot × ScreepsWorldGame

**Data da revisão:** 2026-10-21

**Projeto avaliado:** ScreepsMuszbot, snapshot `036aee64e9ce599adf7d59d42bddf49292fc4dce`
**Referência:** [ScreepsWorldGame, snapshot `8888f08c760b8feedaa49ad88fa371ab18c1108d`](https://github.com/afulle12/ScreepsWorldGame/tree/8888f08c760b8feedaa49ad88fa371ab18c1108d) (2026-10-19)

## Veredito executivo

Não há vencedor global. O ScreepsMuszbot é **melhor** em disciplina de especificação local, harness offline e implementação focada de economia/planejamento que é rastreável ao roadmap. O ScreepsWorldGame é **melhor** em amplitude operacional: scheduler adaptativo, suspensão de salas, cobertura de mercado, inteligência/combate, auditoria de compliance e ferramentas de simulação. Onde um lado tem um mecanismo mais amplo, a comparação considera o mecanismo e sua integração, não a quantidade de arquivos.

O upstream tem mais sistemas, mas seus próprios estados documentados impedem tratar toda capacidade como pronta: a promessa de starvation-free scheduler está em andamento e fora do runtime; remote mining está dark; produção de excedentes é report-only; traffic manager é opt-in; parte da defesa não foi exercitada em evento real. O Muszbot, por sua vez, já tem tiers de CPU por subsystem, métricas, order book compartilhado, população sob demanda em piloto e ferramentas de planejamento/rota, então várias ideias do upstream já têm equivalente e não devem ser copiadas como projetos novos.

**Conclusão prática:** usar o upstream como fonte de padrões para controle de CPU por sala, proteção global de despesas de mercado e simulação/compliance; reaproveitar somente após adaptação à arquitetura local e critérios mensuráveis. Não se recomenda portar o scheduler inteiro nem checkpoint de Memory sem ensaio isolado: o README upstream registra que a primeira garantia de starvation drenou o bucket até 1.000 em cerca de 30 minutos e foi revertida.

## Método e limites

- O runtime foi seguido a partir dos entrypoints, chamadas e pontos de integração; README e docs serviram como índice e fonte de estados declarados, não como prova única.
- A classificação “melhor/pior/igual” é relativa à capacidade concreta descrita na linha. “Incomparável” significa que não há par funcional direto ou que os objetivos/ambientes diferem.
- “Ativo” quer dizer conectado ao caminho de execução observado; “parcial” quer dizer que há implementação, porém com cobertura/ativação limitada; “gated” depende de configuração; “dark” está no repositório, mas deliberadamente fora do caminho ativo; “report-only” observa/planeja sem executar.
- O Muszbot está pinado ao commit indicado, conforme o escopo. O workspace consultado avançou depois desse snapshot em uma alteração pequena de `src/utils/terminalOps.js`; essa alteração posterior não foi usada como evidência para o veredito.
- Não há benchmark comparável de ambos no mesmo shard, configuração, número de salas e janela. Portanto não atribuo vencedor de CPU/throughput em produção; comparo mecanismos estáticos e evidências registradas.
- As contagens de módulos/testes não são comparadas como qualidade: o upstream contém um snapshot público redigido, enquanto o Muszbot tem outra forma de organização e escopo.

## Matriz comparativa

| Domínio | Classificação Muszbot vs. upstream | Estado demonstrável e justificativa |
|---|---|---|
| CPU, escalonamento e operação sob pressão | **Pior** | O Muszbot mede e classifica subsystem/label em faixas de bucket; o upstream soma tiers por seção com throttling por sala e suspensão de salas. A garantia de não-starvation do upstream continua incompleta, então a vantagem é de controle disponível, não garantia comprovada de fairness. |
| Memória, persistência e caches | **Pior** | Ambos mantêm dados derivados/temporários em heap. O upstream também oferece checkpoints sujos a cada 10 ticks, compactação/hidratação e VFS por TTL; o Muszbot usa Memory e segmentos para persistência, com limpeza e caches locais. Checkpoint reduz serialização, mas aumenta complexidade e risco de rollback. |
| Spawn, população e roles | **Igual** | Muszbot prioriza necessidades de bootstrap e tem população sob demanda opt-in/piloto. Upstream centraliza decisões em `spawnManager`, considera economia, suspensão e nichos especializados. Ambos têm política e caminhos de contingência; a amplitude de roles do upstream é incomparável em parte. |
| Economia, logística e mercado | **Pior** | Muszbot tem order book compartilhado, preços temporais/fair price, ledger e operações de terminal com máquina de estado. Upstream cobre mais caminhos e coloca um guard global nas APIs de `deal` e `createOrder`; o guard local observado fica nos fluxos controlados de mercado/terminal, não em todo chamador da API. |
| Labs, factory, boosts e power | **Igual** | Ambos executam produção e reservam insumos; Muszbot tem plano de slots/waves e craft chain. Upstream integra mais operações e prioriza sala com efeito de operador. Sistemas de power/economia não são equivalentes em amplitude e maturidade, mas a base local de planejamento é sólida. |
| Inteligência e observação | **Pior** | Muszbot mapeia salas e usa observers para `observerFor`; upstream centraliza o orçamento no scanner e inclui uma linha específica para deposits. A funcionalidade de deposits é distinta e não tem equivalente local direto. |
| Defesa, rotas e combate | **Pior** | Muszbot tem safe mode, defesa local, regras de segurança em rotas e operações de raid/squad. Upstream inclui mais papéis, monitor de defesa, drenagem de torre, nukes, aliado e bubble; partes são gated e algumas nunca foram exercitadas ao vivo. |
| Construção e compliance | **Pior** | Muszbot planeja layouts, persiste plano em segmento e calcula min-cut. Upstream possui auditoria periódica de divergência entre layout e sala, alertas e `autoBuilder`; adoção do autoBuilder permanece unbuilt. Planejar layout não é a mesma coisa que auditar conformidade depois da construção. |
| Testes, diagnóstico e operação | **Melhor** | Muszbot tem harness offline determinístico e uma trilha local de specs, roadmap e asserts específicos. Upstream oferece simulador inspirado no engine oficial, benchmarks, probes e precommit, mas também lista dívida/known failures. O comparativo é sobre organização/observabilidade; não significa que os testes rodem com a mesma fidelidade ou cubram os mesmos comportamentos. |
| Ferramentas de simulação de mundo | **Incomparável** | O simulador e as campanhas do upstream buscam cenários de uma colônia maior; o smoke harness local é voltado a determinismo e regressão dos subsistemas do Muszbot. Não há equivalência direta de objetivo nem resultado comparável nesta revisão. |

## Diferenças por domínio

### 1. CPU, escalonamento e memória

O Muszbot instrumenta chamadas com `guard`, coleta CPU por spans/janelas e permite tiers configuráveis por label com base no bucket. O loop ainda tem gates específicos para módulos e chamadas que podem ser caras. Isso oferece degradabilidade por subsistema e é coerente com `0162`, concluída no roadmap. O upstream registra seções com tiers e ajusta intervalos, aplica throttling a salas de baixo valor e pode suspendê-las. A integração é mais ampla porque múltiplos gestores consultam `roomSuspender`.

A vantagem do upstream é **capacidade de controle por sala**, não um scheduler comprovadamente starvation-free. O README de referência classifica a garantia de starvation como “in progress, not live” e relata a reversão da primeira tentativa. No Muszbot, controles de bucket e `guard` também não equivalem a orçamento garantido por seção. Sem medições lado a lado, o custo CPU real é **incomparável**.

Na memória, os dois projetos usam heap para caches. O upstream serializa estado sujo em checkpoints com intervalo de 10 ticks e oferece armazenamento virtual com TTL; o Muszbot mantém dados duráveis em `Memory` e usa segmentos para planos, mais uma rotina de limpeza. O checkpoint upstream pode baixar CPU de serialização, mas amplia a janela de perda após reset/erro e exige validar quais dados podem ser reconstruídos.

Evidências: Muszbot [`src/main.js` (guard, loop e gates)](../src/main.js#L168), [`src/utils/cpuTier.js` (tiers)](../src/utils/cpuTier.js#L82), [`src/utils/cpuMeter.js` (registro e spans)](../src/utils/cpuMeter.js#L38); upstream [`bot/kernel.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/kernel.js#L7), [`bot/main.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/main.js#L47), [`bot/cpuGovernor.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/cpuGovernor.js#L81), [`bot/memoryManager.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/memoryManager.js#L7), [`README.md`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/README.md#L257).

### 2. Spawn, população e roles

O Muszbot chama spawn por sala e coloca bootstrap/miner/hauler antes da demanda normal; sua camada `onDemandPopulation` permite piloto por sala e termina a elegibilidade quando as condições deixam de ser seguras. O upstream usa manager central para decisões de spawn, com integração explícita à suspensão de salas e economia. Os dois resolvem prioridade e risco de ficar sem população; a abordagem local é mais localizada, a do upstream é mais abrangente.

Não recomendo copiar o gerenciador upstream ou sua taxonomia de roles. O que faz sentido é comparar as condições de elegibilidade e os sinais de falta de população com o piloto local, mantendo os mecanismos de segurança e fallback atuais.

Evidências: Muszbot [`src/rooms/spawning.js`](../src/rooms/spawning.js#L110), [`src/rooms/onDemandPopulation.js`](../src/rooms/onDemandPopulation.js#L34), roadmap [`specs/ROADMAP.md`](../specs/ROADMAP.md#L52); upstream [`bot/spawnManager.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/spawnManager.js#L1134), [`bot/kernel.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/kernel.js#L19), [`README.md`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/README.md#L190).

### 3. Economia, logística e mercado

O Muszbot compartilha um snapshot de `getAllOrders()` entre os consumidores, agrega preços temporais e estima fair price; terminal ops confirmam créditos, energia e estado da operação. Os caminhos existentes incluem compra/venda, transferência, repricing e flip com filtro de outlier. No upstream, `marketSpendGuard.install()` intercepta `Game.market.deal` e `createOrder`, o que cobre chamadores além do fluxo principal, e registra bloqueios/limites.

O ponto de otimização transferível é o **perímetro de segurança**: o Muszbot já tem bons cálculos e admission control para fluxos conhecidos, mas o código revisado não mostrou a mesma interceptação global de API. Antes de envolver as APIs, seria necessário confirmar todos os chamadores e manter semântica compatível com as operações de terminal já testadas. Evitar afirmar que o Muszbot “não tem guard”: ele já tem controles locais de preço, reserva e execução.

Evidências: Muszbot [`src/utils/orderBook.js`](../src/utils/orderBook.js#L2), [`src/utils/market.js`](../src/utils/market.js#L70), [`src/utils/marketPricing.js`](../src/utils/marketPricing.js#L96), [`src/utils/readinessContext.js`](../src/utils/readinessContext.js#L105), [`src/utils/terminalOps.js`](../src/utils/terminalOps.js#L252); upstream [`bot/marketSpendGuard.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/marketSpendGuard.js#L98), [`bot/main.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/main.js#L739).

### 4. Labs, factory, boosts e power

O Muszbot calcula slots de lab e waves, separa reação/craft chain, e usa executor e estruturas para aplicar as operações. O upstream reúne reação, boost, fábrica e power dentro de módulos que consultam prioridade da sala; o caminho `labManager.powered` recebe prioridade crítica para evitar perder o efeito do operador. Ambos demonstram planejamento e reservas. A diferença principal é o acoplamento do upstream à governança por sala e ao restante da economia.

O roadmap local ainda descreve Power/GPL como em progresso: compatibilidade de deals, sends, labs e diagnóstico existe, mas operação/lifecycle/readiness e piloto permanecem pendentes. Portanto, marcar Power local como ativo por causa de um módulo `operator` seria exagero.

Evidências: Muszbot [`src/utils/labSlots.js`](../src/utils/labSlots.js#L93), [`src/structures/lab.js`](../src/structures/lab.js#L10), [`specs/ROADMAP.md`](../specs/ROADMAP.md#L50); upstream [`bot/main.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/main.js#L60), [`bot/labManager.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/labManager.js#L2714), [`README.md`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/README.md#L204).

### 5. Inteligência, defesa, rotas e combate

O Muszbot rastreia inteligência da sala, aplica filtros a raids, tem defesa/safe mode e caminhos multi-sala que consideram perigo e estado conhecido. O upstream tem scanner com orçamento central, observação para deposits, IFF, monitor de defesa e maior variedade de papéis defensivos/ofensivos. Isso dá vantagem de cobertura ao upstream, enquanto a rota local tem critérios e proteções detalhados.

Estados upstream importam: README lista remote mining como dark e produção de excedentes como report-only; traffic manager depende de flag; várias capacidades de defesa/allies são live, mas não foram observadas durante evento real. Essas capacidades são possibilidades e não evidência de ganho operacional já obtido. Deposits/nukes/allies não têm equivalentes locais diretos e por isso não justificam “portar” sem demanda específica.

Evidências: Muszbot [`src/rooms/intel.js`](../src/rooms/intel.js#L16), [`src/rooms/defense.js`](../src/rooms/defense.js#L65), [`src/rooms/remotes.js`](../src/rooms/remotes.js#L145), [`src/rooms/raiding.js`](../src/rooms/raiding.js#L146), [`src/utils/routing.js`](../src/utils/routing.js#L35), [`src/utils/observer.js`](../src/utils/observer.js#L20); upstream [`bot/main.js` (orçamento de scanner)](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/main.js#L1021), [`bot/depositObserver.js`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/depositObserver.js#L366), [`README.md`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/README.md#L257).

### 6. Construção, testes e diagnóstico

O arquiteto local cria plano determinístico, guarda em RawMemory segment e controla posicionamento e construção; o min-cut contribui à defesa. Não encontrei equivalente local ao ciclo upstream de auditoria de conformidade pós-construção que compara estrutura planejada com construída e emite alertas. O `autoBuilder` upstream executável é outra capacidade, mas a adoção automatizada é marcada como unbuilt.

Nos testes, o Muszbot tem smoke offline que roda `main.loop()` com stubs e muitos casos específicos. O upstream possui harnesses, simulador baseado no engine e ferramentas de benchmark, além de status de falhas conhecidas e debt. A classificação “melhor” local vale para trilha spec→roadmap→smoke e regressões alinhadas ao escopo presente, não para fidelidade do simulador.

Evidências: Muszbot [`src/rooms/architect.js`](../src/rooms/architect.js#L98), [`src/utils/planStore.js`](../src/utils/planStore.js#L59), [`src/utils/mincut.js`](../src/utils/mincut.js#L200), [`test/smoke.js`](../test/smoke.js#L115); upstream [`bot/compliance.js` (auditoria)](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/compliance.js#L1294), [`bot/autoBuilder.js` (runtime)](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/bot/autoBuilder.js#L2702), [`README.md`](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/README.md#L257).

## Otimizações propostas para ScreepsMuszbot

Prioridades consideram impacto plausível, risco e lacunas locais. São propostas para backlog, sem abertura automática de issues individuais. A coluna “sobreposição” aponta o que já está no roadmap/Linear; não deve ser duplicado.

| Prioridade | Proposta e ponto de integração | Benefício esperado | Risco/dependência | Critério de validação | Sobreposição conhecida |
|---|---|---|---|---|---|
| **P1** | **Throttling e suspensão segura por sala.** Estudar um shedder de sala acima dos tiers atuais; integração em `main.js`/`cpuTier` e antes de chamadas por sala em `rooms/*`, spawn e managers. Manter salas com ameaça, recuperação, gap de creep, ou ação crítica inelegíveis. | Reduzir CPU de salas de baixo valor quando o bucket cai, preservando atuação de salas críticas. | Alto risco de starvation econômica/defensiva; upstream ainda não tem starvation guarantee ativa e já reverteu uma tentativa. Exige telemetria de custo por sala, memória estável de elegibilidade, ordem de retomada e proteções. | Em replay/smoke multi-room, nenhuma sala crítica é suspensa; salas suspensas retomam em ordem determinística; em janela live controlada, CPU cai sem queda nos indicadores de defesa/spawn e sem suspensões que excedam timeout configurado. | Relaciona-se ao `0162` concluído, ARK-116/128 e `0156` em progresso; proposta específica é controle por sala, não duplicar tiers por subsystem. |
| **P1** | **Proteção global a operações de mercado.** Introduzir boundary opcional ao redor de `Game.market.deal/createOrder` ou provar que toda chamada passa pelo executor `terminalOps`; compartilhar preço teto, referência de custo/energia e reserva/ledger. Integração provável em bootstrap antes de qualquer mercado e em `readinessContext`/`terminalOps`. | Impedir uma chamada nova ou futura de ultrapassar teto de preço ou gastar créditos fora da política, além de registrar bloqueios centralmente. | Compatibilidade com `marketFlip`, tarefas de compra e APIs de console; não bloquear operação válida por cotação ausente, nem duplicar reserva do ledger. Revisar quem pode instalar/wrap a API. | Harness testa todas as chamadas conhecidas a `deal/createOrder`, preço acima/abaixo do teto, cotação obsoleta, execução repetida no tick e relatório do motivo; zero mudança em operações já elegíveis. | `0098` já concluiu operações de terminal; `0163` uso do terminal, `0156` economia CPU e tarefas de market/ledger existentes. É uma camada de cobertura, não uma nova máquina de operação. |
| **P1** | **Budget explícito e retomada de tarefas fatiadas.** Para rotas/craft/planning já fatiados, registrar progresso durável, custo e motivo de adiamento; concentrar contrato de orçamento junto a `cpuTier`, `routing` e planejadores. | Evitar trabalho que começa sem CPU restante e reduzir latência imprevisível de operações longas sob bucket baixo. | Pode adicionar escrita em Memory e adiar tarefas indefinidamente; precisa de stall guard e reserva do custo obrigatório do tick. | Testes com CPU sintética baixa verificam progresso monotônico, limites por tick, retoma após reset/skip e não bloqueio de defesa/spawn. Medição live depois compara p50/p95 e conclusão de rota/plano. | `0156` cita scans fatiados/latência e `0147` estado estacionário; não duplicar redução de CPU já coberta por essas specs. |
| **P2** | **Experimento isolado de checkpoint de dados quentes.** Medir custo de serialização antes de alterar persistência; selecionar um dataset reconstruível e pouco crítico, integrar checkpoint sujo com `memoryCleanup` e convenção de `Memory`/heap. | Se serialização de dados mutáveis for custo relevante, reduzir CPU em ticks sem alteração e tamanho serializado. | Janela de dados perdidos, inconsistência entre heap e Memory e expansão do escopo de migrações. Não aplicar aos dados de economia/locks sem protocolo de recuperação. | Benchmark offline determinístico mede CPU de serialize, tamanho e recuperação após reset; vantagem estável no perfil alvo; invariantes/reconstrução confirmadas. Só depois considerar rollout por flag. | `0146` limpeza de Memory concluída; `0145` régua de CPU e `0147` caches/probes estão no roadmap. É experimento distinto, não recomendação de trocar toda persistência. |
| **P2** | **Arbitragem e prioridade de pedidos de observer.** Auditar o consumidor de `observerFor` e criar fila com prioridade, TTL e dedupe apenas se existirem pedidos concorrentes; integrar em `utils/observer.js` + `rooms/intel` e estados de missão. | Menos pedidos duplicados e maior valor por slot de observer entre scouting/intel/rota. | Atrasar atualização de inteligência que alimenta defesa/rotas; o Screeps impõe alcance e cadence próprias. Depende de medir conflito real. | Cenários com pedidos iguais/prioridades concorrentes provam dedupe, expiração, max range e prazo máximo para pedido defensivo; contador mostra redução de chamadas sem aumento de dados stale. | `0147` probes e `0156` safety/observação por tick. A camada atual já localiza observers; não duplicar o helper. |
| **P2** | **Auditoria read-only de plano construído.** Adicionar relatório que compare plano salvo, estruturas, sites pendentes, RCL e proteções; começar em `architect`/`planStore`, emitir diagnóstico pelo console/stats. | Encontrar drift de layout e obstruções sem automatizar construção nem mudar o planejador. | Plano pode ter versão/transformação diferente da sala; evitar falsos positivos durante construção parcial. | Fixtures de layout completo, progresso parcial, estrutura substituída, proteção e limite de RCL; relatório reproduzível com zero falso alerta nos casos válidos. | Roadmap inclui layout e planner; conferência não é equivalente a reescrever `architect` nem a adotar autoBuilder. |
| **P2** | **Expandir cenários de simulação com casos do upstream.** Mapear cenários de scheduler, suspender/retomar sala, preço de mercado e auditoria para stubs em `test/` sem trazer módulos upstream. | Aumentar cobertura de regressão em decisões entre vários subsistemas, especialmente sob CPU baixa e recursos limitados. | Simulador local não reproduz fielmente o engine; fixtures podem cristalizar comportamento incorreto. | Cada cenário tem pré-condição, assertions de estado/API e caso negativo; harness continua determinístico e sem dependência externa. Não é necessário executar testes neste trabalho documental. | `0145` régua/harness e testes tópicos já existem; adicionar apenas cenários com lacuna demonstrada. |
| **P3** | **Painel de estado operacional “ativo/gated/dark”.** Consolidar para cada subsistema: último run, motivo de skip, flag, custo e resultado; aproveitar `cpuMeter`, `stats` e globals de diagnóstico. | Tornar visível quando um recurso existe no código, mas não está rodando por flag, tier, pré-condição ou dado ausente. | Evitar escrita excessiva em Memory e não somar mais overhead de medição que o valor do painel. | Comando read-only lista estados coerentes com o loop; counters agregados e custo da medição entra no próprio orçamento. | `0079` stats/Grafana concluído; extender métricas existentes em vez de criar painel paralelo. |
| **Não priorizar** | Portar `surplusJobs`, depósito, nuke/allies, modelo de scoring/ML ou todo `roomSuspender` sem caso local comprovado. | Potencial de capacidade futura. | Escopo/CPU/safety altos; algumas rotinas upstream estão dark, report-only, gated ou sem observação live suficiente. | Só promover após requisito local, modelo econômico/safety e hipótese testável. | Não há necessidade atual demonstrada no roadmap revisado. |

### Ordem sugerida

1. Levantar todas as chamadas de mercado e decidir se um guard local é necessário fora de `terminalOps`.
2. Instrumentar custo e risco de sala usando a telemetria existente; testar política de elegibilidade em cenário offline antes de qualquer ativação.
3. Medir tarefas fatiadas e custo real de serialização para escolher entre orçamento por tarefa, checkpoint ou nenhuma mudança.
4. Entregar diagnósticos read-only de observer/compliance e acrescentar cenários de regressão apenas onde a análise revelar lacuna.

## Roadmap e backlog consultados

| Trabalho ou tema existente | Estado conhecido na revisão | Como esta comparação evita duplicação |
|---|---|---|
| `0162` tiers por bucket / labels; ARK-198 | done | Não propor tiers por label novamente; throttling por sala é lacuna separada. |
| ARK-116 / ARK-128 / `0147` / `0156` | CPU, estado estacionário, cache/probes e lógica restante em andamento | Otimizações P1/P2 são sugestões de integração/experimento; devem ser reconciliadas com os critérios já aprovados dessas issues antes de abrir trabalho. |
| `0146` limpeza de Memory | done | Não propor limpeza geral novamente; somente ensaio de checkpoint com benchmark. |
| `0148` população sob demanda | in progress | Não substituir política/piloto existente; comparar elegibilidade e governança por sala. |
| `0150` Power creeps e GPL | in progress | Reportar a capacidade como parcial; não abrir issue para “adicionar power” sem concluir readiness/lifecycle atual. |
| `0098` operações de mercado/terminal | done; `0163` terminal usage no roadmap | Guard global é uma camada de segurança que pode ser revisada dentro do fluxo existente. |
| `0079` stats/Grafana | done | Proposta de estado operacional estende a instrumentação já entregue. |
| Issue da comparação | ARK-210 | Issue única para este relatório; recomendações permanecem propostas, sem issues novas automáticas. |

## Fontes e revisões

- ScreepsMuszbot em `036aee64e9ce599adf7d59d42bddf49292fc4dce`; referências locais acima apontam arquivo e linha no snapshot avaliado.
- ScreepsWorldGame em [`8888f08c760b8feedaa49ad88fa371ab18c1108d`](https://github.com/afulle12/ScreepsWorldGame/commit/8888f08c760b8feedaa49ad88fa371ab18c1108d); todos os links `blob` são fixados neste commit.
- README upstream consultado como mapa de estados e escopo: [`README.md` fixado](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/README.md#L34); status board em [linhas 257–280](https://github.com/afulle12/ScreepsWorldGame/blob/8888f08c760b8feedaa49ad88fa371ab18c1108d/README.md#L257).
- Roadmap local: [`specs/ROADMAP.md`](../specs/ROADMAP.md#L38).

## Desdobramento posterior

O levantamento de quais propostas justificam issues, quais já estão cobertas e
os planos para execução ficou em
[`plano-adocao-screepsworldgame-2026-10-21.md`](plano-adocao-screepsworldgame-2026-10-21.md).
Issues criadas: ARK-211 (0165), ARK-212 (0166) e ARK-214 (0167); permanecem no
Backlog para revisão.

## Validação desta entrega

Relatório documental baseado em revisão estática dos snapshots e cruzamento do roadmap/Linear. Foram conferidos os hashes dos commits e as referências de arquivo/linha; não foram executados testes, build, deploy ou alterações de runtime.
