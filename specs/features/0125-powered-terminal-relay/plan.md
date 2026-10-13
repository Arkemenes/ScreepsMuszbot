# 0125 — Powered terminal relay — Plan

## Approach

Separar cotação (sem intents) da execução. Entregar primeiro o modelo matemático
e um comando de console; depois adicionar uma modalidade à operação `transfer`
existente. `buy`/`sell` e `market.deal` permanecem operações de mercado, sem relay.

Na execução, toda `terminalOps.transfer` avalia ambas as rotas automaticamente,
inclusive chamadas manuais, e usa o hub quando vantajoso e disponível. Nenhum
caller precisa habilitar relay por operação. A exceção é `options.urgent = true`,
que força direto. `energyBalancing` passa
`urgent: target.state === "critical"` explicitamente, consulta ambas as rotas
e limita o lote pelo orçamento **total da rota** e capacidade física de staging.
Recalcular a cotação ao reduzir um lote: o overhead fixo pode mudar a melhor rota.
Selecionar a origem pelo custo total viável e déficit/sobra; não presumir que
o maior excedente ou a menor distância direta gera a rota mais barata.

## Modules

| Path | Responsibility / change |
|------|-------------------------|
| `src/utils/terminalRouting.js` | Cotação direta/relay, entrega líquida, arredondamento e limiares; já implementado. |
| `src/utils/config.js` | Defaults de cotação; depois flags e limites do executor. |
| `src/utils/terminalOps.js` | Registra `terminalRelayQuote`; depois staging, financiamento e reconciliação. |
| `src/rooms/energyBalancing.js` | Fase B: orçamento por rota, urgência explícita, idempotência e stats. |
| `src/utils/console.js` | Referência do comando e, na fase B, controles de acompanhamento. |
| `src/utils/stats.js` | Fase B: métricas de custo, economia e carga em trânsito. |
| `test/smoke.js` | Cotações agora; cenários do protocolo na fase B. |

## Phase A — Quote

`terminalRelayQuote(from, to, resource, deliveredAmount, options?)` devolve
`ok`, `route`, `reason`, `economic`, `direct`, `relay`, `savingsEnergy`,
`savingsRatio`. `relay.cargoAmount` inclui o autofinanciamento de energia;
`relay.fundingAmount` é zero nesse caso. As quantidades são inteiros positivos.

`options` permite `urgent: true` (exceção principal), `critical` e
`urgency: "critical"` (aliases compatíveis), `fundingRoom`, `hub`,
`relayAvailable`, `minSavingsEnergy`, `minSavingsRatio`, multiplicadores da
origem/pagamento e injeção de `calcTransactionCost` para teste. O multiplicador
ativo usa `terminal.effects` e `POWER_INFO`; sem visão, estimativa conservadora 1.
Não chamar `send`, não criar operações, não guardar cotações em Memory.

## Phase B — Executor and safety

1. Preparar credenciais: `Memory.settings.terminalRelay.key` privada, nunca
   hardcoded; `transportEnabled` inicialmente false. `enabled` existente só
   controla a política da cotação. Validar palavras e limite de 100 caracteres
   antes de qualquer intent. Sem configuração utilizável, escolher direto.
2. Estender `transfer` com `route`, `critical`, cotação persistida mínima,
   quantidade solicitada/embarcada/entregue e custos observados. Validar destino,
   espaço e reservas na origem. Manter locks de destino durante trânsito.
3. Um único envio relay não energético em voo por conta inicialmente: o
   protocolo não aceita ID de cliente e financiamento é FIFO global. Durante
   essa janela não iniciar outra remessa que consuma o mesmo financiamento.
   A chave identifica usuário, não sala. Controles manuais externos podem
   interferir; detectar ambiguidade e suspender em vez de atribuir automaticamente.
4. Reservar e carregar carga **e financiamento antes** de despachar. Enviar
   financiamento primeiro, confirmar no histórico de outgoing o recebimento
   integral no hub e enviar a carga no cooldown seguinte. Usar o mesmo terminal
   na primeira versão; financiamento por outro terminal é extensão posterior.
   O prazo do pré-pagamento começa na chegada: deixar margem configurável bem
   menor que 200 ticks. Se staging já não puder enviar a tempo, suspender antes
   de financiar. Timeout após financiar exige conciliação, não reenvio cego.
5. Se o pagamento ou carga for truncado pela capacidade do hub, registrar
   `fundingUncertain`/`receiptUncertain`. Não repetir pagamento nem completar
   carga como se fosse a mesma remessa: cada novo envio pode ser nova remessa.
   Reconciliar valor real e interromper automação quando não houver correlação
   segura. Energia requer somente o envio autofinanciado e reconciliação do
   valor líquido realmente encaminhado.
6. Máquina de estados proposta: `staging → funding → fundingConfirmed →
   sending → inTransit → awaitingOutcome → unloading → done` (energia pula
   funding); exceções `fundingUncertain`, `receiptUncertain`, `held`, `forfeited`.
   Nunca passar para `done` apenas por retorno `OK` de `send`.
7. Processar transações antes de `scanTerminalBalances` e reutilizar a mesma
   coleta por tick. Reservar o cargo relay no destino para não gerar receipt
   automático duplicado. Associar `RLY #<id> from <username>` ao envio pendente
   por origem esperada no ack, destino, recurso, quantidade e janela temporal;
   validar `tx.from === hub`, `tx.sender.username === ally` quando disponível.
   Ack é 1 energia, não carga para balanceamento. Não gravar descriptions de
   outgoing, pois elas contêm a chave.
8. `ok` e receipt próprio: confirmar quantidades, descarregar e finalizar.
   `err`: registrar entrega parcial e prazo de 1500 ticks para intervenção;
   `forfeit`: registrar perda. Sem power pode esperar indefinidamente; timeout
   local só gera alerta/estado incerto, nunca retransmite cargo. Ack perdido
   permite fechar pela entrega observada em destino próprio; destino externo
   sem ack fica incerto para intervenção humana.
9. Reusar activeIds, reservas, recovery e retenção; reter transações vistas por
   tempo configurado e limpar com índice limitado. Global reset recupera estados
   persistidos sem repetir intents já comprovados. Desativar novas operações
   não abandona as que já foram financiadas/enviadas.

## Data shapes

Config atual: `terminalRelay.{enabled, hub, freightMultiplier, messageEnergy,
minSavingsEnergy, minSavingsRatio}`. Custo derivado e leitura de efeitos não são
persistidos. Defaults: hub E2N46, multiplier 0.5, message 2, limiares 0.

Fase B: config de ativação/chave, margem do prazo, limite de valor em trânsito,
alertas e retenção. `Memory.terminalOps.operations[id]` ganha `route`,
`relayId`, `sentTick`, `fundingTick`, IDs de tx, quantidades e custos primitivos.
Sem objetos de jogo nem cópia da chave. Stats: custo estimado/realizado,
economia estimada contra direto, pendências, perdas e quantidade entregue.

## Validation and rollout

Smoke com stubs do engine; casos de pagamento truncado, FIFO entre salas,
receipt parcial, erro, power ausente, ack descartado, reset global e disable
durante trânsito. Cotação primeiro no console; depois modo dry-run no
balanceamento; depois canário de pequeno valor entre salas próprias e habilitação
gradual. Economia medida não é economia realizada antes de confirmar a entrega.

## Constitution and rollback

Uma coleta de transações por tick, sem novas varreduras de creeps/room.find.
Execução no guard existente; estados com stall guard e política explícita para
carga já em custódia. Desabilitar `transportEnabled` devolve novas operações
ao envio direto e mantém conciliação das antigas. Cotação pode ser desabilitada
por `Memory.settings.terminalRelay.enabled = false`.

## Risks

O guia não expõe disponibilidade ou fila do hub e não oferece ID do cliente.
Economia não garante latência; critical usa direto. Power da origem pode expirar
entre cotação e intent: recotar a cada dispatch, garantir margem de energia.
Custódia externa é irreversível após enviar; limitar exposição e não automatizar
recuperação ambígua. Chave ausente não bloqueia a fase A.
