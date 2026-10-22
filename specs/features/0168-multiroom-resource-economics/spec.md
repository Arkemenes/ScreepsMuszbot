# 0168 — Aquisição e distribuição econômica de recursos entre salas

- **Status:** planned
- **Owner:** a definir após revisão
- **Created:** 2026-10-21
- **Linear:** [ARK-205](https://linear.app/arkemenes/issue/ARK-205/0168-aquisicao-e-distribuicao-economica-de-recursos-entre-salas)

## Problem

Os recursos ficam distribuídos entre salas com preços, excedentes, custos de frete e capacidade de lab distintos. Uma sala pode comprar um composto de boost caro apesar de haver excedente em outra sala, ou pode ser vantajoso comprar em um terminal com preço menor e depois transferir. Hoje não há cotador único que compare essas alternativas com custo de energia, terminal.send, reservas e atraso.

## Desired outcome

Antes de adquirir ou processar recursos de demanda conhecida, o bot explica qual rota entrega o recurso ao menor custo efetivo: estoque doador, compra direta, compra intermediária e envio, ou processamento em labs de outra sala. A cotação é determinística e inicialmente read-only; nenhuma operação automática gasta créditos ou envia recursos até rollout aprovado por consumidor.

## In scope

- Demandas de boosts, reagentes e produtos avançados com consumidor/quantidade identificados.
- Comparar estoque excedente de outras salas, compra no destino, compra em terminal intermediário seguida de terminal.send e processamento em lab ocioso.
- Incluir preço/valor de oportunidade, crédito, custo de energia de transação, taxa de terminal, reservas, combustível, cooldown, capacidade, atraso e custo de operação.
- Respeitar floors, compromissos e claims de resourcePolicy/readinessContext.
- Cotação com rota escolhida, alternativas rejeitadas, custo por unidade, economia líquida e motivo.
- Executar somente por terminalOps e executores já responsáveis por deals, sends, labs e boosts.
- Começar em modo read-only; ativação por consumidor/recurso após medição e configuração explícita.

## Out of scope

- Nova máquina paralela para Game.market.deal ou Terminal.send.
- Comprar, transferir ou iniciar produção automaticamente durante a fase read-only.
- Usar estoque comprometido, violar piso doador ou drenar energia necessária ao terminal.
- Unificar relatórios de uso de terminal/labs já cobertos por 0155/0163.

## Acceptance criteria

1. Fixtures escolhem corretamente estoque local, estoque doador, compra direta, compra+envio e processamento remoto sob custos de preço, energia e tempo.
2. Estoque abaixo do piso, comprometido, reservado ou sem capacidade de envio não aparece como oferta disponível.
3. Quando nenhuma rota é vantajosa, a cotação explica a razão e preserva a estratégia atual.
4. A cotação read-only não chama deal/send, não gasta créditos e não altera quantidades.
5. Piloto inicial em composto de boost demonstra economia líquida incluindo frete; execução passa pelo terminalOps existente e usa claims/idempotência.

## Constitution check

- **CPU:** reutiliza readiness, reports e snapshots econômicos existentes; cotações são cacheadas por tick/solicitação.
- **Memory:** persiste apenas rota/intent serializável que os operadores existentes precisem; sem objetos de jogo.
- **Fail-soft:** preço ausente, energia insuficiente ou rota incerta mantém o comportamento atual.
- **Offline test:** mercado, transaction cost, terminal state, reservations e labs são fixtures.
- **Configuração:** read-only é o default; rollout fica em Memory.settings por consumidor/recurso.

## Open questions

Nenhuma. ARK-205 originalmente cobria somente labs multi-sala e foi ampliada para decisão de aquisição e frete, preservando o caso original.
