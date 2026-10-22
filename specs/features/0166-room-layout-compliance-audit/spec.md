# 0166 — Auditoria read-only de layout e defesa

- **Status:** planned
- **Owner:** a definir após revisão
- **Created:** 2026-10-21
- **Linear:** [ARK-212](https://linear.app/arkemenes/issue/ARK-212/0166-auditoria-read-only-de-layout-e-defesa)

## Problem

O planejador persiste em `planStore` uma lista de edifícios por sala e `architect` compara esse plano para criar construction sites. Não há uma auditoria read-only que explique se o layout atual corresponde ao plano, se uma diferença ainda é progresso normal ou se uma peça planejada está ausente/divergente. Também falta um relatório explícito de cobertura das ramparts do perímetro planejado.

Uma comparação ingênua geraria alertas durante as etapas parciais do planejador, antes do RCL necessário ou enquanto um construction site correto ainda está pendente. Uma varredura nova de estruturas/sites também violaria a regra de cache por sala e adicionaria custo repetido.

## Desired outcome

O mantenedor consulta uma sala sob demanda ou recebe uma auditoria agendada de baixa prioridade. O resultado separa itens conformes, sites em andamento, itens bloqueados por progresso/RCL, ausências, tipos divergentes e lacunas defensivas, indicando a causa de cada resultado. A ferramenta não modifica a sala nem persiste cópias do layout.

## In scope

- Auditar salas próprias visíveis que tenham plano ativo, lendo `planStore.getPlan(roomName)` e os edifícios representados no plano. Não gerar plano para sala que ainda não o tenha.
- Considerar o estado parcial (`Memory.rooms[roomName].planStep`/`planned`), `minimalRCL` de cada entrada e o limite por estrutura em `CONTROLLER_STRUCTURES`. Entradas de etapas ainda não gravadas ou ainda bloqueadas pelo RCL não são reportadas como ausência.
- Comparar coordenada e `structureType`. Estrutura correspondente significa conforme; construction site correspondente significa pendente/em andamento; tipo divergente no mesmo ponto significa divergência. Se um limite de RCL ou um site explica a pendência, explicitar essa causa.
- Verificar cobertura defensiva a partir das ramparts registradas em `plan.buildings` pela etapa de defesa do planejador. Uma etapa parcial não é tratada como falha; site de rampart é pendente e não conta como cobertura construída.
- Consultar estruturas e sites apenas por `roomCache.structures(room)` e `roomCache.constructionSites(room)`.
- Oferecer consulta de console `layoutAudit(roomName)` para uma sala e uma rotação agendada, com intervalo configurável. O agendamento começa desabilitado (`planner.layoutAudit.enabled = false`), com intervalo de referência de 1000 ticks quando habilitado. A execução total, somando scheduler e consulta manual, processa no máximo uma sala por tick, segue ordem estável e respeita o governor de CPU.
- Executar agendamento como trabalho opcional de baixa prioridade. Se o governor suspender o trabalho, manter o motivo visível e não contornar a decisão pela consulta manual.
- Retornar resumo compacto e causas, sem persistir snapshots completos ou histórico de resultados em `Memory`. Não alterar plano, estruturas ou construction sites.

## Out of scope

- Criar construction sites, construir, remover, reparar ou corrigir automaticamente qualquer estrutura.
- Recalcular ou modificar layout, mincut, plano ativo ou parâmetros de defesa.
- Auditar salas não visíveis ou sem plano ativo.
- Manter snapshots/histórico persistente das estruturas de cada sala.

## Acceptance criteria

1. Fixtures de plano concluído sem diferenças retornam `status === "compliant"` e não emitem alerta.
2. Fixtures de plano parcial e entradas acima do RCL atual retornam causa de progresso/RCL, sem classificar estruturas ainda não esperadas como ausentes.
3. Fixtures com estrutura correspondente, ausência, estrutura de tipo divergente e construction site do tipo esperado distinguem `compliant`, `missing`, `mismatch` e `sitePending`; cada caso inclui coordenada e causa.
4. Fixtures da etapa defensiva cobrem rampart construída, rampart em site pendente e lacuna de cobertura. Antes da etapa de defesa estar presente no plano, a auditoria informa `defenseDeferred` em vez de alerta falso.
5. O smoke test afirma que uma sala auditada causa no máximo uma busca por tipo por tick via `roomCache`; scheduler + consulta sob demanda não auditam duas salas no mesmo tick, e nenhuma action de construção/remoção/reparo é chamada.
6. O teste de scheduler afirma no máximo uma sala por tick, ordem determinística, intervalo configurado e suspensão pelo governor; consulta manual não ignora uma suspensão.
7. A resposta contém somente o resumo daquela execução; nenhuma estrutura completa ou lista de amostras é escrita em `Memory`.

## Constitution check

- **CPU:** execução agendada é de baixa prioridade, uma sala por tick, reutiliza cache e governor; resultado manual também segue a política de CPU.
- **Memory:** plano vem do `planStore`/segmento existente; cursor e dados derivados ficam no heap. Não salvar snapshots nem game objects.
- **Fail soft:** sem plano, visão, controller ou dados consistentes, retornar resultado com causa e não inferir divergência; erros ficam isolados pelo `guard()` no scheduler.
- **Testabilidade:** fixtures cobrem plano parcial/completo, RCL, sites, tipos e defesa; o smoke confirma ausência de mutações.
- **Configuração:** intervalo e habilitação do scheduler ficam em config, sem thresholds ou cadências hardcoded espalhadas.

## Open questions

Nenhuma decisão de produto está aberta. O comando, o formato do resumo e os defaults conservadores do scheduler estão definidos; a consulta sob demanda permanece read-only e subordinada à política de CPU.
