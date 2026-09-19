# 0102 — Gate econômico para links e conversão de upgrader — Plan

Derivado de `spec.md` após review: o gate usa o estado econômico existente, e o desconto de conversão é aplicado depois de autoscale e clamps para afetar a demanda final sem contaminar estado persistido.

## Approach

Filtrar links não-coletores nos pontos de seleção do builder e do upgrader com `reservations.economyStable(room)`. O builder mantém sua seleção geral e o upgrader mantém seus gates de controller e energia.

Ao converter, o upgrader registra a origem no `Memory.creeps[name]` e troca o role para `builder`. `rooms/needs.js` conta builders derivados com o `census` da sala e subtrai essa contagem depois de `autoscale.apply()` e do limite de RCL8.

## Modules

| Path | Change |
|------|--------|
| `src/roles/builder.js` | Bloquear links não-coletores enquanto a economia estiver crítica. |
| `src/roles/upgrader.js` | Aplicar o gate e registrar conversões. |
| `src/rooms/needs.js` | Descontar builders convertidos da demanda final. |
| `test/smoke.js` | Cobrir economia crítica/estável e conversão. |
| `specs/ARCHITECTURE.md` | Documentar o comportamento. |
| `specs/ROADMAP.md` | Registrar a feature. |

## Data shapes

`Memory.creeps[name].convertedFrom` é a string primitiva `"upgrader"`. Não há novas chaves em `Memory.rooms` nem objetos do jogo persistidos.

## How it satisfies constitution

- **CPU:** `census` mantém uma única passagem por `Game.creeps`.
- **Memory:** somente string primitiva permanece em `Memory`.
- **Fail-soft:** sem link elegível, os roles aguardam ou usam fallbacks.
- **Offline test:** o smoke registra o creep convertido antes do cálculo.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Link coletor ser bloqueado | O filtro exige `!s.isCollector()`. |
| Conversão não aparecer no census | O smoke registra o creep no mapa de `Game.creeps`. |
| Override interagir com desconto | O desconto ocorre antes de `applyOverride`. |
