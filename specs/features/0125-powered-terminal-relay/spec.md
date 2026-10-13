# 0125 — Powered terminal relay aliado

- **Status:** planned (cotação implementada; transporte pendente)
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
- Fase B, planejada: modalidade relay em `terminalOps`, integração ao balanceamento
  e transferências físicas explícitas, confirmação e métricas.
- O balanceamento de energia existente só marca crítico quando o estado do
  destino é `critical`; o restante considera relay por padrão na fase B.
- Balanceamento automático de outros recursos, quando existir, usa a mesma API
  e urgência padrão. Criar uma nova política de redistribuição mineral não faz
  parte desta feature.

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
10. Fase B: smoke cobre staging, financiamento até 200 ticks, pagamento FIFO,
    envios parciais, correlação de `RLY #id from user`, `ok`/`err`/`forfeit`,
    reset global, confirmação perdida e nenhuma retransmissão da carga já enviada.
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

Sem pergunta bloqueante para a cotação. Antes da ativação real é necessária a
chave privada e confirmação operacional com o aliado de como recuperar/correlacionar
uma remessa cujo envio ao hub foi truncado e cuja confirmação não chegou.
