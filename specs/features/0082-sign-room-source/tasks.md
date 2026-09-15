# 0082 — Origem opcional em `signRoom` — Tasks

Ordenadas.

- [x] 1. Ajustar `global.signRoom` e a documentação do console para aceitar
  `fromRoomName?` e persistir o novo formato. (AC1, AC2, AC3)
  - verify: `node --check src/roles/scout.js` · assertions de fila/cancelamento
- [x] 2. Ajustar a máquina de viagem do scout para executar origem → destino,
  normalizar entradas legadas e reiniciar o stall guard na transição. (AC4,
  AC5, AC6, AC7)
  - verify: smoke assertions da ordem de destinos e da assinatura
- [x] 3. Atualizar o smoke test e a arquitetura. (AC1–AC7)
  - verify: `node test/smoke.js "$(pwd)"` verde
- [x] 4. Construir o bundle e finalizar a feature.
  - verify: `npx grunt` · `node --check` em cada JavaScript tocado · roadmap com
    status `done`

## Notes

- O pedido continua indexado pelo destino; múltiplos pedidos para o mesmo
  destino ficam fora do escopo.
