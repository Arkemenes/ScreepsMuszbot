# 0125 — Powered terminal relay aliado

- **Status:** in progress (cotação, mensagens e executor local implementados; canário depende da confirmação do protocolo RLY pelo aliado)
- **Owner:** Arkemenes / ARK-90 (plano e cálculo), ARK-91 (execução)
- **Created:** 2026-10-10

## Problem

`terminalOps.transfer` só realiza transferências diretas entre salas próprias.
O hub aliado E2N46 oferece frete de saída e cooldown reduzidos por
`PWR_OPERATE_TERMINAL` nível 5. Sem comparar as duas pernas e o financiamento,
usar esse hub pode aumentar o gasto ou entregar menos energia que o solicitado.

## Desired outcome

Toda transferência física avalia automaticamente se a rota via hub compensa e,
quando vantajosa e disponível, usa o hub por padrão. Isso inclui balanceamento
e transferências explícitas. `options.urgent = true` desconsidera o hub e usa
envio direto; não é necessário opt-in por operação para usar relay.
O operador pode consultar ambas as rotas sem enviar recursos. A execução só é
ativada com configuração privada válida e acompanhamento de pagamentos/entregas.

## In scope

- Fase A, autorizada nesta etapa: spec, plan, tasks e cálculo de viabilidade,
  com comando `terminalRelayQuote` e smoke. Nenhum envio ao aliado nesta fase.
- Fase B: modalidade relay em `terminalOps`, integração ao balanceamento e
  transferências físicas explícitas implementadas. A ativação segue fechada por
  padrão e exige chave privada, dono aliado no hub e configuração explícita.
  Execução real depende de confirmar com o aliado o contrato RLY: o PDF disponível
  documenta apenas o protocolo humano `MSG:`.
- O balanceamento de energia existente só marca crítico quando o estado do
  destino é `critical`; o restante considera relay por padrão na fase B.
- Balanceamento automático de outros recursos, quando existir, usa a mesma API
  e urgência padrão. Criar uma nova política de redistribuição mineral não faz
  parte desta feature.
- Base de mensagens manuais entre aliados: comandos explícitos enfileiram texto
  em inglês no `description` de um envio de 1 energia; o bot notifica e registra
  mensagens recebidas sem interpretar seu conteúdo como comando. Isso dá um
  canal humano para coordenar o relay sem habilitar remessas automáticas.
- Descoberta automática do terminal dos aliados listados por `hostiles.allies()`:
  cruzar a aliança com o intel de `Memory.rooms`, considerar salas RCL 6+ e escolher
  a sala com menor frete estimado a partir dos nossos terminais. `setAllyRoom()`
  continua disponível como override explícito.
- Quando há mensagem pendente, reservar o custo de 1 energia de postagem mais o
  frete do terminal de origem escolhido em `terminalFuel`; o job existente de
  `stockPolicy` pode pedir ao hauler para levar essa energia do storage.
- Cada terminal mantém um piso configurável de 10 energia (`terminalFuel.minimumReserve`).
  A postagem pode consumir esse piso; em seguida `stockPolicy` repõe o saldo até
  o piso, e recibos/retiradas preventivas não podem drená-lo.

## Cost model

`A` é sempre a quantidade desejada **no destino**. `C(n, x, y)` é
`Game.market.calcTransactionCost`; `S` e `P` são os multiplicadores ativos dos
terminais de origem e pagamento; `H = E2N46`; `D` é o destino; `M = 2`.

```
directFreight = ceil(C(A, source, D) * S)
hubFreight = ceil(C(A, H, D) * 0.5)
F = hubFreight + M

Minerais/produtos:
  cargoAmount = A
  relayFreight = ceil(C(A, source, H) * S) + F
               + ceil(C(F, fundingRoom, H) * P)
  fundingAmount = F

Energia (autofinanciada):
  cargoAmount = A + F
  relayFreight = ceil(C(A + F, source, H) * S) + F
  fundingAmount = 0

savingsEnergy = directFreight - relayFreight
savingsRatio = savingsEnergy / directFreight (0 se directFreight == 0)
```

Para energia, `totalEnergy = A + freight`; para outros recursos, `totalEnergy`
é só o frete. Comparar a mesma entrega evita chamar o desconto da carga de
economia. O modelo segue a fórmula de arredondamento do guia.

Usar relay somente se `savingsEnergy > 0`, atingir `minSavingsEnergy` e
`minSavingsRatio`, a operação não for crítica e a rota estiver disponível.
Empate usa direto. Cotação não valida espaço, crédito privado, chave ou fila
do aliado: a execução revalida todas essas condições e refaz a cotação.

## Acceptance criteria

1. Smoke: `0125: mineral quote includes funding freight and message`.
2. Smoke: `0125: energy quote compares equal delivered amounts`.
3. Smoke: `0125: rounding includes every leg`.
4. Smoke: `0125: equal or worse freight stays direct`.
5. Smoke: `0125: critical transfer stays direct`.
   Smoke: `0125: relay is automatic unless explicitly urgent`.
6. Smoke: `0125: unavailable relay stays direct`.
7. Smoke: `0125: savings thresholds and powered sender are respected`.
8. Smoke: `0125: invalid cost fails closed without sending`.
9. Smoke: `0125: quote is read only and registered in the console`.
9a. Smoke: `0160: queued ally message uses existing terminal tick and one-energy postage`.
9b. Smoke: `0160: inbound message shares transaction scan and does not create a receipt`.
9c. Smoke: `0160: allies and RCL6+ Memory.rooms intel discover terminal contacts automatically`.
9d. Smoke: `0160: queued message reserves postage and freight in the terminal fuel forecast`.
9e. Smoke: `0160: existing stockPolicy hauler job feeds message energy to its sending terminal`.
9f. Smoke: `0161: ten-energy postage reserve is usable by messages and replenished to its minimum`.
10. Fase B: smoke cobre staging, fallback, segredo, orçamento de terminal,
    urgência direta, disable e resultado ambíguo sem retransmissão. Ainda faltam
    casos de envio de financiamento, pagamento FIFO, envios parciais, correlação
    de `RLY #id from user`, `ok`/`err`/`forfeit` e reset global.
11. Fase B: balanceamento não crítico considera quote; crítico usa direto;
    ausência de chave ou executor desativado usa direto.
12. Fase B: stats distinguem energia estimada e realizada, transporte e
    quantidade entregue; credenciais nunca aparecem em logs, operações ou stats.

## Constitution check

Sem nova passagem sobre creeps ou `room.find`. Cotação não grava Memory e não
executa intents. Transporte futuro fica dentro do `guard` de `terminalOps`.
Config em `Memory.settings.terminalRelay`; estados persistem apenas primitivas
e IDs. Carga em trânsito nunca é abandonada por um timeout local genérico.

## Review and open questions

Decisões do usuário em 2026-10-10: avaliar vantagem automaticamente em toda
transferência física e usar o hub por padrão quando compensa e está disponível.
A exceção é uma flag explícita `urgent: true`; a cotação adota essa política.
O plano de transporte está pronto para revisão antes da fase B.

Uma chave privada e confirmação operacional com o aliado do contrato RLY são
necessárias antes de um canário. O guia `docs/Terminal_Messenger_Guide.pdf`
descreve `MSG:` e não especifica financiamento, IDs, receipts ou ack `RLY`;
por isso o executor fica desativado por padrão e o protocolo local não deve ser
considerado compatível até validação conjunta.
