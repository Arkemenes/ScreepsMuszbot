# 0097 — Balanceamento automático de energia entre salas — Tasks

- [x] 1. Criar snapshots e escolha determinística inicial de origem/destino. (AC1, AC3, AC5 parcial)
  - verify: `node --check src/rooms/energyBalancing.js`
- [x] 2. Aplicar reserva agregada, taxa no volume e intervalo. (AC2, AC4 parcial)
  - verify: smoke assertion de limites e pendência
- [x] 3. Integrar somente pela API 0098. (AC7 parcial)
  - verify: spy do smoke não observa `terminal.send()`
- [x] 4. Completar desempate por distância, idempotência, observabilidade e smoke dedicado. (AC5, AC6, AC7, AC8)
  - verify: assertions 0097 no smoke
- [x] 5. Atualizar documentação e executar checks finais. (AC9)
  - verify: `node test/smoke.js "$(pwd)"` · `npx grunt`

## Notes

Concluído em 2026-09-19: `energyBalancing.run()` roda sob `guard`, usa
storage+terminal, reserva agregada, taxa via busca binária, intervalo/gatilho
crítico, uma transferência por destino, desempate excedente → distância →
nome, locks/idempotência, cancelamento pré-retirada e observabilidade por sala.
O smoke cobre a criação única, delegação para 0098 e persistência da decisão.

`node test/smoke.js "$(pwd)"` verde localmente em 2026-09-19. `npx grunt`
validado pelo usuário no mesmo dia; o ambiente do assistente falha por
incompatibilidade de tooling após o merge.
