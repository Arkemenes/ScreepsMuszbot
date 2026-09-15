# 0082 — Origem opcional em `signRoom` — Plan

Derivado de `spec.md`.

## Approach

Manter `Memory.signQueue` indexada pelo destino, mas aceitar dois formatos na
leitura: a string legada e um objeto `{ text, from }`. Novos pedidos com origem
usam o objeto; chamadas sem origem continuam no formato simples para preservar
o contrato existente. O scout normaliza apenas em memória local durante a
execução.

A máquina de viagem terá duas fases quando `from` existir: primeiro move para a
origem, depois para o destino. O estado do stall guard incluirá a fase e a sala
de referência, evitando que o tempo gasto no retorno consuma silenciosamente a
janela da viagem ao destino.

## Modules

### New

Nenhum módulo novo.

### Changed

| Path | Change |
|------|--------|
| `src/roles/scout.js` | Aceitar `fromRoomName`, normalizar entradas, viajar origem → destino e manter compatibilidade. |
| `src/utils/console.js` | Documentar a assinatura nova. |
| `test/smoke.js` | Assertar formato, compatibilidade, ordem de viagem e conclusão. |
| `specs/ARCHITECTURE.md` | Documentar o formato e a sequência da missão. |

## Data shapes

- Legado: `Memory.signQueue[roomName] = "texto"`.
- Novo: `Memory.signQueue[roomName] = { text: "texto", from: "W1N1" }`.
- Sem origem: chamadas de dois argumentos preservam o formato legado.
- Estado transitório: `creep.memory.signTravelTarget` recebe uma chave de fase
  (`from:<room>` ou `to:<room>`) para reiniciar o stall guard na transição.

## How it satisfies the constitution

- **CPU:** nenhuma busca nova; o roteamento existente é chamado no máximo uma
  vez por tick da missão.
- **Memory:** somente strings pequenas e compatibilidade sem migração global.
- **Fail-soft:** o limite de viagem remove pedidos que não avançam.
- **Offline test:** o smoke controla a sala do creep e registra os destinos
  recebidos por `routing.moveToRoom`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Entradas antigas quebrarem o scout | Normalizar strings como `{ text, from: null }`. |
| Stall guard misturar origem e destino | Chavear estado por fase e destino. |
| Origem vazia alterar chamadas antigas | Só ativar a fase de origem com string não vazia. |

## Rollback

Remover o terceiro argumento nas chamadas do console e restaurar a leitura
string de `Memory.signQueue`; entradas estruturadas podem ser limpas pelo
cancelamento por destino.
