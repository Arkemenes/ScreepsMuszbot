# ScreepsMuszbot — Constitution

Os princípios inegociáveis deste código. Toda spec, todo plano e toda revisão
são checados contra eles. Emendar a constituição é, em si, uma feature
(`specs/features/…`) e exige uma linha no `ROADMAP.md`.

---

## 1. CPU is the budget

Um tick tem ~20 de CPU (o bucket vai até 10000). Pathfinding e
`room.find` / `_.filter(Game.creeps, …)` repetidos costumam ser os maiores
custos.

- **Uma varredura por tick.** `Game.creeps` é iterado uma vez
  (`utils/census`). `room.find(TYPE)` roda uma vez por `(room, type, tick)`
  (`utils/roomCache`).
- **Cachear dado derivado no heap**, chaveado por `Game.time` ou por um sinal
  de versão barato (contagem de estruturas, tamanho do plano) — nunca
  recomputar por creep.
- **Medir antes de otimizar.** `Memory.settings.profiler = true` +
  `Game.profiler.profile(100)`. Uma mudança que alega ganho de CPU informa o
  antes/depois.
- Degradar graciosamente quando `Game.cpu.bucket` está baixo (pular
  planejamento, visuais).

## 2. Memory is serialized every tick

`RawMemory._parsed = Memory` roda todo tick; o custo escala com o tamanho.

- **Pequena.** Só o que precisa persistir e ser lido de volta depois.
- **Dado estático / derivado → heap** (`terrain`, cost matrices, cache de
  rota).
- **Dado grande e persistente → `RawMemory.segments`** (planos de cidade).
- **Nunca guardar um objeto de jogo na Memory.** Guarde o `.id` e resolva com
  `Game.getObjectById` no ponto de uso.
- `Memory.creeps` / `Memory.structures` de creeps/estruturas mortos são
  coletados no `main`.

## 3. Fail soft

A exceção de um subsistema nunca pode abortar o tick.

- Toda chamada de subsistema no `main` é envolvida por `guard(label, fn)`.
- Loops longos e máquinas de passos (o planejador) têm um stall guard que
  força progresso e loga, em vez de rodar para sempre.
- Um subsistema novo entra na lista do `guard` na mesma mudança.

## 4. Deterministic and testable offline

- A lógica central precisa carregar e rodar sob `test/smoke.js` (mock de
  `Game` / `Memory` / constantes) sem servidor.
- **Toda mudança de comportamento adiciona ou atualiza uma assertion** no
  smoke test.
- Definition of done de qualquer mudança de código:
  `node --check` em todo arquivo tocado · `test/smoke.js` verde ·
  `npx grunt` builda `dist/main.js`.

## 5. Roles are thin, utils own the cross-cutting concerns

- `src/roles/*` descrevem *comportamento* de um role de creep e pouco mais.
- Movimento, combate, census, caching, planejamento e contabilidade de energia
  ficam em `src/utils/*` — uma responsabilidade por módulo, sem `require`
  circular.
- Comportamento compartilhado (ex.: `takeCover`, `travel`) é chamado dos
  roles, não copiado.

## 6. Config over hardcode

Tunables — listas de inimigos, feature flags, contagens-alvo, thresholds —
ficam em `Memory.settings` ou num módulo de config, não em literais espalhados
pelo código.

## 7. Prefer the no-op

O pathfinding mais barato é nenhum; o spawn mais barato é nenhum.

- Projetar layouts para que os workers-chave (miner, upgrader, pontas do
  hauler) sejam **estáticos**.
- Cachear rotas fixas; só recalcular em caso de falha.
- Spawnar a população mínima viável; escalar corpos com a capacidade da sala.

## 8. Spec before code

Qualquer mudança não-trivial ganha um `spec.md` (o quê / por quê / critérios de
aceitação) antes da implementação. O spec é a fonte da verdade — o código e os
testes derivam dele e não podem divergir em silêncio. Mudanças triviais (typo,
rename, um guard de uma linha) podem pular o spec, mas ainda obedecem os
princípios 1–7.

## 9. Spending cascade: crítico → saudável → ótimo, sempre com fallback

Toda decisão de "onde gastar um recurso" (energia de um hauler, reparo de uma
torre/rampart, energia de um link, fila de spawn) resolve em três faixas,
nessa ordem: **crítico** (precisa agora, incondicional), **saudável /
satisfatório** (vale a pena, sem gate de reserva) e **ótimo / ideal** (só
topar mais enquanto sobra reserva). Ver `rampartRepair.worthHardening`,
`hauler.pickDeliver`, `structures/link.js`'s `pickTarget`,
`structures/tower.js`, `roles/builder.js`, `rooms/spawning.js` — o padrão já
existia espalhado por specs anteriores (0032, 0043, 0054) antes de virar
princípio (0059).

- Uma faixa pode ser propositalmente pulada num tick em favor de algo mais
  urgente que ainda não se sabe se vai aparecer — mas nunca fica sem um
  caminho de volta: se nada mais reivindicar o recurso naquele tick, a
  unidade cai pro alvo preterido em vez de ficar ociosa com capacidade
  sobrando. Bug real motivador (usuário reportou em produção, 2026-09-13,
  ROADMAP 0059): `hauler.pickDeliver` deixava uma torre entre
  `criticalRatio` e `satisfactoryRatio` fora das duas faixas de propósito,
  sem fallback nenhum — um hauler cheio ficava parado do lado dela sempre
  que mais nada no cascade também precisasse da energia.
- **A coleta é isenta.** Harvest, regen de source/mineral, cooldown de
  lab/link já têm limite físico próprio (uma fonte só regenera tanto por
  tick) — não é escassez artificial de uma cascata mal desenhada, então não
  precisa (nem deveria) ser forçada nessa mesma disciplina de 3 faixas.
- Toda spec nova que introduz uma cascata de gasto é checada contra este
  princípio na revisão: existe um fallback de última instância, ou alguma
  faixa pode deixar a unidade ociosa com capacidade real disponível?
