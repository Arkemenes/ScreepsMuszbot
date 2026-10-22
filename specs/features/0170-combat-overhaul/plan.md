# 0170 — Revisão completa da lógica de combate — Plan

Derivado de spec.md; ARK-216 fica no Backlog até revisão da spec.

## Approach

Começar por falhas observáveis e fixtures mínimas por role antes de escrever uma máquina tática nova. Mapear entradas e intents atuais; definir um snapshot tático compacto por tick que combina census, intel, body parts ativos, range, rampart e postura da sala. Implementar helpers puros para seleção de alvo, prioridade de cura, recuo e movimento alcançável. Migrar os roles por etapas, mantendo safe mode e controle de ofensiva como contratos fora do núcleo.

Defender e squads precisam de objetivos diferentes: defensor guarda a própria sala ou o ponto defensivo; squad segue a missão e se move em conjunto. A implementação deve compartilhar estimativas e comandos, mas manter políticas por missão. Alterações de política ficam observe-first até cenários e uma janela live mostrarem que não há ataque indesejado ou perda de cobertura.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| src/utils/combatTactics.js | Avaliação pura de ameaça, alvo, cura, recuo e progresso de formação. |

### Changed

| Path | Change |
|------|--------|
| src/utils/combat.js | Expor sinais e helpers compartilhados sem duplicar room.find. |
| src/roles/defender.js | Alvo/posicionamento defensivo e recuperação de movimento. |
| src/roles/defenderStriker.js | Execução de dano com avaliação de capacidade. |
| src/roles/defenderMedic.js | Cura, acompanhamento e recuo coordenados. |
| src/utils/squad.js | Formação, progresso/stall, missão e encerramento. |
| src/rooms/raiding.js | Consumir o núcleo para missões manuais e reconciliar 0123. |
| src/rooms/defense.js | Preservar safe mode; consultar sinais táticos sem mudar o gatilho sem aprovação. |
| test/smoke.js | Fixtures determinísticas por role e transição. |

## Data shapes

- Snapshot tático por tick em heap: ids e métricas derivadas; nunca serializar Room/Creep/Structure.
- Memory de creep: missão, phase, targetId, rallyRoom, progressTick e retry compacto.
- Memory.rooms: nível/código/tick somente se a postura 0167 exigir telemetria persistente.
- Config em Memory.settings.combat com allowlist, staleness, thresholds e rollout observe/enforce.

## How it satisfies the constitution

- **CPU:** consume census e roomCache; cada avaliação possui orçamento/cache e stall guard.
- **Memory:** estados de missão pequenos; IDs resolvidos pelo Game.getObjectById.
- **Fail-soft:** targets/vision invalidos não autorizam ataque; defesa e safe mode atuais preservados até aceite.
- **Offline test:** cada helper puro é testado nos casos limites; role-level smoke observa intents sem depender do shard.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Reescrita ampla introduz regressão entre roles. | Implementar por interfaces, role a role, com baseline de cenários antes/depois. |
| Intel de sala distante está stale. | Incluir frescor como entrada e não produzir ordem ofensiva sem confirmação. |
| Movimento em grupo gera stall. | Guardar progresso, tempo sem avanço e fallback de separação/retorno por missão. |
| A lógica ativa reação ofensiva inesperada. | Definir defesa/ataque como políticas separadas; ofensiva manual como default invariável. |

## Rollback

Migrar cada role atrás de configuração de rollout independente e preservar o helper anterior até o aceite do novo comportamento. Reverter uma role sem reverter as demais.
