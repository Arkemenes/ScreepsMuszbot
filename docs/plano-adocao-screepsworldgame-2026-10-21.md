# Plano de adoção: ScreepsWorldGame → ScreepsMuszbot

**Data:** 2026-10-21  
**Base:** comparativo em [revisões fixadas](comparativo-screepsworldgame-2026-10-21.md), ScreepsMuszbot `036aee64e9ce599adf7d59d42bddf49292fc4dce` e ScreepsWorldGame `8888f08c760b8feedaa49ad88fa371ab18c1108d`.

## Síntese

O levantamento completo transformou em trabalho novo três lacunas com encaixe local claro:

| Prioridade | Feature | Linear | Plano local | Decisão |
|---|---|---|---|---|
| P1 | [0165 — Governor de CPU por sala](../specs/features/0165-room-cpu-governor/spec.md) | [ARK-211](https://linear.app/arkemenes/issue/ARK-211/0165-governor-de-cpu-por-sala) | [plan.md](../specs/features/0165-room-cpu-governor/plan.md) | Integrar os tiers globais com custo por sala e suspender somente tarefas opcionais registradas. |
| P2 | [0166 — Auditoria read-only de layout e defesa](../specs/features/0166-room-layout-compliance-audit/spec.md) | [ARK-212](https://linear.app/arkemenes/issue/ARK-212/0166-auditoria-read-only-de-layout-e-defesa) | [plan.md](../specs/features/0166-room-layout-compliance-audit/plan.md) | Reportar drift e cobertura sem alterar o jogo; baixa prioridade, governor e cache. |
| P2 | [0167 — Postura de defesa por nível de ameaça](../specs/features/0167-room-threat-posture/spec.md) | [ARK-214](https://linear.app/arkemenes/issue/ARK-214/0167-postura-de-defesa-por-nivel-de-ameaca) | [plan.md](../specs/features/0167-room-threat-posture/plan.md) | Promover a ideia DEFCON existente; classificação consumida pela política defensiva, observe-first. |

Todas as issues estão no projeto **ScreepsMuszbot**, time **Arkemenes**, em **Backlog** para revisão. Nenhum runtime foi alterado.

## Disposição das propostas anteriores

| Proposta | Decisão | Evidência e destino |
|---|---|---|
| Governor e suspensão por sala | Criar issue | A separação global por bucket/label não fornece custo ou elegibilidade por sala. ARK-211 define medição, proteção, histerese, retomada e rollout. |
| Auditoria de layout/compliance | Criar issue | O arquiteto constrói a partir de `planStore`, mas não oferece um relatório read-only pós-construção. ARK-212 compara plano, estruturas, sites, RCL e ramparts sem automatizar correções. |
| Market spend guard global | Não criar issue | A busca no runtime encontrou os callsites de `Game.market.deal()` e `createOrder()` em `src/utils/terminalOps.js`; os caminhos locais já passam por operações, reservas e limites existentes (ARK-120/126). Um wrapper global duplicaria o perímetro sem uma chamada de runtime fora do executor demonstrada. |
| Budget geral e retomada de tarefas fatiadas | Não criar issue separada | `src/utils/routing.js` já usa reserva de CPU, orçamento, `maxOps` e gate de rota incremental. `src/rooms/architect.js` avança por etapas, tem stall guard e limita sites por sala. A telemetria por sala cabe em ARK-211; custo de qualquer scan específico deve virar issue somente quando profiling mostrar lacuna isolada. |
| Checkpoint de Memory por intervalo | Não criar issue | A constituição local exige serialização de `Memory` a cada tick. Checkpoint espaçado altera essa garantia e expõe perda/rollback; fica fora até uma mudança constitucional e benchmark/reconstrução aprovados. |
| Arbitragem de pedidos de observer | Coberto | As features 0030, 0031 e 0056 cobrem pedido, prioridade e no máximo uma observação por tick. O código local já tem `observerFor`; não abrir uma fila duplicada sem conflito concorrente medido. |
| Cenários de simulação | Cross-cutting | As fixtures de CPU, auditoria e ameaça foram incorporadas nos critérios dessas features. Não portar o simulador inteiro do upstream nem criar um issue de harness sem caso independente. |
| Painel universal `active/gated/dark` | Não criar issue | O runtime já oferece `cpuTop`, `cpuReport`, `cpuProbe`, `readinessStatus`, `powerStatus`, `onDemandStatus`, `terminalReport`, `labReport` e diagnósticos por subsistema. ARK-211 acrescenta motivo de skip por sala; um registro universal exigiria manter uma segunda fonte de verdade. |
| RoomManager/Empire consolidado | Não criar issue | `utils/census` e `utils/roomCache` já são as primitivas compartilhadas exigidas pela constituição. Não há medição que justifique uma camada nova sobre elas. |
| Postura graduada de defesa | Criar issue | A ideia já estava em `specs/ROADMAP.md`; `needs.js` usa contagem de hostis e `defense.js` calcula risco de queda do spawn separadamente. ARK-214 unifica a avaliação, preserva o limite de safe mode e não automatiza contra-ataques. |
| Deposits, nukes, aliados avançados, remote mining dark, excedente report-only e autoBuilder unbuilt | Não criar issue | Não há necessidade local demonstrada ou a capacidade upstream está desativada/incompleta. Não converter presença de código upstream em benefício comprovado. |

## Ordem de implementação sugerida

1. **0165 / ARK-211:** medir e validar primeiro; usar `observe` e manter `enforce` desligado até uma janela live comparável. A auditoria 0166 depende da interface de elegibilidade/custo do governor.
2. **0166 / ARK-212:** construir o comparador puro e as fixtures; ativar o agendamento só após medir o custo. A consulta manual também respeita o governor e o limite de uma sala por tick.
3. **0167 / ARK-214:** consolidar classificação e observação sem ação; só depois usar níveis para reforço defensivo. O cálculo atual de safe mode continua sendo o limite final.

## Evidências locais consultadas

- CPU: `src/main.js`, `src/utils/cpuTier.js`, `src/utils/cpuMeter.js`, `src/utils/stats.js`.
- Planejamento e cache: `src/rooms/architect.js`, `src/utils/planStore.js`, `src/utils/roomCache.js`.
- Mercado: callsites `deal`/`createOrder` em `src/utils/terminalOps.js`; políticas/claims em `src/utils/marketPricing.js`, `src/utils/readinessContext.js` e issues ARK-120/126.
- Orçamento de rotas e stalls: `src/utils/routing.js`, `src/rooms/architect.js` e specs 0061/0156.
- Defesa: ideia promovida de `specs/ROADMAP.md`; sinais em `src/rooms/intel.js`, `src/rooms/needs.js`, `src/rooms/defense.js` e `src/utils/combat.js`.
- Observabilidade existente: `src/main.js`, `src/utils/stats.js`, `src/utils/energyReport.js`, `src/utils/terminalReport.js`, `src/utils/labReport.js`, `src/utils/powerStatus.js` e `src/rooms/onDemandPopulation.js`.

## Fonte upstream

Os padrões e estados foram extraídos do snapshot fixado no [ScreepsWorldGame `8888f08c760b8feedaa49ad88fa371ab18c1108d`](https://github.com/afulle12/ScreepsWorldGame/tree/8888f08c760b8feedaa49ad88fa371ab18c1108d), principalmente `bot/cpuGovernor.js`, `bot/marketSpendGuard.js`, `bot/compliance.js`, `bot/memoryManager.js`, `bot/main.js` e o status board do `README.md`. Links de código e contexto constam no [comparativo técnico](comparativo-screepsworldgame-2026-10-21.md).
