# 0166 — Auditoria read-only de layout e defesa — Plan

Derivado de `spec.md`. O agendamento começa desabilitado; a consulta manual permanece sujeita ao governor e ao limite de uma sala por tick.

## Approach

Implementar um comparador puro que recebe plano, RCL, progresso do arquiteto, estruturas e construction sites já consultados pelo cache. O resultado é uma lista ordenada de diferenças e causas. A verificação defensiva usa as ramparts que já constam em `plan.buildings`; não recalcula mincut nem presume que etapas ainda não gravadas já deveriam existir.

Separar scheduler e comando do comparador. O scheduler escolhe no máximo uma sala por tick, respeita `cpuTier`/governor e mantém apenas cursor e tick da última execução no heap. Uma consulta manual consome a mesma cota e não consegue contornar o governor. Nenhum caminho chama método que crie, destrua ou repare estruturas.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/layoutAudit.js` | Comparar entradas do plano com estruturas/sites e retornar resumo read-only determinístico. |

### Changed

| Path | Change |
|------|--------|
| `src/main.js` | Chamar scheduler dentro de `guard()` em baixa prioridade e no máximo uma vez por tick; registrar `global.layoutAudit(roomName)`. |
| `src/utils/layoutAudit.js` | Exportar comparador, scheduler e função de consulta manual read-only. |
| `src/utils/config.js` | Definir `planner.layoutAudit.enabled = false` e `planner.layoutAudit.intervalTicks = 1000`. |
| `test/smoke.js` | Fixtures de plano concluído/parcial, RCL, site, tipo divergente, rampart e scheduler. |

`src/utils/planStore.js` e `src/utils/roomCache.js` são interfaces existentes e não devem ganhar chamadas duplicadas de leitura.

## Data shapes

- Config em `Memory.settings.planner.layoutAudit`: `{ enabled: false, intervalTicks: 1000 }`.
- Cursor, tick da sala auditada neste tick e último tick por sala vivem no heap; reset pode causar uma auditoria antecipada, sem risco de mutação.
- O resultado transitório contém `{ roomName, status, findings[] }`; cada finding usa `{ x, y, expectedType, actualType, state, reason }`. Não é persistido em `Memory`.
- Estados padronizados: `compliant`, `missing`, `mismatch`, `sitePending`, `rclDeferred`, `planIncomplete`, `defenseDeferred`.

## How it satisfies the constitution

- **CPU:** uma sala por tick, uma consulta de cada tipo pelo `roomCache`, scheduler em baixa prioridade e subordinado ao governor.
- **Memory:** plano permanece no segmento já existente; resultados e cursor não guardam snapshots nem game objects em `Memory`.
- **Fail-soft:** sem visão/plano consistente, devolver causa informativa; erro do scheduler fica sob `guard()`; auditoria jamais altera estado do jogo.
- **Offline test:** stubs controlam RCL, `planStep`, estruturas e sites; spies afirmam que `createConstructionSite`, `destroy` e `repair` não são chamados.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Falso alerta enquanto o plano ainda é gerado | Comparar somente entradas existentes; diferir defesa até a etapa correspondente. |
| Limite de RCL confundido com ausência | Aplicar `minimalRCL` e contagem/capacidade de `CONTROLLER_STRUCTURES` antes de reportar. |
| Custo ou dupla busca de sala | Usar os dois métodos de `roomCache`; processar uma sala por tick e medir a chamada no smoke. |
| Consulta manual executada com CPU pressionada | Não permitir bypass do governor; retornar `deferred` e motivo. |

## Rollback

Manter `planner.layoutAudit.enabled = false` e remover o comando/scheduler sem tocar no arquiteto ou no layout. Como a feature não escreve estado de jogo, não há migração ou reparo de Memory para reverter.
