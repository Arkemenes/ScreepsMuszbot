# 0017 — Wait at the receiving link

- **Status:** done

## Problem

Creeps que sacam de um link não-coletor (hauler, builder, upgrader) — quando não
há energia disponível em lugar nenhum da sala — ficam parados perto do storage /
spawn / onde estão. Numa sala com link network, a energia chega pelo **link não
-coletor da base**, então esses creeps ficam longe do ponto de entrega e perdem
tempo indo até lá quando o link enche.

## Desired outcome

Quando a sala está seca (sem drop, tombstone, ruína, container/storage com
energia, e sem link não-coletor **com** energia), esses creeps caminham até o
alcance 1 de um link não-coletor e esperam ali. Assim que um link coletor
despacha energia, eles já estão em posição.

## In scope

- `utils/energy.js` → `receivingLink(room, pos, opts)`: o link não-coletor mais
  próximo de `pos`. `opts.awayFromController` pula o link do controller (para
  hauler/builder não roubarem a energia do upgrader) — mas se só houver o do
  controller, usa ele.
- `hauler`: `waitForEnergy(creep)` no modo `load` sem nada para pegar → link
  não-coletor (`awayFromController`), senão `idleNear` (storage/spawn).
- `builder`: sala seca (sem pilha, sem source próxima) → caminha até o link
  não-coletor (`awayFromController`).
- `upgrader`: sala seca → link não-coletor mais próximo (**sem**
  `awayFromController` — o dele é o do controller).

## Out of scope

- `bootstrap` — só existe quando não há link network (`roomNeeds` o zera com
  `links`), e ele minera; não espera.
- Escolher o link com mais energia / balancear filas entre links.
- Reservar tiles específicas ao redor do link.

## Acceptance criteria

1. `receivingLink(room, pos)` retorna o link não-coletor mais próximo de `pos`,
   ou `null` se não houver.
2. Um hauler vazio, sala seca, com um link não-coletor presente → `moveTo(link,
   { range: 1 })`. *(smoke: "an idle hungry hauler waits next to a receiving
   link")*
3. Sem link não-coletor → comportamento antigo (`idleNear` / não se move).
4. Smoke inteiro verde.

## Constitution check

- **§7:** o creep espera onde a energia vai chegar, em vez de fazer viagem
  extra.
- **§1:** `receivingLink` é um `find` + `_.filter` por chamada; só roda no ramo
  "sala seca" (raro).
- **§3:** `null` quando não há link → callers caem no fallback.
