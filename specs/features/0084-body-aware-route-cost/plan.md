# 0084 — Custo de rota baseado no corpo do creep — Plan

## Approach

Adicionar uma função pura em `utils/routing.js` que transforma o corpo em
custos de tile. `findRoute()` continuará disponível como fallback e para o
grafo de salas; viagens com um creep usarão a validação de terreno já existente
quando possível, passando `plainCost`/`swampCost` derivados do corpo.

A fórmula segue a documentação oficial: road gera 1 ponto de fadiga por parte,
plain 2 e swamp 10, divididos por `2 * MOVE` para estimar ticks e limitados a
pelo menos 1 tick. Partes
`CARRY` entram como partes móveis somente até `ceil(carga / 50)`; CARRY vazio
não gera fadiga. Para o scout `[MOVE, MOVE]`, os três custos ficam em 1; para
corpos lentos, swamp fica mais caro. O valor de highway
continua sendo um desempate de grafo, não uma simulação de fadiga.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| nenhuma | |

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | Derivar custos por corpo e passá-los ao PathFinder da viagem. |
| `test/smoke.js` | Assertions de custo rápido/lento e propagação no route planner. |
| `specs/ROADMAP.md` | Registrar a feature 0084. |
| `specs/ARCHITECTURE.md` | Documentar o custo body-aware em `routing.js`. |

## Data shapes

Nenhuma chave nova em `Memory`. O corpo é lido do creep vivo; os custos são
números locais da chamada. Caches existentes de rota continuam por creep.

## How it satisfies the constitution

- **CPU:** não adiciona varredura; reaproveita a busca de terreno por viagem.
- **Memory:** não persiste dado derivado.
- **Fail-soft:** corpo ausente ou busca incompleta mantém o fallback atual.
- **Offline test:** smoke valida a função pura e o custo passado ao PathFinder.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| PathFinder com custo maior pode consumir mais CPU. | Reutilizar os limites atuais e só calcular uma vez por viagem. |
| Corpo muito lento prefere uma rota longa. | Custo representa ticks estimados; `maxRooms` e fallback permanecem. |
| Creep sem body no mock. | Fallback para os custos atuais. |

## Rollback

Remover a passagem de custos derivados e retornar aos defaults atuais de
`computeRealRoute`; a fila de assinatura e o nativeRoute permanecem
independentes.
