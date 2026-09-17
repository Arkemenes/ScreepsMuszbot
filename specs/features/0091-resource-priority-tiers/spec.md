# 0091 — Política global de tiers para recursos e ações

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-17

## Problem

As decisões de coleta, entrega e consumo de energia estão espalhadas por
`roles/hauler.js`, `roles/remoteHauler.js`, `roles/bootstrap.js`,
`roles/builder.js`, `roles/upgrader.js`, `structures/tower.js`,
`structures/link.js` e jobs de lab/factory/power spawn. Parte delas já usa
criticidade, reserva ou `resourceTiers`, mas não existe uma política global
nem uma API comum para ordenar candidatos.

Isso permite inconsistências: um `remoteHauler` pode escolher `storage` antes
de uma necessidade crítica de spawn; jobs não energéticos podem começar quando
há uma torre crítica; e adaptadores diferentes podem criar suas próprias
interpretações de "urgente", "estável" e "abundante". O resultado pode ser
energia parada no destino errado, consumo opcional durante instabilidade e
manutenção difícil.

A ausência de um estado econômico observável também dificulta distinguir, no
Grafana, uma sala que está crítica por spawn, controller, defesa ou reserva.

## Desired outcome

A economia passa a classificar cada sala como `critical`, `stable` ou
`abundant`, usando uma reserva local e sinais operacionais compartilhados. Uma
API pequena ordena candidatos por tier e prioridade, enquanto cada consumidor
mantém seu adaptador específico e continua executando a ação. Consumidores
críticos podem atravessar a reserva emergencial; consumidores satisfatórios só
atuam com a economia estável; hardening ótimo de `STRUCTURE_WALL` e
`STRUCTURE_RAMPART` só atua com abundância real. O sistema expõe o estado e o
motivo no `Memory.stats` para monitoramento.

## In scope

- Criar uma política global de prioridade com os estados:
  - `critical`: há risco de perda, paralisação ou interrupção operacional.
  - `stable`: não há consumidor crítico e a reserva normal está preservada.
  - `abundant`: estado estável com reserva abundante disponível.
- Criar uma API pequena de seleção que receba candidatos declarativos com
  `tier`, `priority`, `allowed` e `target`, ordene por tier e prioridade e não
  execute efeitos colaterais.
- Centralizar/configurar os pisos iniciais:
  - `logistics.reserveRatio = 0.01` para a reserva normal.
  - `logistics.emergencyReserveRatio = 0.05` para a reserva emergencial.
  - `logistics.storageSatisfactoryRatio = 0.50` para abundância do storage.
- Usar reserva emergencial quando `defenseActive`,
  `resourceTiers.controllerCritical(room)` ou outra ameaça real ao spawn
  estiver ativa.
- Manter os consumidores comuns em dois tiers, `critical` e
  `satisfactory`.
- Manter `STRUCTURE_WALL` e `STRUCTURE_RAMPART` em três tiers:
  `critical`, `satisfactory` e `optimal`; `optimal` só pode consumir acima da
  reserva abundante.
- Definir a prioridade dentro do tier crítico como:
  1. spawn sob ataque ou produção mínima ameaçada;
  2. controller próximo de downgrade;
  3. spawn/extensions normais;
  4. defesa opcional;
  5. estruturas prestes a quebrar;
  6. outros consumidores críticos.
- Adaptar inicialmente `hauler`, `remoteHauler` e `bootstrap` para nunca
  iniciar uma ação satisfatória enquanto houver consumidor crítico conhecido.
- Fazer `remoteHauler` usar a criticidade da sala-mãe ao entregar recursos.
- Preservar a regra de preempção:
  - vazio ou sem recurso retirado: pode abandonar o job;
  - já carregando: termina a entrega atual, salvo emergência absoluta.
- Fazer jobs de lab/factory/power spawn respeitarem a estabilidade econômica
  no abastecimento; não interromper uma reação ou produção já comprometida.
- Manter safe mode separado da política econômica: `checkSafeMode()` continua
  sendo o último recurso para destruição iminente e seu estado ativo não altera
  diretamente os tiers.
- Expor em `Memory.stats.rooms[name]`:
  - `economyState`: `critical`, `stable` ou `abundant`;
  - `economyReason`: motivo dominante (`spawn`, `controller`, `defense`,
    `reserve` ou `none`);
  - `criticalConsumers`: quantidade de consumidores críticos conhecidos.
- Adicionar assertions ao `test/smoke.js` para cada tier, reserva, desempate,
  preempção e estado econômico cobertos pela implementação.

## Out of scope

- Transferências automáticas entre salas nesta feature.
- `Terminal.send()`, custo de transferência, cooldown, expiração de pedidos e
  balanceamento intersalas. Isso será uma feature futura que consumirá o
  estado econômico atual.
- Usar terminal como reserva local ou como fonte automática da cascata local.
- Igualar salas por percentual de storage nesta feature. A futura política
  intersalas poderá equilibrar salas abundantes quando a diferença superar
  20 pontos percentuais, em ciclo configurável de 1000 ticks ou imediatamente
  diante de uma sala crítica.
- Fazer `priority.pick()` executar `transfer`, `withdraw`, `repair`,
  `produce` ou qualquer outra ação nativa.
- Alterar o critério de ativação de safe mode para transformá-lo em um
  consumidor ou tier econômico.
- Forçar tiers sobre a coleta física de source/mineral, que continua limitada
  por capacidade, regeneração e destino físico disponível.
- Reescrever de uma vez todos os consumidores já alinhados, como `tower`,
  `builder`, `link`, `upgrader` e `spawning`; eles podem ser migrados em
  etapas posteriores sem mudar comportamento validado.

## Acceptance criteria

1. `test/smoke.js` asserts que uma sala sem consumidor crítico, com a reserva
   normal preservada, é classificada como `stable`.
2. `test/smoke.js` asserts que `defenseActive` ou
   `controllerCritical(room)` ativa a reserva emergencial e impede ações
   satisfatórias/ótimas, mas não impede um candidato crítico.
3. `test/smoke.js` asserts que uma sala com storage acima de
   `storageSatisfactoryRatio` e sem urgências é classificada como `abundant`.
4. `test/smoke.js` asserts que `STRUCTURE_WALL` e `STRUCTURE_RAMPART` podem
   selecionar `optimal` somente em estado `abundant`; estruturas normais não
   ganham esse tier.
5. `test/smoke.js` asserts que a API seleciona primeiro o menor tier elegível,
   depois a maior `priority`, e não executa o callback ou ação do candidato.
6. `test/smoke.js` asserts que um `remoteHauler` entrega em spawn/extension ou
   outro consumidor crítico da sala-mãe antes de storage e consumidores
   satisfatórios.
6a. `test/smoke.js` asserts que um `hauler` entrega em spawn/extension vazio
  antes de uma torre em `497/1000`, mesmo quando a torre está abaixo do
  threshold de refill.
7. `test/smoke.js` asserts que um `hauler` não inicia `mineralJob` enquanto
   existir uma torre crítica ou outro consumidor crítico conhecido.
8. `test/smoke.js` asserts que `bootstrap` considera consumidor crítico antes
   de link/container e preserva o fallback existente quando não há urgência.
9. `test/smoke.js` asserts que um job satisfatório já carregado termina a
   entrega atual, enquanto um job ainda sem recurso pode ser abandonado diante
   de uma urgência crítica.
10. `test/smoke.js` asserts que lab/factory/power spawn não recebem novo
    abastecimento opcional durante instabilidade, sem interromper uma operação
    já abastecida e comprometida.
11. `test/smoke.js` asserts que `Memory.stats.rooms[name]` expõe
    `economyState`, `economyReason` e `criticalConsumers` com valores
    determinísticos.
12. `node test/smoke.js "$(pwd)"`, `node --check` nos arquivos tocados e
    `npx grunt` permanecem verdes.

## Constitution check

- **CPU:** a política deve reutilizar `census`, `roomCache` e caches existentes;
  não adicionar `room.find` por creep nem recalcular candidatos em loops
  repetidos. O estado econômico deve ser calculado no máximo uma vez por
  sala/tick.
- **Memory:** somente o estado pequeno e observável de `Memory.stats` e
  configurações persistentes será gravado. Candidatos, funções e dados
  derivados ficam no heap; nenhum objeto de jogo vai para `Memory`.
- **Fail-soft:** `allowed`, classificadores e adaptadores devem falhar de
  forma isolada, tratando sala sem storage, controller ausente e estruturas
  destruídas sem abortar o tick. Toda chamada nova no `main` continua sob
  `guard`.
- **Deterministic and testable offline:** cada decisão de tier, reserva,
  desempate e fallback terá assertion no smoke test, incluindo o caso sem
  storage.
- **Roles thin:** a API de prioridade e o estado econômico ficam em `src/utils`;
  roles apenas montam candidatos e executam o alvo escolhido.
- **Config over hardcode:** pisos, multiplicadores, tolerâncias e intervalos
  ficam em `utils/config.js`.
- **Prefer the no-op:** produção e hardening opcionais não consomem energia
  durante instabilidade; a coleta física continua respeitando seus limites
  naturais.
- **Spending cascade:** toda decisão de gasto segue `critical → satisfactory`
  e, para walls/ramparts, `→ optimal`, com fallback quando houver capacidade
  real e nenhum candidato mais urgente.

## Open questions

- Nenhuma. A transferência e o balanceamento intersalas ficam explicitamente
  reservados para uma feature futura de terminal.
