# 0187 — Revezamento de looters por segmentos do trajeto

- **Status:** done (local); smoke13183 e bundle verdes, sem deploy
- **Linear:** — (criar issue no Backlog)
- **Created:** 2026-10-23
- **Review:** aprovado pelo usuário em 2026-10-23 (espera 50 ticks, mãe cheia espera, status com sala:x,y). Decisões de desenho tomadas pelo usuário em 2026-10-23:
  divisão por tiles do caminho, redivisão pelos vivos, destino fixo na
  sala-mãe, revezamento ligado por padrão com opção de desligar.

## Problem

Hoje cada looter de uma missão (`rooms/looting.js`, `roles/looter.js`) faz
a viagem inteira: vai até a sala alvo, enche, volta até a sala de entrega e
retorna. Com `loot.maxHaulers` (3) looters numa sala a 5–10 salas de
distância:

- os três percorrem o trajeto completo duas vezes por ciclo, então cada
  creep passa a maior parte da vida viajando vazio na volta;
- todos cruzam todas as salas, o que multiplica busca de rota/caminho e
  travessias (o custo de CPU da ARK-116 com looters vem disso);
- o tempo de vida perto do fim é desperdiçado: o looter volta cedo para
  não morrer carregado (`mustHeadHome`).

## Desired outcome

Os looters de uma missão formam uma **corrente**. O caminho real
(tile a tile) entre a sala alvo e o storage/container de entrega da
sala-mãe é dividido em N trechos de comprimento igual, sendo N o número de
looters vivos e já em campo da missão. Cada looter cuida de um trecho:

- o **primeiro** (trecho 0) coleta na sala alvo, como hoje, e leva a carga
  até o ponto de troca 1;
- cada looter **intermediário** espera vazio no início do seu trecho,
  recebe a carga do anterior (`creep.transfer` creep→creep) e leva até o
  ponto de troca seguinte;
- o **último** entrega no storage/container da sala-mãe;
- vazio, cada um volta só até o início do próprio trecho.

Quando um looter morre ou um substituto chega, os trechos são recalculados
pelos vivos e a corrente segue: o vizinho cobre o trecho a mais até a
redivisão seguinte. Com um looter só, ou com o revezamento desligado,
o comportamento atual (0184) continua igual.

Quem opera vê, em `lootStatus()`, o número de trechos, o comprimento do
caminho e qual looter cobre qual trecho.

## In scope

- Caminho da missão: um `PathFinder.search` da sala alvo até o destino de
  entrega da mãe, com as mesmas restrições de sala do roteamento
  (`transitSafety`, dead ends, salas de dono hostil), guardado no **heap**
  por missão e recalculado quando o heap é resetado, quando o destino muda
  ou a cada `loot.relayRepathTicks`.
- Destino fixo: storage da mãe; container da mãe como fallback. Se a mãe
  não tiver espaço para a carga, o último looter espera cheio (sem trocar de
  sala); a regra "sala própria mais próxima" da 0184 vale só quando o
  revezamento está desligado ou N = 1.
- Divisão em N trechos por índice de tile; pontos de troca são tiles
  andáveis do caminho, nunca na borda da sala (x/y 0 ou 49), deslocados
  para o tile andável mais próximo dentro do caminho quando preciso.
- Atribuição de trechos pela posição de cada looter ao longo do caminho (o
  mais perto do alvo pega o trecho 0), refeita só quando o conjunto de
  looters vivos muda.
- Movimento ao longo do caminho com `moveByPath` sobre o trecho (ida ou
  volta), com `moveTo` até o caminho quando o creep estiver fora dele.
- Troca: quem chega cheio para adjacente ao ponto de troca e transfere,
  um recurso por tick, ao looter seguinte parado no ponto. Sem receptor,
  espera.
- Opção de desligar: `lootRoom(alvo, mãe, { relay: false })` grava
  `relay: false` na missão; `loot.relay` (default `true`) desliga
  globalmente. Missões existentes usam o padrão global.
- `lootStatus()` mostra trechos/caminho/atribuição.

## Out of scope

- Mudar quantos looters uma missão spawna (`loot.maxHaulers`) ou o corpo.
- Containers ou drops intermediários como buffer (a troca é sempre
  creep→creep).
- Entregar em outra sala própria quando a mãe estiver cheia, com o
  revezamento ligado.
- Corrente compartilhada entre missões diferentes.
- Revezamento para outros roles (remoteHauler, pioneer).

## Acceptance criteria

1. Com 3 looters em campo e caminho de 150 tiles, os pontos de troca ficam
   nos índices ~50 e ~100 e cada looter recebe um trecho distinto; o smoke
   asserts `"0187: three looters split a 150-tile path into three equal segments"`.
2. O looter mais perto do alvo recebe o trecho 0 e o mais perto da mãe o
   último; `"0187: segments are assigned by position along the path"`.
3. Um looter intermediário cheio adjacente ao ponto de troca transfere ao
   seguinte e não anda até a mãe; `"0187: a full middle looter hands its cargo to the next link"`.
4. O último looter entrega no storage da mãe; com storage cheio usa um
   container da mãe; sem espaço algum espera cheio sem mudar de sala;
   `"0187: the last link delivers to the mother storage, then container, else waits"`.
5. Vazio, cada looter volta só até o início do próprio trecho;
   `"0187: an empty link returns only to its own segment start"`.
6. Quando um looter some do census, os trechos são recalculados com N−1 no
   mesmo tick; quando chega um substituto, com N+1;
   `"0187: a dead link redivides the path among the survivors"`.
7. Nenhum ponto de troca fica em tile de borda;
   `"0187: handoff points are never on a room edge"`.
8. Com N = 1, `relay: false` na missão ou `loot.relay=false`, o looter faz a
   viagem completa da 0184 (todas as asserções 0184 continuam verdes);
   `"0187: relay off or a single looter keeps the 0184 round trip"`.
9. O caminho é calculado uma vez e reutilizado: 20 ticks com os mesmos
   looters chamam `PathFinder.search` uma vez;
   `"0187: the mission path is searched once and reused from the heap"`.
10. `Memory.lootTargets[id]` não ganha posições nem caminho; só `relay`
    opcional; `"0187: no path or game object is stored in Memory"`.
11. Cancelamento por dano, `cancelLoot` e reciclagem no fim da missão
    funcionam igual com a corrente.

## Constitution check

- **CPU:** um `PathFinder.search` por missão por `loot.relayRepathTicks`
  (default 1500), nunca por tick; por tick, cada looter faz uma consulta
  O(1) de índice no caminho (mapa `sala:x:y → índice` no heap) e um
  `moveByPath`. Nenhuma travessia passa por `routing.findRoute` enquanto o
  looter está no próprio trecho, o que reduz o custo medido em ARK-116.
- **Census/roomCache:** looters da missão vêm de `census.all("looter")`
  (já usado por `looting.looters`); estruturas via `roomCache`.
- **Memory:** caminho, mapa de índices e atribuição só no heap; `Memory`
  guarda no máximo `relay` na missão e o índice do trecho no creep.
- **Fail-soft:** sem caminho (`incomplete`), sem visão do destino ou heap
  vazio → volta ao comportamento 0184 naquele tick.
- **Stall guard:** espera no ponto de troca tem teto (`loot.relayWaitTicks`);
  vencido, o looter redivide/segue como 0184 em vez de ficar parado.
- **Config:** `loot.relay`, `loot.relayRepathTicks`, `loot.relayWaitTicks`,
  `loot.relayMaxOps` em `utils/config.js`.
- **Testável offline:** stubs de `PathFinder.search`/`moveByPath` no smoke.

## Open questions

- Nenhuma bloqueante. A confirmar na revisão: teto de espera no ponto de
  troca (`loot.relayWaitTicks`, proposta 50 ticks) e se `lootStatus()` deve
  imprimir os pontos de troca (sala:x,y) ou só os índices.
