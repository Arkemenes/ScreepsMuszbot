# 0095 — Coordenação de jobs não energéticos do hauler

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-17

## Problem

`src/roles/hauler.js` só inicia `pickMineralJob()` quando
`resourceTiers.getCriticalConsumers(room) === 0`. Esse gate responde se existe
demanda crítica, não se existe uma fonte de energia que `pickLoad(creep)` possa
usar agora. Assim, spawn/extensions podem estar vazios e sem energia disponível
para transporte enquanto todos os haulers esperam indefinidamente; mineral,
output de lab e output de factory permanecem sem escoamento.

A operação mineral ativa já eleva o piso para dois haulers (0055), mas os dois
executam a mesma decisão sem eleição: nenhum assume o job não energético
enquanto a sala continuar classificada como `critical`. Separar isso numa role
`mineralHauler` duplicaria população, spawn, configuração e fallback, além de
deixar um creep dedicado ocioso durante regeneração/cooldown (decisão original
de 0051 e constitution §7).

## Desired outcome

`hauler` continua sendo a única role de transporte local. Quando não existe
energia acionável, até o único hauler pode executar um job não energético
preemptível. Com dois ou mais haulers e uma saída próxima de bloquear produção,
exatamente um deles assume o escoamento mesmo diante de demanda crítica e
energia acionável; os demais continuam disponíveis para energia. Depois de
retirar qualquer quantidade do recurso do job, o hauler sempre conclui a
entrega em vez de dropar, trocar de carga ou abandonar o recurso.

## In scope

- Trocar o gate de início oportunista: demanda crítica sem uma fonte retornada
  por `pickLoad(creep)` não impede `pickMineralJob()`.
- Manter uma única role `hauler`; não criar `mineralHauler`.
- Coordenar no máximo um `mineralJob` ativo por sala. A reserva vive no heap e
  é reconstruída a cada tick a partir de `memory.mineralJob` dos haulers da
  sala, para não depender da ordem de execução dos creeps.
- Tratar como jobs de escoamento pressionáveis, nesta ordem:
  1. container do mineral;
  2. output lab;
  3. output de factory.
- Usar `mineralHauler.pressureHigh = 0.75` e
  `mineralHauler.pressureLow = 0.50`. Container de mineral e output lab usam a
  ocupação do recurso/capacidade correspondente; factory usa a ocupação total
  do store, desde que exista produto para escoar, porque componentes, energia e
  produto compartilham capacidade.
- Com pressão `>= pressureHigh` e pelo menos dois haulers, permitir que o
  hauler eleito inicie o escoamento mesmo com consumidor crítico e energia
  acionável. Os demais permanecem na cascata de energia.
- Elevar temporariamente o piso para dois haulers quando output lab ou factory
  atingir `pressureHigh`. Entre `pressureLow` e `pressureHigh`, manter o piso
  somente se já existem dois haulers; abaixo de `pressureLow`, voltar ao
  cálculo normal. A própria população funciona como latch, sem estado novo em
  `Memory`.
- A operação mineral ativa continua com o piso de dois já definido em 0055,
  mesmo abaixo de `pressureHigh`.
- Jobs oportunistas abaixo de pressão continuam preemptíveis antes da primeira
  retirada. Um job ainda vazio também pode ser cancelado se surgir um
  escoamento pressionado de prioridade maior.
- Qualquer quantidade já retirada torna o job comprometido: entrega imediata,
  mesmo com carga parcial e mesmo se surgir energia crítica. O espaço restante
  não é misturado com energia nem com outro recurso.
- Se o destino original desaparecer ou lotar durante a entrega, tentar outro
  storage e depois terminal válidos. Sem espaço, manter a carga e esperar; só
  dropar próximo de storage/terminal como último recurso quando o creep estiver
  perto de morrer.
- Reagentes de lab, componentes de factory e Power para power spawn continuam
  oportunistas: podem usar o modo preemptível quando não há energia acionável,
  mas nunca ganham o override de pressão.

## Out of scope

- Criar uma segunda role de transporte ou especialização permanente por creep.
- Permitir mais de um job não energético simultâneo por sala.
- Alterar a ordem interna da cascata de energia ou os tiers dos consumidores
  de energia.
- Automatizar escolha de reação, commodity, mercado, `Terminal.send()` ou
  balanceamento intersalas.
- Usar pressão de reagente, componente ou Power para aumentar população ou
  interromper energia.

## Acceptance criteria

1. Com consumidor crítico, mas `pickLoad(creep) === null`, o smoke asserts que
   um hauler vazio inicia um job não energético:
   `"hauler starts a non-energy job when critical demand has no actionable energy"`.
2. Se energia acionável surgir antes da retirada, o job oportunista vazio é
   abandonado; depois de qualquer retirada, a entrega é concluída:
   `"hauler preempts only an unladen non-energy job"`.
3. Dois haulers na mesma sala nunca iniciam dois `mineralJob` simultâneos,
   independentemente da ordem de execução:
   `"only one hauler per room owns a non-energy job"`.
4. Com dois haulers e container mineral em pelo menos 75%, exatamente um inicia
   o escoamento apesar de energia crítica acionável; o outro escolhe energia:
   `"pressured mineral output reserves one hauler while another serves energy"`.
5. Com apenas um hauler, pressão não sobrepõe energia acionável; sem energia
   acionável, ele ainda pode iniciar o job preemptível:
   `"the last hauler protects actionable energy but uses idle time"`.
6. Output lab usa sua ocupação de mineral e factory usa ocupação total para
   acionar pressão; a prioridade é mineral container, output lab, factory
   output:
   `"pressured non-energy outputs follow blocking priority"`.
7. Pressão de output lab/factory eleva wanted de hauler para dois em 75%,
   mantém dois entre 50% e 75% quando já existem dois e volta ao cálculo normal
   abaixo de 50%:
   `"hauler pressure population uses 75/50 hysteresis"`.
8. Um job com carga parcial entrega imediatamente, sem esperar completar a
   capacidade nem coletar energia no espaço restante:
   `"partially loaded non-energy jobs deliver without mixing cargo"`.
9. Destino inválido/cheio faz fallback para outro storage/terminal; sem espaço,
   o creep espera carregado e só dropa perto da morte:
   `"loaded non-energy cargo is preserved until delivery or death fallback"`.
10. Reagente de lab, componente de factory e Power nunca acionam o override de
    pressão:
    `"non-output supply jobs remain opportunistic"`.
11. `node --check` fica limpo em todo JavaScript tocado,
    `node test/smoke.js "$(pwd)"` fica verde e `npx grunt` builda
    `dist/main.js`.

## Constitution check

- **CPU:** a eleição por sala reutiliza `census`; o ledger e os candidatos são
  cacheados no heap por tick. Nenhum `room.find` novo roda por creep.
- **Memory:** só `creep.memory.mineralJob` já existente persiste. Reserva,
  pressão derivada e eleição ficam no heap; nenhum objeto de jogo é salvo.
- **Fail-soft:** fonte/destino destruído, store cheio e sala sem storage ou
  terminal caem para fallback ou espera sem abortar o tick.
- **Deterministic and testable offline:** eleição, preempção, compromisso,
  pressão e histerese têm assertions dedicadas no smoke.
- **Roles thin:** a execução continua em `roles/hauler.js`; coordenação
  compartilhada por sala deve ficar em helper de `utils/` se não couber como
  cache derivado local sem duplicação.
- **Config over hardcode:** os thresholds 75%/50% entram em `utils/config.js`.
- **Prefer the no-op:** não existe role permanentemente dedicada. O segundo
  hauler só é criado por operação mineral ativa ou bloqueio real de output e
  volta ao cálculo normal depois da histerese.
- **Spending cascade:** o override não é consumo opcional de energia. É
  continuidade operacional de coleta/escoamento fisicamente bloqueável; somente
  um hauler é destacado e ao menos outro permanece na energia.

## Decisions for future work

- A futura automação de cadeias de reação pode reutilizar pressão de output,
  mas não deve transformar abastecimento de reagentes em override crítico sem
  uma nova decisão explícita.
- A futura feature de Market/terminal deve respeitar carga não energética já
  comprometida e não reivindicar o mesmo hauler até a entrega terminar.
- Uma futura logística intersalas pode generalizar o ledger por recurso/sala,
  mas esta feature não antecipa pedidos, expiração, custo de transferência nem
  `Terminal.send()`.
- Métricas de backlog/tempo bloqueado podem ser adicionadas ao Grafana depois;
  não são necessárias para decidir ou implementar o comportamento inicial.

## Open questions

Nenhuma. Estratégia, thresholds, preempção, eleição, histerese, fallback e
limites de escopo foram fechados com o usuário antes de marcar a spec `ready`.

## Outcome

Entregue em `utils/nonEnergyLogistics.js`, `roles/hauler.js`,
`utils/reservations.js` e `rooms/needs.js`. A pressão e o owner são heap-only;
`mineralJob` ganhou `kind`/`loaded` compatíveis com entradas antigas. O smoke
cobre energia
acionável, ordem inversa dos haulers, pressão dos três outputs, preempção,
carga parcial, fallback de destino, espera/drop perto da morte e histerese.