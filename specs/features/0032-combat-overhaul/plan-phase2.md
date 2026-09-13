# 0032 — Combat overhaul — Plan (Fase 2: D2 + D3 + O1)

Derivado de `spec.md`. Escopo: dupla striker+medic (D2), postura de tanque
atrás de rampart (D3), e mop-up reativo (O1). Fase 1 (D1+D4) já entregue
(`plan.md`/`tasks.md`). Fases 3–4 continuam fora deste documento.

**Decisão de revisão:** o `defender` solo (já melhorado na Fase 1)
**continua existindo como fallback** — não é substituído. A sala spawna a
dupla striker+medic assim que `energyCapacityAvailable` cobre o custo de
um par de verdade; abaixo disso, continua spawnando o defender solo de
sempre. Sem regressão de resposta numa sala nova/pobre sob ataque de
surpresa.

## Approach

**Refatoração primeiro:** `defender.js` hoje tem toda a lógica de alvo/tiro/
cura/fuga inline. Antes de criar dois roles novos que precisariam da
metade dessa lógica cada, ela migra pra `utils/combat.js` (constitution
§5 — comportamento compartilhado não se copia entre roles):
`threatPriority`, `pickTarget`, `shoot`, `patch` (cura, adaptado pra
aceitar "sem HEAL" — o striker não cura), `kiteAwayFrom`. `defender.js`
encolhe pra só corpo/spawn + chamar essas funções — comportamento
observável idêntico ao de hoje (Fase 1 já validada), só a localização do
código muda.

**Pareamento (`memory.partnerId`, sem `Memory.squads`):** striker e medic
nascem de spawns separados (papéis diferentes na fila), não há como saber
o id um do outro no momento do spawn. Cada um, enquanto `!memory.partnerId`,
procura (via `census.all(otherRole)`) o primeiro parceiro sem
`partnerId` (ou cujo `partnerId` aponta pra um creep morto) e fecha o par
nos dois lados no mesmo tick. Um striker sem parceiro (ainda não pareado,
ou o medic morreu) age sozinho, reaproveitando exatamente a lógica do
`defender.js` de hoje (kite + fuga) até um medic aparecer. Um medic sem
parceiro cura o aliado ferido mais próximo (mesma lógica de "nothing to
fight" do defender de hoje) até um striker aparecer.

**D3 (tanque atrás de rampart) — verificação, não predição:** calcular de
antemão se uma tile de rampart específica está "realmente selada" contra
melee (depende da vizinhança inteira, não só da tile) é caro e frágil.
Em vez disso: o striker tenta segurar posição na rampart própria mais
perto; a régua de "preciso fugir" muda de "melee a alcance ≤ `KITE_RANGE`"
(hoje, campo aberto) pra "melee a alcance ≤ 1" quando já está em cima de
rampart própria — se o melee realmente conseguir chegar adjacente mesmo
assim (brecha no perímetro), o striker aprende isso **no próprio tick**
(a checagem já falhou) e cai pro comportamento de fuga de sempre. Sem
tanque disponível (sala nova, sem plano, remote), o striker nunca acha
rampart própria por perto e o comportamento é idêntico ao kite de hoje —
zero regressão fora de uma base já murada.

**O1 (mop-up) — corrigido durante a implementação:** o plano original
cogitava distinguir "hostil armado" de "hostil desarmado ainda na sala"
via `utils/combat.threats`, mas isso acabou não fazendo diferença prática
— `getHostiles()` (via `isHostile()`, ROADMAP 0012) já só considera
hostil, numa sala própria, quem está **armado**; um scout inimigo
desarmado nunca aparece em `getHostiles()` pra começo de conversa. A
distinção de verdade que importa: perseguir um hostil que fugiu pra uma
sala vizinha exigiria visão da sala vizinha + limite de tempo/distância +
risco de emboscada em território desconhecido — bem além do "ajuste
trivial" estimado na spec original. Escopo reduzido, de propósito, pra
perseguição **na mesma sala**: com a ameaça de melee neutralizada (ou já
protegida por rampart), um alvo **ferido** (`hits < hitsMax`) dentro de
`config.get("defender.mopUpRange", 10)` tiles da spawn é perseguido até
alcance 1 pra terminar o serviço, em vez de só segurar `KITE_RANGE` pra
sempre e deixar ele se recuperar; um alvo saudável continua só sendo
segurado a distância, como o `defender` de sempre. Perseguição pra fora da
sala fica pra uma iteração futura, se algum dia valer a pena.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/roles/defenderStriker.js` | `RANGED_ATTACK`-heavy, sem `HEAL`. Combate via `utils/combat.js` (compartilhado). Postura D3 (rampart própria mais perto; kite se não achar/não segurar). Pareamento com `defenderMedic` via `memory.partnerId`. Mop-up (O1) quando não sobra hostil armado. |
| `src/roles/defenderMedic.js` | `HEAL`-heavy, sem `RANGED_ATTACK`. Segue o `partnerId` a alcance 1–3, cura ele (e a si mesmo primeiro, igual ao `defender` de hoje). Sem parceiro: cura o aliado ferido mais próximo. |

### Changed

| Path | Change |
|------|--------|
| `src/utils/combat.js` | Ganha `threatPriority(hostile)`, `pickTarget(room)`, `shoot(creep, hostiles)`, `patch(creep, { canHeal })` (o `canHeal:false` do striker pula o self-heal), `kiteAwayFrom(creep, hostiles)` — migrados de `defender.js`, mesma lógica. |
| `src/roles/defender.js` | Encolhe pra corpo/spawn + chamadas às funções de `combat.js`. Comportamento inalterado (mesma cobertura de smoke da Fase 1 continua valendo). |
| `src/rooms/needs.js` | `usePairs = room.energyCapacityAvailable >= config.get("defender.pairEnergyThreshold", 500)`. `defender` = contagem de hoje quando `!usePairs`, `0` quando `usePairs`. `defenderStriker`/`defenderMedic` = mesma contagem (1 par por unidade de ameaça, mesmo teto `defender.maxCount`) quando `usePairs`, `0` quando não. |
| `src/rooms/spawning.js` | Nenhuma mudança de lógica - `defenderStriker`/`defenderMedic` entram em `roles/index.js` na mesma posição de prioridade do `defender` (logo depois do `bootstrap`), então já herdam a prioridade certa por ordem de declaração. |
| `src/roles/index.js` | Registra `defenderStriker`, `defenderMedic` logo após `defender`. |
| `src/utils/config.js` | `defender.pairEnergyThreshold` (500), `defender.mopUpRange` (10). |
| `test/smoke.js` | Cobertura nova: pareamento (dois creeps sem parceiro se acham e fecham `partnerId` nos dois lados), striker sozinho (sem medic) se comporta como o `defender` de hoje, medic sozinho cura o aliado mais próximo, striker segura posição em rampart própria contra melee (não foge a `KITE_RANGE`, só a alcance 1), striker foge quando o melee alcança mesmo em cima da rampart (brecha), `needs.js` alterna `defender` vs par conforme `energyCapacityAvailable`, mop-up persegue hostil ferido dentro do alcance e não sai perseguindo um hostil saudável ou fora do alcance. |

## Data shapes

| Chave | Onde | Forma |
|-------|------|-------|
| `creep.memory.partnerId` | `Memory.creeps[striker\|medic]` | `string` (id do parceiro) \| `undefined` |
| `config.get("defender.pairEnergyThreshold")` | `defaults`/`Memory.settings.defender` | `number` (energia, default 500) |
| `config.get("defender.mopUpRange")` | idem | `number` (tiles, default 10) |

Nenhuma chave nova de `Memory.rooms` - `defenseActive`/`enemies` já
existem e bastam pra tudo isso.

## How it satisfies the constitution

- **CPU:** busca de parceiro é `census.all(role)` (já é uma varredura
  única cacheada por tick, §1) filtrada por `!partnerId`, O(creeps de
  combate) - pequeno sempre. Busca de rampart usa
  `roomCache.structuresByType` (já cacheada por tick) + `findClosestByRange`
  (barato, não é pathfinding).
- **Fail-soft:** `Game.getObjectById(partnerId)` ausente (parceiro morreu)
  cai pro comportamento solo, nunca lança. Guard de `main.js` já cobre
  qualquer role novo automaticamente (é genérico por `role`).
- **§5 (roles finos):** é exatamente o motivo da refatoração pra
  `combat.js` antes de escrever os roles novos - zero duplicação entre
  `defender`/`defenderStriker`/`defenderMedic`.
- **Offline test:** ver linha de `test/smoke.js` acima.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Pareamento pode "roubar" o parceiro errado se houver mais de 1 candidato sem par no mesmo tick (ex.: 2 strikers e 2 medics recém-spawnados) | Determinístico o bastante pro escopo: primeiro encontrado por `census.all()` fecha primeiro - sem preferência de distância por ora; se virar problema na prática, dá pra trocar por "mais perto" depois sem mudar a forma do dado (`partnerId` continua igual) |
| Striker sem medic (parceiro morreu) fica mais frágil que a dupla, mas nunca pior que o `defender` solo de hoje - risco aceito, não um regressão | N/A - já é o comportamento de fallback intencional |
| D3 pode oscilar (sobe na rampart, brecha empurra pra fuga, sobe de novo) num cerco prolongado numa base com perímetro furado | Aceitável - é estritamente a mesma decisão que o `defender` de hoje tomaria (fugir de melee perto), só que primeiro tenta a rampart; nunca fica pior que sempre-fugir |
| Refatorar `defender.js` pra `combat.js` pode introduzir uma regressão sutil de comportamento sem querer | A suite da Fase 1 já cobre o corpo/ordem; adicionar uma assertion equivalente ao comportamento de tiro/fuga/cura do `defender` ANTES de mover o código, confirmar que continua passando depois da migração |

## Rollback

Reverter os arquivos de produção listados. `memory.partnerId` é só um
campo solto em `Memory.creeps[x]` - sem migração, ignorado se não lido.
Nenhum dado de `Memory.rooms` envolvido.
