# 0125 — Powered terminal relay — Tasks

## Phase A — ARK-90: plano e cotação

- [x] Registrar spec e plano com não crítico como default e cálculo por entrega equivalente.
- [x] Criar `terminalRouting.quote` e config dos custos/limiares.
- [x] Registrar `terminalRelayQuote` no console sem intents.
- [x] Smoke dos critérios 1–9, `node --check`, build e atualização AST do graphify.
- [x] Atualizar ARCHITECTURE/ROADMAP e concluir ARK-90.

## Phase B — ARK-91: transporte (em andamento)

- [x] Base de mensagens: descoberta automática via aliados e `Memory.rooms` (`owner`/`controllerLevel`), override opcional, fila limitada, envio coordenado pelo `terminalOps`, notificação e dedupe no scan existente.
- [x] Prever postagem/frete em `terminalFuel` e reutilizar o job `stockPolicy` para o hauler abastecer o terminal remetente.
- [x] Smoke de autodetecção, postagem de 1 energia, limite de descrição, recebimento, ausência de receipt e abastecimento por hauler.
- [x] Manter reserva mínima configurável de 10 energia por terminal, permitir uso na postagem e repor com hauler; preservar o piso em recibos e liberações.
- [x] Implementar flags de ativação, chave privada fora de `Memory.terminalOps`, validação do hub aliado e fallback direto.
- [x] Implementar staging, reservas e orçamento de energia da rota; alimentar `terminalFuel`/hauler.
- [ ] Validar com o aliado o contrato RLY de correlação, financiamento, receipts e recovery. O PDF disponível descreve somente `MSG:`.
- [ ] Cobrir envio de financiamento, FIFO, janela de 30 ticks e confirmação em outgoing; nenhum envio operacional foi feito.
- [x] Suspender resultado ambíguo e nunca retransmitir carga sem conciliação; smoke de ausência de ack.
- [ ] Cobrir pagamentos/envios parciais, ack `ok`/`err`/`forfeit`, reset global e recovery de custódia.
- [x] Seleção automática pelo custo em transferência física; balanceamento usa a cotação e `urgent: true` força direto.
- [x] Registrar stats e comandos de acompanhamento sem segredos.
- [ ] Fazer dry-run e canário com aliado após confirmação do protocolo e instalação local da chave; smoke/build/graphify e docs finais.
