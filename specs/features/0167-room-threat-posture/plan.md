# 0167 — Postura de defesa por nível de ameaça — Plan

Derivado de `spec.md`. A classificação começa em observação; o modo de ação é um rollout posterior controlado.

## Approach

Extrair os sinais de risco que hoje estão divididos entre `combat` e `rooms/defense.js` para um avaliador único. O avaliador retorna um objeto compacto com nível, causa, dano estimado e menor `ticksToKill`; a decisão final de safe mode continua usando o mesmo cálculo e threshold já observados em produção. A primeira ativação registra a classificação sem mudar spawn ou ações.

Na etapa seguinte, `rooms/needs.js` consome apenas níveis `engaged`/`critical` para priorizar reforço defensivo, com limites de população e energia existentes. Escalada crítica ocorre no tick do sinal; histerese/cooldown só servem para evitar desmobilização oscilante. Não integrar contra-ataque nesta feature. O resumo por sala alimenta telemetria e pode ser consumido futuramente pelo governor 0165.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/threatPosture.js` | Avaliar sinais de ameaça e retornar nível/causas de forma determinística; manter só estado mínimo de recuperação no heap/Memory. |

### Changed

| Path | Change |
|------|--------|
| `src/rooms/defense.js` | Consumir o risco compartilhado para telemetria; preservar `checkSafeMode()` e o threshold vigente. |
| `src/rooms/needs.js` | Em `enforce`, usar nível para prioridade/quantidade defensiva dentro dos caps já existentes; em `observe`, manter decisões idênticas. |
| `src/rooms/intel.js` | Fornecer sinais de hostis já coletados; evitar nova busca. |
| `src/utils/combat.js` | Reutilizar `threats()`, `incomingDps()` e cálculo de alcance/dano; só extrair função se necessário para não duplicar fórmula. |
| `src/utils/stats.js` | Publicar por sala nível, causa, tick e `ticksToKill` resumido. |
| `src/utils/config.js` | Defaults de `combat.threatPosture.mode = "observe"`, histerese e limites. |
| `test/smoke.js` | Fixtures para classificação, rampart efetiva, transição, modo e efeitos sobre população. |

## Data shapes

- `Memory.settings.combat.threatPosture`: `{ mode: "observe", recoveryTicks, engagedThreshold, criticalTicksToKill }`; `criticalTicksToKill` deriva do threshold atual de safe mode até uma decisão explícita em spec própria.
- Resultado da avaliação: `{ level, label, reason, armedHostiles, incomingDps, ticksToKill, at }`; nenhum campo contém game object ou array de creeps.
- Se histerese precisar atravessar reset, persistir somente `{ level, changedAt }` em `Memory.rooms[roomName].threatPosture`; do contrário usar heap e recomeçar em `unknown` após reset. A implementação escolherá a menor persistência compatível com as fixtures.
- `Memory.stats.rooms[roomName].threatPosture` publica apenas o resumo atual, sem histórico de amostras.

## How it satisfies the constitution

- **CPU:** consulta `combat.threats()` e estruturas via cache existente; usar os dados de intel do tick, sem varrer `Game.creeps` ou executar `room.find` direto.
- **Memory:** guardar resumo mínimo e IDs não necessários são evitados; não persistir objetos ou snapshots.
- **Fail-soft:** modo `observe` por padrão; sinais inválidos resultam `unknown`; safe mode continua protegido pelo cálculo/threshold atual.
- **Offline test:** mocks de hostis armados/desarmados, boost, range, spawn, rampart e bucket; comparar chamadas e intents `observe` contra baseline e exigir reforço só em `enforce`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Falso positivo muda safe mode ou consome energia | Não mudar o safe-mode gate; hostil desarmado não é ameaça armada; observe-first e live gate. |
| Histerese atrasa reação a um ataque | Histerese somente na recuperação; `critical` escala imediatamente. |
| Fórmulas divergem de `checkSafeMode()` | Reusar/extrair a mesma função de DPS/TTK e fixar equivalência por fixture. |
| Sinal de intel está stale | Expor `unknown`/idade da evidência e evitar inferir calma; não mudar ação sem visão confiável. |

## Rollback

Manter `Memory.settings.combat.threatPosture.mode = "observe"` ou remover a configuração. `needs.js` conserva o cálculo atual por contagem de hostis; `checkSafeMode()` permanece no código e com o mesmo threshold. Sem migração destrutiva de Memory.
