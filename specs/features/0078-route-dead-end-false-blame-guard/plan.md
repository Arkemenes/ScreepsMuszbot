# 0078 — route-dead-end-false-blame-guard — Plan

Derivado de `spec.md`.

## Approach

Dois guards independentes, ambos em `utils/routing.js`:

1. **`hasEarlierRoom(creep)`** — lê `creep.memory._routeStack` e diz se
   existe alguma sala ANTES da atual no histórico real desta viagem.
   `retreatFrom()` passa a checar `avoidSoFar.length > 0 &&
   !hasEarlierRoom(creep)` logo no início — combinação que só é verdadeira
   num ciclo de recuo SEGUNDO-ou-posterior (já existe pelo menos 1 entrada
   em `_routeAvoid` de um beco anterior confirmado) landing de volta num
   lugar sem histórico mais antigo. Um travamento genuíno de PRIMEIRA
   viagem (`_routeAvoid` ainda vazio) não bate nessa condição — continua a
   culpa normal do ROADMAP 0063, preservando os testes existentes
   (mazeCreep/parkedCreep).
2. **Guard de sala própria** — `markDeadEnd()` recusa de cara
   (`remotes.isMine(roomName)`); `retreatFrom()` pula o push no
   `_routeAvoid` por-creep pela mesma checagem, independente do guard 1
   (uma sala própria nunca deveria entrar em NENHUM dos dois, mesmo no
   primeiro travamento de uma viagem).

Os dois guards juntos tornam a CONSEQUÊNCIA do bug relatado impossível de
repetir (sala própria nunca vira "beco"), mesmo sem ter fechado 100% a
causa exata do `ERR_NO_PATH` repetido.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | `hasEarlierRoom()` novo; `retreatFrom()` delega pra `retreatWithoutBlame()` na condição do guard 1; `markDeadEnd()` e `retreatFrom()`'s push no `_routeAvoid` ganham o guard de sala própria (`remotes.isMine`). |
| `test/smoke.js` | assertions AC1-AC4, preservando os testes pré-existentes (AC2). |

## Data shapes

Nenhuma mudança de formato — reaproveita `creep.memory._routeAvoid`/
`_routeStack` e `Memory.rooms[x].my`/`.routeDeadEndUntil` já existentes.

## How it satisfies the constitution

Ver "Constitution check" no `spec.md`.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Guard 1 amplo demais, quebrando detecção legítima de beco genuíno logo na primeira viagem | Testado explicitamente: mazeCreep/parkedCreep (testes pré-existentes, primeiro travamento, `_routeAvoid` vazio) continuam passando sem alteração — só o cenário de SEGUNDO ciclo (`_routeAvoid` não-vazio) muda de comportamento. |
| Causa raiz do `ERR_NO_PATH` em E1N47 continuar sem explicação completa | Aceito por ora (ver "Out of scope") — os guards tornam a pior consequência (bloquear a própria base) impossível independente da causa; investigação mais funda fica pra quando/se reaparecer de um jeito que não seja coberto por esses dois guards. |

## Rollback

`git revert`. Em produção, `clearRouteDeadEnd(roomName)` já limpa qualquer
marca indevida sem precisar reverter código.
