# Revisão independente dos planos de CPU, economia, boosts e Power — 2026-10-16

- **Status:** concluída; aguardando validação final independente e autorização do usuário.
- **Issue:** ARK-128 (In Progress). Nova: ARK-140 (feature 0157, Backlog). Features ARK-133–139 seguem pendentes.
- **Escopo:** somente documentação. Nenhum código, configuração, ordem de mercado, commit, deploy, `npx grunt` ou `graphify update`.
- **Entrada avaliada:** [relatório do Codex](revisao-planos-2026-10-15.md) (hipótese a contestar, não verdade) e specs 0148, 0149, 0150, 0153–0156.
- **Legenda:** **F** fato verificado no código ou no motor; **I** inferência; **H** hipótese; **D** dado histórico não reverificado; **[verificar]** ponto aberto.

## 1. Parecer

Os achados R01–R12 foram **confirmados** onde pude conferir. Dois deles são mais graves ou mais amplos do que o relatório diz (R04, R06).
Os planos são aprováveis em duas etapas: pré-requisitos e 0153 já; as demais só depois do contrato 0157 e dos dados das 0154/0155.
Os cinco bloqueadores abaixo foram resolvidos **no papel** (specs ajustadas); nenhum foi implementado.

## 2. Achados confrontados com evidência

| # | Veredito | Grav. | Evidência | Observação |
|---|---|---|---|---|
| R01 | **Confirmado** (F) | Alta | `labPolicyRuntime.js:145,151,156` (+5 fixo); `:330-331` suspende com qualquer efeito; `labReactions.js:58-73` (5 em quota, reserva, disponibilidade, `craftLedger.production`). Motor `run-reaction.js`: `reactionAmount = LAB_REACTION_AMOUNT + POWER_INFO[PWR_OPERATE_LAB].effect[nível-1]` enquanto `effect.endTime > gameTime`; ambos os reagentes perdem esse valor. | Lote variável por nível. Último tick do efeito: **[verificar]**. |
| R02 | **Confirmado, reproduzido** (F) | Alta | `test/equivalence/compare.js` passa o `world` original ao `project`. Reprodução do relatório em 2026-10-16: `{"equal":true,"divergences":[]}` com claims 10×999. | O oráculo só enxerga o retorno. Sequências e isolamento de módulos também faltam. |
| R03 | **Confirmado** (I) | Alta | Nenhuma spec definia "energia acessível" nem "abastecimento sustentável". | Resolvido pela 0157. |
| R04 | **Confirmado e agravado** (F) | Alta | `builder.run` chama `opportunisticWork` (`builder.js:251`; credita em `:139/:152`) e depois `invokeState` → `runBuild` (`prototypes/creep.js:141/:159`; credita de novo). Motor `creeps/intents.js`: **repair descarta build**; upgradeController é independente; intent repetido sobrescreve. Motor `upgradeController.js`: no RCL8 o teto `CONTROLLER_MAX_UPGRADE_PER_TICK` (+ efeito de operador) é um contador **no controller**, compartilhado; boost não muda a energia gasta. | Além de duplicar, o ledger credita um build que o motor descartou. `creditUpgrade` não aplica o teto. |
| R05 | **Confirmado** (I) | Alta | Duty por sala não distingue 1 WORK ativo de vários ociosos. | Resolvido pela 0157 (duty por parte). |
| R06 | **Confirmado e com ponto de integração** (F) | Alta | `transientStock.js:31-67`: `energyTarget(lab)` = `craft.labEnergyTarget` (padrão 0, "opt-in para manual boosts"); `allowedMineral` só aceita insumos de reação, pins e `labPolicyHold`. | O relatório não cita `labEnergyTarget`. A 0149 deve estendê-lo, não criar mecanismo paralelo. |
| R07 | **Confirmado** (I) | Alta | Builder também repara e faz upgrade. | Acrescentado piso de emergência independente da política. |
| R08 | **Confirmado parcialmente** (F/I) | Alta | Early returns existem em `labPolicyRuntime.js` (planning, powers). Não rastreei `assignments` → `execute` linha a linha. | Verificação restante para o validador. |
| R09 | **Confirmado** (I) | Alta | A fórmula `0,95·P ≥ bid·(1+margem)` é monotônica em P; só a competitividade a limita. Não revi o código de listagem de pixel. | |
| R10 | **Confirmado** (F) | Média | `swingTrade.js:132` `expire()` conta ticks; `createdTimestamp` não aparece no arquivo. | Prazo real é trabalho novo. |
| R11 | **Confirmado** (F) | Alta | `powerSpawn.js:16` chama `processPower()` direto; combustível por `hauler.optionalConsumer` (`:207`) e `powerFeedJob` (`:1095`) sem gate econômico. | |
| R12 | **Confirmado** (I) | Média | Concordo que probe/benchmark Node é limite superior. Sem medição ao vivo. | |

Baseline: `node test/smoke.js` termina com exit 0 (rodado em 2026-10-16). Dados de CPU (warm 15,97 / cold 167–197), auditoria 19/30 ordens e 3,88 M são **D**: não reverificados.

## 3. Problemas que o relatório original não achou

1. **Plans e tasks são em grande parte texto padrão.** "Data flow e falhas", "Validation / Rollout" e "Risks & mitigations" são idênticos nas sete features. A rastreabilidade
   spec → plan → tasks → AC existe só nas tasks (que citam números de AC). Esta revisão acrescentou pontos específicos, mas **não reescreveu** os trechos padrão. Divergência aberta para o validador.
2. **A 0155 tinha contradição interna.** Exigia 2 dias reais de cobertura e proibia persistência por tick; o heap zera em reset. Sem estado persistente o gate nunca fecharia. Resolvido pela `Memory.coverage` da 0157.
3. **A 0154 não declarava o oráculo como pré-requisito**, mas a 0156 sim; e a 0153 não depende de nenhum dos dois. A sequência foi reordenada de acordo.
4. **Ausência de AC para o fallback da constituição §9** em 0148 e 0149. Acrescentado.
5. **Rollback da 0148 com builder já morto** não era coberto. Acrescentado piso de emergência e AC.
6. **Custo afundado ao cancelar ordens** (0150) estava sem tratamento explícito. Acrescentado dry-run e flag.

## 4. Propostas aprovadas e onde estão documentadas

| Ponto | Decisão do usuário | Documentado em |
|---|---|---|
| B1 Ledger por slots de intent efetivo (só estimativa) | Aprovado | 0154 spec/plan/tasks (AC8–AC9) |
| B2 Contrato 0157 separado, margem 20% | Aprovado | `specs/features/0157-operational-readiness/` |
| B3 Cobertura persistente mínima em Memory | Aprovado | 0157 §4; 0155 AC7 |
| B4 Reparo do oráculo + autoteste | Aprovado | 0156 spec/plan/tasks (AC7) |
| B5 OPERATE_LAB como pré-requisito da fase 2 | Aprovado | 0150 spec (AC9) |
| L3 `labReserve` lido por `transientStock` | Aprovado | 0149 spec (AC8) |
| L5 Cancelamento: dry-run + `power.allowCancel` | Aprovado | 0150 spec (AC10) |
| L6 Piso de emergência de builder | Aprovado | 0148 spec (AC7) |
| L7 Fallback §9 | Aprovado | 0148 AC8; 0149 AC9 |
| C1 "Nenhuma sala elegível" é desfecho aceito | Aprovado | 0148 spec (AC9) |
| C2 Sequência revisada | Aprovado | ROADMAP; handoff §8 |

## 5. Pontos ainda abertos

- **[verificar]** Corte do último tick do efeito OPERATE_LAB: `effect.endTime > gameTime` contra o `Game.time` visto pelo script. Mitigação documentada: reservar com a base, aceitar as duas quantidades na confirmação.
- **[verificar]** Se cancelar uma ordem devolve alguma taxa. A fonte `cancel-order.js` retornou 404 em 2026-10-16. Mitigação documentada: tratar como custo afundado informativo.
- **[verificar]** Reset por tick do contador `_upgraded` do controller (o reset fica fora do arquivo lido). O teto e o compartilhamento foram confirmados.
- Defaults propostos e **não validados com dados**: margem 0,20; limite de idade; fração mínima de cobertura; corte de "renda chega ao consumidor".
- Constantes e comportamento do motor vêm do GitHub público, não da versão que o seu servidor roda. Reconfirmar antes de ativar.
- Nada foi medido ao vivo: Grafana, preços, estoque e GPL atuais não foram consultados.

## 6. Não verificado nesta revisão

`ARCHITECTURE.md` e `specs/README.md` não foram relidos por inteiro. Não rodei graphify (os hooks o pedem antes de ler código, mas a verificação foi dirigida por arquivo).
Não revi o código de listagem de pixel nem `assignments`/`execute` dos labs.

## 7. Recomendação

1. **Autorizar já, com escopo fechado:** reparo do oráculo com autoteste (0156/1) e ledger por slots (0154/1b), ambos offline; e a 0153, que independe deles.
2. **Autorizar depois da validação final:** 0157 → 0154 → 0155 → 0156.
3. **Manter adiadas:** 0148, 0149, 0150 até haver cobertura válida; aceitar que a 0148 pode terminar em "nenhuma sala elegível".
4. Não mudar nenhum default operacional (7 dias, 3%, 20%, 30 dias) sem dados atuais.

## 8. Verificação desta entrega

Alterados somente `docs/` e `specs/` (inclui a nova pasta `specs/features/0157-operational-readiness/`). Edições feitas por script com âncoras exatas.
Nenhum arquivo de `src/`, `test/` ou `grunt-scripts/` foi modificado. Validação documental: links relativos, `git diff --check`, CRLF preservado.
