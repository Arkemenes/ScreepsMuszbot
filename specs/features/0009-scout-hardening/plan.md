# 0009 — Scout hardening — Plan

Derivado de `spec.md`. Se o plano revelar que a spec está errada, conserte a
spec primeiro.

## Approach

Dois módulos, três mudanças pontuais. Em `utils/move.js`, `findPath()` passa a
devolver o resultado inteiro do `PathFinder.search` (não só `.path`), e
`travel()` trata `incomplete: true` como falha (`ERR_NO_PATH`) antes de
adotar o caminho — corta o caso em que um creep anda até o fundo de um bolsão
achando que o caminho é válido. Em `roles/scout.js`, a exploração livre troca
seu cálculo manual de tile de borda (`findExit` + `findClosestByRange` +
`moveTo` intra-sala, que nunca cruza a borda de verdade) por
`utils/routing.moveToRoom(creep, targetRoom, {range: 20, reusePath: 20})` — o
mesmo helper que as tarefas de sign/layout já usam, que resolve rota e
cruzamento de sala via `Creep.prototype.moveTo` nativo. Isso elimina a
necessidade de guardar `creep.memory.target` (x/y) — só `targetRoom` resta.
Uma sala que devolve `ERR_NO_PATH` ganha `Memory.rooms[room].scoutBlacklistUntil`
e a reseleção passa a pular salas com blacklist ativo. Além disso, a
reseleção ganha memória de uma etapa (`creep.memory.cameFrom`): nunca escolhe
de volta a sala que o scout acabou de deixar, a não ser que seja a única
opção — nesse caso a sala atual (comprovadamente um beco-sem-saída) entra no
mesmo blacklist antes do recuo, evitando o ping-pong A↔B que a regra
"visita a sala vista há mais tempo" sozinha não resolve (visitar A ou B
sempre deixa a outra "mais fresca" pra sair DE, nunca a mais velha a evitar).

## Modules

### New

Nenhum módulo novo — tudo cabe em `utils/move.js` e `roles/scout.js` +
uma entrada de default em `utils/config.js`.

### Changed

| Path | Change |
|------|--------|
| `src/utils/move.js` | `findPath()` devolve `{path, incomplete}` (era só o array); `travel()` retorna `ERR_NO_PATH` quando `incomplete` é `true`, antes de cachear/seguir o caminho parcial. |
| `src/roles/scout.js` | Bloco de exploração livre reescrito: usa `routing.moveToRoom` em vez de `findExit`/`findClosestByRange`/`moveTo` manual; remove `creep.memory.target`; adiciona `isBlacklisted()`/`blacklistRoom()` locais e os usa na reseleção e no tratamento de `ERR_NO_PATH`; a reseleção exclui `creep.memory.cameFrom` e blacklista a sala atual antes de recuar quando não sobra outra opção. |
| `src/utils/config.js` | Nova chave `scout.blacklistTicks` (default `5000`). |

## Data shapes

- `Memory.rooms[roomName].scoutBlacklistUntil: number` — `Game.time` a partir
  do qual a sala volta a ser elegível para exploração. Escrito só pelo scout,
  lido só pela reseleção do scout. Não precisa de limpeza explícita — um
  campo antigo e vencido (`scoutBlacklistUntil <= Game.time`) simplesmente
  para de ter efeito; não cresce sem limite porque só existe uma entrada por
  sala já vista (mesmo objeto que `Memory.rooms[roomName]` já usa para
  `lastVisit` etc.).
- `creep.memory.targetRoom: string` — inalterado. `creep.memory.target`
  (`{x, y}`) é removido; nenhum outro módulo lê essa chave para scouts (miner
  usa `.target` para um id de source, roles distintos usam `.targetRoom` de
  forma independente — sem colisão, confirmado por grep).
- `creep.memory.cameFrom: string` — a sala que o scout deixou pra chegar na
  atual; atualizada só no momento em que uma nova `targetRoom` é escolhida.
  Só o próprio `scout.js` lê/escreve; nenhum outro role usa essa chave.

## How it satisfies the constitution

- **CPU:** `moveToRoom` já roda hoje (sign/layout); reusar não adiciona
  `PathFinder.search`/`findRoute` novo por tick, só troca qual código o
  scout de exploração chama. Checar `scoutBlacklistUntil` é uma comparação de
  número, sem custo relevante.
- **Memory:** um número por sala já rastreada — não um objeto de jogo, não
  cresce por tick.
- **Fail-soft:** `ERR_NO_PATH`/`ERR_INVALID_TARGET` de `moveToRoom` sempre
  limpam `targetRoom` e blacklistam antes de retornar; nenhum branch deixa o
  scout preso retentando a mesma sala todo tick sem chance de sair do loop.
- **Offline test:** `test/smoke.js` ganha 3 assertions novas — moveTo cruza
  pra `roomName` da sala-alvo (AC3), `travel()` recusa um `PathFinder`
  resultado `incomplete` (AC4), reseleção pula sala em blacklist (AC5).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Tratar todo `incomplete: true` como `ERR_NO_PATH` pode gerar falso-negativo se `maxOps: 2000` for insuficiente pra uma sala legitimamente alcançável mas com terreno muito recortado. | `maxOps: 2000` já é generoso pra uma busca de 1 sala (~2500 tiles); um falso-negativo custa só um repath futuro (`ERR_NO_PATH` já é tratado como "recuar e tentar de novo" por todo chamador existente), não dano permanente. Nenhuma spec/teste hoje depende do comportamento antigo de seguir um caminho parcial. |
| Rotear exploração via `moveToRoom` (que penaliza sala hostil/não-highway) poderia, em tese, desviar o scout de uma sala vizinha só porque ela é hostil. | Para um destino a 1 hop de distância não há rota alternativa a escolher — `findRoute` só tem o caminho direto disponível; a penalidade de `routeCostCallback` nunca chega a excluir a única sala possível (`blockHostiles` fica `false`, o default, pra exploração). |
| Remover `creep.memory.target` podia quebrar algo que dependesse dele. | Confirmado por grep: nenhum outro módulo lê `creep.memory.target` de um scout; outros roles usam a mesma chave de memory pra propósito próprio e não colidem (memory é isolada por creep). |

## Rollback

Reverter `roles/scout.js` e `utils/move.js` para a versão anterior a este
commit; `Memory.rooms[*].scoutBlacklistUntil` órfão não causa efeito colateral
(só é lido pela reseleção do scout) e pode ficar ou ser limpo manualmente.
