# 0068 — Reforço de rampart/wall acima de 1% fica só com o builder

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Seguindo a análise do ROADMAP 0067 (estruturas destruídas por falta de
reparo), o usuário levantou um ponto à parte sobre o próprio mecanismo de
`utils/rampartRepair.js`: como `RAMPART_HITS_MAX` (300k) e `WALL_HITS_MAX`
(300M) são constantes do motor — não escalam com RCL, mas diferem entre si
por 1000x — usar a MESMA fração de `hitsMax` como "vale reparar" pros dois
tipos faz sentido pra classificar o dano relativo, mas o passo seguinte
(`worthHardening`, "acima da faixa saudável só continua enquanto
`resourceTiers.aboveReserve(room)`") não tinha teto: uma torre, que dispara
o próprio `repair()` **todo tick** sem custo de população (diferente de um
builder, limitado pela contagem de creeps da sala), podia legitimamente
continuar reforçando um único wall por toda a vida útil da sala, rumo a um
`hitsMax` de 300 milhões, sempre que o storage tivesse qualquer reserva —
sem nenhum teto natural nesse gasto. Citação do usuário: "se isso acontecer,
sempre vai focar em reparar eles... precisa de um tratamento diferente para
walls e ramparts, se não vai só sugar toda energia da sala".

Segunda mensagem do usuário refinou o pedido: manter a fração de 1% como
**alvo** pros dois tipos (não trocar por número absoluto) — a rampa
0.1%/1% já é a "faixa saudável" desejada. O que precisa mudar é **quem**
tem permissão de continuar além disso: só `roles/builder.js`, nunca
`structures/tower.js`. Confirmado também que, pra qualquer OUTRA estrutura
(não rampart/wall), 1% seria um limiar baixo demais pra reparo — sem
mudança ali, o builder/tower já reparam qualquer estrutura normal com
qualquer dano (`hits < hitsMax`), sem piso percentual.

## Desired outcome

`utils/rampartRepair.js` passa a expor dois predicados em vez de um:

- `worthHardening(structure, room)` (como antes) — saudável (< 1%) sempre
  vale; acima disso, só enquanto `resourceTiers.aboveReserve(room)`. Usado
  só por `roles/builder.js`.
- `worthHardeningByTower(structure)` (novo) — só a faixa saudável (< 1%),
  nunca olha a reserva, nunca passa de 1%. Usado só por
  `structures/tower.js`.

`roles/builder.js` ganha cobertura de `STRUCTURE_WALL` nos três pontos que
hoje só tratavam `STRUCTURE_RAMPART` (oportunista, repair principal,
fallback de último recurso) — sem isso, "passar de 1% é trabalho do
builder" não fazia sentido pra wall, que o builder nunca tocava.

## In scope

- `src/utils/rampartRepair.js`: `worthHardeningByTower` novo; comentários
  corrigidos (hitsMax não escala com RCL — são constantes fixas que
  diferem por 1000x entre si, não uma tabela por RCL).
- `src/structures/tower.js`: `findRepairTarget`'s `eligible` usa
  `worthHardeningByTower` em vez de `worthHardening`.
- `src/roles/builder.js`: `opportunisticWork`, o filtro principal de
  `repairTargets`, e o fallback de último recurso (renomeado
  `damagedDefensive`) passam a incluir `STRUCTURE_WALL` ao lado de
  `STRUCTURE_RAMPART`, mesmo tratamento crítico/saudável dos dois.
- `test/smoke.js`: fixtures de torre (D4) atualizadas — past-healthy-tier
  nunca mais é reparado pela torre, mesmo com reserva de storage; nova
  cobertura provando que o builder agora também endurece wall (antes só
  rampart).
- `specs/ARCHITECTURE.md`: descrições de `tower`/`builder`/
  `rampartRepair.js` atualizadas pro novo split e pra remover a afirmação
  incorreta de que `hitsMax` escala com RCL.

## Out of scope

- Mudar os próprios valores de `rampartCriticalRatio`/`rampartHealthyRatio`
  (0.1%/1% seguem sendo o alvo, confirmado pelo usuário).
- Qualquer limiar percentual pra estruturas normais (containers, roads,
  etc.) — usuário confirmou que 1% seria baixo demais ali; comportamento
  inalterado (`hits < hitsMax`, sem piso).
- Uma ferramenta de diagnóstico ao vivo (`repairAudit`) — segue apenas
  sugerida, não implementada.

## Acceptance criteria

1. Uma torre com um rampart/wall past-healthy-tier (>= 1%) nunca o repara,
   mesmo com `room.storage` bem acima da reserva de 1%. *(smoke)*
2. O mesmo rampart/wall, past-healthy-tier, É reparado por um builder
   quando `room.storage` está acima da reserva, e não é reparado quando
   está abaixo. *(smoke, cobertura já existente pro rampart + nova pro
   wall)*
3. Um wall crítico (< 0.1%) compete pela atenção do builder do mesmo jeito
   que um rampart crítico já competia (oportunista e repair principal).
   *(comportamento герal já coberto pelas assertions de `isCritical`
   existentes, aplicado agora também a wall via o mesmo código-caminho)*
4. `node test/smoke.js "$(pwd)"` verde.
5. `npx grunt` builda sem erro.

## Constitution check

- Nenhuma varredura nova de `Game.creeps`/`room.find` — reaproveita
  `roomCache.structures` já usado nos três lugares tocados.
- Nenhum objeto de jogo em Memory — inalterado.
- Fail-soft preservado — `worthHardeningByTower` e `worthHardening` nunca
  lançam sem `hits`/`hitsMax`, mesmo padrão de antes.
- Testável offline — coberto pelo smoke existente + fixtures novas, sem
  depender do motor.

## Open questions

Nenhuma — usuário confirmou o alvo de 1% e a divisão de responsabilidade
(builder vs. torre) explicitamente antes da implementação.

## Outcome

Entregue. `utils/rampartRepair.js` agora expõe `worthHardening` (builder,
reserve-gated acima de 1%) e `worthHardeningByTower` (torre, nunca passa de
1%). `roles/builder.js` cobre `STRUCTURE_WALL` nos três pontos que antes só
tratavam rampart. `specs/ARCHITECTURE.md` corrigido (hitsMax não escala com
RCL). `node test/smoke.js` verde (741 assertions, `EXIT_CODE:0`), `npx
grunt` gerou `dist/main.js` sem erro.
