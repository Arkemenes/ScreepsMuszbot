# 0178 — Coesão do squad: reagrupar, formação, cura, sem membro repetido

- **Status:** done
- **Owner:** a definir
- **Created:** 2026-10-22
- **Linear:** [ARK-226](https://linear.app/arkemenes/issue/ARK-226/0178-squad-reagrupar-antes-de-entrar-esperar-formacao-priorizar-cura-e)

## Problem

Revisão do `raidSquad` (2026-10-22):

1. Os membros viajavam sozinhos pelas salas seguras, sem ponto de encontro, e na sala perigosa o líder andava todo tick mesmo fora de formação (`formed()` existia mas não era usado). Com todos na mesma velocidade, quem ficava para trás não alcançava: o striker chegava à torre antes dos medics.
2. O medic se curava primeiro e depois curava o aliado ferido mais próximo, sem priorizar o membro mais ferido e sem pré-cura.
3. `spawnPendingSquad` escolhia o próximo membro pela quantidade registrada. O registro acontece no `run` do creep, que o `main.js` chama depois do spawning do mesmo tick, então uma mãe com 2+ spawns podia gerar o mesmo membro duas vezes.

## Desired outcome

O squad chega junto, avança junto, os medics curam quem mais precisa e a mãe spawna exatamente a receita.

## In scope

- Sala de encontro: a última sala antes do alvo na rota da mãe (ou a própria mãe, se vizinha). Todos esperam lá até estarem juntos; timeout `squad.stageTimeoutTicks` (300).
- Formação: o líder só avança com a formação completa; na borda segue (precisa entrar); após `squad.formTimeoutTicks` (5) de espera dá um passo.
- Cura: o membro com mais vida perdida primeiro (incluindo o próprio medic); sem ninguém ferido e com ameaça (creep armado ou torre ativa com energia), pré-cura o líder; senão cura qualquer aliado ferido por perto.
- `spawnPendingSquad` conta os membros vivos (`census`, `memory.pendingSquad`).
- `combat.hostileTowerThreat` compartilhado com o saque (0177).

## Out of scope

- Siege que não alcança estruturas (ARK-227).
- Recuo pela vida média (ARK-228).

## Acceptance criteria

1. "0178: with a member off its slot the leader waits, taking only one step per squad.formTimeoutTicks"
2. "0178: members head for the staging room (last before the target) and the first one there waits instead of entering"
3. "0178: once every member is in the staging room, a shared crossing owns entry to the target" (travessia compartilhada detalhada na 0179).
4. "0178: the medic heals the squad member that lost the most hits first, not itself"
5. "0178: with nobody hurt but an active tower able to fire, the medic pre-heals the leader"
6. "0178: nobody hurt and no threat - no heal spent"
7. "0178: spawnPendingSquad() counts members that already exist but haven't registered yet - no duplicate from a second idle spawn"

## Constitution check

- **CPU:** a rota da sala de encontro é calculada uma vez por squad (`squad.staging`); a checagem de formação usa posições já carregadas.
- **Memory:** `staging`, `staged`, `stageSince`, `formWait`, `go` no squad, todos primitivos.
- **Fail-soft:** os dois timeouts impedem que um membro preso trave o squad.
- **Offline test:** sete asserções; os testes antigos de squad seguem verdes.
