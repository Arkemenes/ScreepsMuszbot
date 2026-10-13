# 0125 — Powered terminal relay — Tasks

## Phase A — ARK-90: plano e cotação

- [x] Registrar spec e plano com não crítico como default e cálculo por entrega equivalente.
- [x] Criar `terminalRouting.quote` e config dos custos/limiares.
- [x] Registrar `terminalRelayQuote` no console sem intents.
- [x] Smoke dos critérios 1–9, `node --check`, build e atualização AST do graphify.
- [x] Atualizar ARCHITECTURE/ROADMAP e concluir ARK-90.

## Phase B — ARK-91: transporte (Backlog para revisão)

- [ ] Revisar spec e protocolo de correlação/recovery antes de executar.
- [ ] Flags de ativação, chave privada, validação do protocolo e fallback direto.
- [ ] Staging/reservas/locks e orçamento de energia por rota; smoke de capacidade.
- [ ] Máquina de financiamento e envio único em voo; smoke de FIFO e prazo.
- [ ] Receipts/outcomes, envios parciais e ausência de ack; smoke de idempotência.
- [ ] Recovery após reset/disable, forfeits/held e alertas; smoke de custódia.
- [ ] Seleção automática pelo custo em toda transferência física; balanceamento usa default e `urgent: true` força direto.
- [ ] Stats de frete/entrega/perdas e comandos de acompanhamento sem segredos.
- [ ] Dry-run, canário de pequeno valor, smoke/build, graphify e docs finais.
