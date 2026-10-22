# 0171 — Verificação atual de propriedade antes de claimRoom

- **Status:** done (local)
- **Owner:** a definir
- **Created:** 2026-10-21
- **Linear:** [ARK-217](https://linear.app/arkemenes/issue/ARK-217/0171-verificar-propriedade-atual-antes-de-claimroom)

## Problem

rooms/remotes.js rejeita claimRoom(room) quando Memory.rooms[room].owner contém outro jogador. Esse campo vem da última leitura de intel e pode continuar apontando para o antigo dono depois que ele abandona a sala. O comando não consulta o controller atual e pode bloquear a expansão mesmo quando a sala já está neutra.

## Desired outcome

claimRoom só decide a propriedade a partir de visão atual do controller. Se a sala não estiver visível e houver Observer no alcance, o comando agenda uma observação, informa que o claim está aguardando e retoma automaticamente após a visão chegar. Sem confirmação atual, nenhum claimer é despachado e o comando não atribui a sala ao dono salvo em memória.

## In scope

- Usar Game.rooms[room].controller quando a sala tiver visão no tick.
- Quando não houver visão, reutilizar a fila Memory.observeRequests servida por structures/observer.js.
- Guardar um pedido pendente mínimo e expirável em Memory; permitir apenas uma verificação por vez.
- Após observação, revalidar o controller e retomar as verificações existentes de status, distância, GCL e claim pendente.
- Falhar de forma explícita e segura quando não houver Observer no alcance ou quando a observação expirar.
- Cancelar uma verificação pendente via cancelClaim e preservar pedidos de observação independentes.

## Out of scope

- Enviar um scout automaticamente quando nenhum Observer puder observar a sala.
- Mudar a política de GCL, os limites de distância, a composição do claimer ou a elegibilidade de reserva.
- Automatizar claims sem comando explícito.

## Acceptance criteria

1. Com visão atual, owner ausente permite as validações e o fluxo normais de claim; controller.my ou controller.owner de outro jogador rejeita o pedido com a mensagem correspondente.
2. Sem visão, owner antigo em Memory.rooms não rejeita nem despacha claim; havendo Observer no alcance, o pedido fica pendente e Memory.observeRequests agenda a leitura.
3. Depois que Game.rooms contém visão atual da sala, processPendingClaimCheck limpa o pedido e retoma claimRoom usando o controller observado.
4. Se a visão confirmar outro dono ou ausência de controller, o claim termina sem criar Memory.claimTarget.
5. Sem Observer no alcance, ou após expirar, o pedido não cria Memory.claimTarget e não deixa estado pendente.
6. A fila do Observer e os estados de claim armazenam apenas nomes, ticks e strings serializáveis; todo novo subsistema chamado por main.js usa guard().

## Constitution check

- **CPU:** usa Game.rooms, Game.map e o cadastro existente de observers; não adiciona room.find nem varredura de Game.creeps.
- **Memory:** persiste apenas sala, origem opcional, ticks de pedido/expiração e expiração anterior do observe request.
- **Fail-soft:** owner antigo sem visão é tratado como desconhecido; timeout e falta de Observer param sem enviar creep.
- **Offline test:** o smoke simula visão atual, owner stale, Observer no alcance, visão após observe, dono ainda presente e expiração.

## Open questions

Nenhuma. Observação sem vision atual é tratada como confirmação pendente; o claim só continua depois da atualização real do controller.
