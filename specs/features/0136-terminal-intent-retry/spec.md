# Intents de mercado: frete protegido e retentativa limitada (ARK-126)

## Problema e evidência

W7N49/terminal-12441 retornou OK para UH2O sem histórico/estoque observável.
No tick83650403, as duas ordens descartadas ainda têm saldo985/5983. Isso não
prova a causa histórica: não há snapshot da energia/intents no instante exato.
Investigar antes de alterar comportamento. Hipóteses testáveis: frete existente
sem feeLoadedAmount fica disponível para jobs antigos; confirmação exige lote
inteiro; deadOrderIds transforma falta transitória de efeito em exclusão vitalícia.

## Resultado desejado

- Todo pendingDeal protege seu frete físico, inclusive energia pré-existente,
  sem duplicar feeLoadedAmount. Jobs antigos, recibos e transferências não o
  retiram antes da confirmação. Cancelamento/reset preservam o claim.
- Quantidade realmente confirmada, inclusive parcial, determina saldo, custo,
  frete e ganho líquido. Sem efeito não cria compra/venda nem custo.
- Ausência de efeito causa suspensão temporária por ordem/operação, com backoff
  progressivo limitado/configurável. Priorizar alternativas elegíveis; após prazo
  reavaliar a mesma ordem. Nunca elevar limite efetivo, ignorar lastro ou criar
  listing sem autorização. Migrar deadOrderIds existentes sem liberação em massa.
- Diagnóstico mantém evidência do intent: energia/estoque antes, resultado
  observado, quantidade/frete confirmados e próxima elegibilidade. Não afirmar
  competição externa nem causa histórica sem evidência.

## Investigação reproduzida

O smoke simula intent de compra1000/frete900 com1000 de energia já no terminal
e feeLoadedAmount ausente. Um receipt antigo pede retirada1000 no mesmo tick.
Antes do fix, physicalFree e runHauler liberavam1000; após retirada, o motor
simulado não tinha energia para cumprir o deal aceito. Após fix, retira somente100,
deixa900 e confirma compra1000/créditos1000/frete900. A falha e a correção foram
observadas no mesmo teste. Cinco assertions de claims/execução/partial falharam
antes do fix e passaram depois. A API oficial também admite execução parcial
no processamento do mercado, que a confirmação antiga rejeitava.

Isso demonstra uma causa local suficiente para o sintoma; não reconstrói com
certeza a energia/intents dos dois ticks históricos. O log novo conserva a
evidência de confirmação e antes/depois para futuras ocorrências.

## Critérios de aceitação

1. Reproduzir antes do fix: job antigo retira frete pré-existente e intentOK
   não executa. Com fix, job só retira sobra e negócio confirma no próximo tick.
2. feeLoadedAmount e pendingDeal.cost protegem max, não soma; recurso e energia
   permanecem protegidos em reset/cancelamento e sem efeito liberam só o intent.
3. Recebimento parcial confirma quantidade/custo reais uma vez; eventos repetidos
   ou ausência de efeito não criam quantidades. Energia usa ganho líquido real.
4. Mesma ordem sem efeito não monopoliza tentativas nem desaparece para sempre;
   alternativas são atendidas; prazo/reset/migração e backoff têm testes.
5. Limites efetivos, créditos, capacidade, cooldown e prioridade permanecem.

## Revisão

Escopo delimitado ao protocolo intent→confirmação→retry. Nenhum mecanismo de
retentativa substitui a correção de claims. Testes distinguem defeitos locais
demonstrados de hipóteses não demonstráveis sobre os ticks históricos.
Constituição: census/roomCache existentes, Memory só IDs/counters, guard já
existente, sem loops ilimitados e configuração para cadências.
