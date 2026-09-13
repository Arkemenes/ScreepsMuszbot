# 0053 — cancelClaim() console command

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-12

## Problem

O usuário pediu (a partir de uma ideia maior de "bases de recuperação" pro
claimer que se mostrou inviável — `spawn.renewCreep()` não renova de verdade
um corpo com `CLAIM`, o motor do jogo ignora a chamada e devolve `OK` sem
efeito, confirmado na documentação/fórum oficial; a ideia foi descartada)
uma função pra limpar as ordens de claim. Hoje existe `cancelContest()`
(`src/rooms/raiding.js`, ROADMAP 0046) pra `Memory.contestTarget`, mas
`Memory.claimTarget` só é limpo de dentro do próprio `run()` do creep
(sucesso, dead-end, ou abandono por morte em trânsito — ROADMAP 0035/0046)
ou por um novo `claimRoom()` bem-sucedido. Não existe jeito manual de
desistir de um claim pendente que ainda não spawnou (ou cujo creep atual o
jogador prefere só deixar morrer sem reposição).

## Desired outcome

`cancelClaim()` no console apaga `Memory.claimTarget` na hora, com o mesmo
comportamento de `cancelContest()`: não recolhe/mata um claimer já em
trânsito (ele termina o próprio `run()` normalmente — chega e reivindica, ou
esbarra num dead-end e se suicida), só impede `rooms/needs.js` de spawnar
uma reposição caso esse creep morra ou nunca tenha existido ainda.

## In scope

- `src/rooms/remotes.js`: `global.cancelClaim()` — sem claim pendente, loga
  e não faz nada; com um pendente, loga qual sala foi cancelada e apaga
  `Memory.claimTarget`.
- `src/utils/console.js`: entrada na seção "Remote mining" do `help()`.

## Out of scope

- Qualquer forma de "recuperar TTL" do claimer em trânsito (bases
  intermediárias, renovação parcial, etc.) — inviável, `CLAIM` não é
  renovável pelo motor do jogo, não é uma limitação deste bot.
- Recolher/matar um claimer já spawnado e em viagem — mesma filosofia do
  `cancelContest()`, a ordem cancelada é só sobre respawn futuro.

## Acceptance criteria

1. Com `Memory.claimTarget` setado, `cancelClaim()` apaga —
   `test/smoke.js`: `"cancelClaim() clears a pending claim"`.
2. `cancelClaim()` loga a sala cancelada — `test/smoke.js`:
   `"cancelClaim() logs the cancellation"`.
3. `cancelClaim()` sem nada pendente não lança e não altera Memory —
   `test/smoke.js`: `"cancelClaim() with nothing pending is a no-op, not a
   throw"`.
4. `cancelClaim` aparece na listagem do `help()` — `test/smoke.js`'s
   `"help() lists the known console commands"`.

## Constitution check

- **Memory:** só apaga um campo já existente (`Memory.claimTarget`), nenhum
  estado novo.
- **Fail-soft:** sem claim pendente, só loga — nunca lança.
- **Offline test:** coberto por `test/smoke.js`, mesmo padrão de
  `cancelContest()`.

## Open questions

Nenhuma — espelha `cancelContest()` (ROADMAP 0046) 1:1, só trocando qual
campo de Memory é apagado.
