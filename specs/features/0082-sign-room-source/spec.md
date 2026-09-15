# 0082 — Origem opcional em `signRoom`

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

`signRoom(roomName, text)` enfileira uma assinatura apenas pelo destino. O
scout único pode estar em qualquer sala quando atende o pedido, então não há
como solicitar que ele retorne a uma sala de origem específica antes de
seguir ao destino.

## Desired outcome

O console aceita `signRoom(roomName, text, fromRoomName?)`. Quando a origem é
informada, o scout retorna primeiro a `fromRoomName` e só depois viaja para
`roomName` e assina o controller. Sem origem, o comportamento atual permanece.
Pedidos já persistidos como texto simples continuam funcionando.

## In scope

- Adicionar o terceiro parâmetro opcional `fromRoomName`.
- Persistir novos pedidos com texto e origem, mantendo leitura de strings
  legadas em `Memory.signQueue`.
- Fazer o stall guard distinguir a viagem até a origem da viagem até o
  destino.
- Atualizar help, arquitetura e smoke test.

## Out of scope

- Selecionar mais de um scout.
- Alterar `routing.moveToRoom` para receber uma origem explícita.
- Permitir múltiplos pedidos para o mesmo destino.
- Alterar a contabilidade de energia da feature 0081.

## Acceptance criteria

1. `signRoom(roomName, text, fromRoomName)` grava um pedido estruturado com o
   texto e a origem em `Memory.signQueue[roomName]`.
2. `signRoom(roomName, text)` continua funcionando e o scout parte da sala em
   que estiver, sem origem adicional.
3. `signRoom(roomName)` remove pedidos novos e legados pelo destino.
4. Com origem diferente da sala atual, o scout move-se primeiro para a origem
   e não inicia a viagem ao destino antes de chegar nela.
5. Ao chegar à origem, o scout passa a viajar para o destino e assina o
   controller, removendo o pedido.
6. O stall guard reinicia ao trocar da fase de origem para a fase de destino e
   abandona o pedido se uma fase exceder o limite.
7. Uma entrada legada `Memory.signQueue[roomName] = text` continua sendo
   assinada como antes.

## Constitution check

- **CPU:** reutiliza `routing.moveToRoom`; não adiciona `room.find` nem novas
  varreduras.
- **Memory:** o registro novo contém apenas strings pequenas (`text` e `from`),
  e entradas legadas não exigem migração imediata.
- **Fail-soft:** origem inválida ou inacessível é tratada pelo stall guard já
  existente; o pedido é removido após desistência.
- **Offline test:** o smoke stubará `moveToRoom`/`moveTo` e verificará a ordem
  origem → destino, além da compatibilidade legada.

## Open questions

- Nenhuma.
