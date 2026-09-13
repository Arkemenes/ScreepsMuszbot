# 0040 — Generic incremental autoscale (grow/shrink by 1, room cooldown)

- **Status:** done
- **Depends on:** 0015, 0038, 0039
- **Supersedes:** 0039's jump-to-`surplusCount` behaviour

## Problem

0039 reagia ao excesso de energia parada pulando direto pra um alvo fixo
(`upgrader.surplusCount`, 4). Rápido demais e sem chão: não dá pra
generalizar "pula pra 4" pra outros roles, cada um teria seu próprio alvo
mágico, e um valor fixo não reage à intensidade real do excedente.

O pedido: em vez de pular, subir **de 1 em 1**, com um **cooldown por
sala** (30000 ticks) enquanto os critérios de crescimento continuarem
valendo — e, futuramente, o mesmo mecanismo (subir/descer de 1) vai valer
pra **qualquer** role, cada um com seu próprio critério de quando crescer
e quando encolher. Como o cooldown é por sala (não por role), quando ele
abre e mais de um role está elegível pra mudar, a sala precisa escolher
**qual** — o que mais precisa de +1, ou o que menos precisa do que já tem
pra -1.

## Desired outcome

Um módulo genérico (`utils/autoscale.js`) onde qualquer role se registra
com um par opcional `grow(room, wanted, delta)` / `shrink(room, wanted,
delta)`, cada um devolvendo uma pontuação de pressão (0 = não elegível,
`> 0` = elegível, maior = mais urgente). Um cooldown único por sala
(`Memory.rooms[name].autoscale.lastAdjustTick`, `autoscale.cooldown` em
`config.js`, default 30000) throttla **qualquer** ajuste de **qualquer**
role registrado naquela sala. Quando o cooldown abre, o módulo escolhe o
`grow` de maior pontuação entre todos os roles elegíveis (crescer tem
prioridade sobre encolher — reagir ao desperdício é mais urgente); se
nenhum quiser crescer, escolhe o `shrink` de maior pontuação entre os que
têm delta positivo pra devolver. Aplica ±1 nesse role só, e reinicia o
cooldown da sala. `rooms/needs.js`'s `upgrader` é o primeiro (e por ora
único) consumidor, reaproveitando o critério de elegibilidade de 0039
(sem canteiro, spawn/ext cheios, containers/storage cheios).

## In scope

- `src/utils/autoscale.js`: `register(role, {grow?, shrink?})`,
  `apply(room, wanted)` — muta `wanted` in-place com o delta acumulado da
  sala e, se o cooldown da sala abriu, decide e aplica o próximo passo de
  ±1. Nunca lança: uma predicate que lançar é pulada pro role dela naquele
  tick, não aborta o resto (constitution §3).
- `Memory.rooms[name].autoscale = { delta: {role: n}, lastAdjustTick }`.
  `delta` nunca é aplicado abaixo de 0 no total (`Math.max(0, tier +
  delta)`).
- `config.js`: `autoscale.cooldown` (30000, por sala, compartilhado entre
  roles) e `upgrader.autoscaleMaxCount` (8 — teto de segurança pro total
  computado, já que o crescimento por si só tende a se autolimitar quando
  os upgraders extras começam a consumir o excedente que os gerou, mas um
  teto evita um caso patológico).
- `rooms/needs.js`: `upgraderSurplusEligible(room)` extrai o critério de
  0039 pra uma função só, usada tanto por `grow` (elegível → cresce, até o
  teto) quanto por `shrink` (**não** elegível e delta > 0 → devolve 1).
  Registrado uma vez no load do módulo.
- `upgrader.surplusCount` (0039) é removido do `config.js` — não faz mais
  sentido sem o pulo direto.

## Out of scope

- Registrar outros roles no autoscale agora — é o próximo passo natural
  (builder, hauler, etc., cada um com seu próprio critério), mas cada um
  merece validar se faz sentido antes (builder já escala com backlog/
  energia sozinho, por exemplo — pode não precisar).
- Cooldown configurável por role (é por sala, de propósito — ver
  Problema).
- Persistir/expor histórico de ajustes (quando/quanto mudou) — só o estado
  atual (`delta`, `lastAdjustTick`) é guardado.

## Acceptance criteria

1. Sala elegível pra crescer, cooldown ainda não aberto (`Game.time -
   lastAdjustTick < 30000`) → contagem fica no tier normal, sem pulo nem
   passo. *(smoke asserta)*
2. Cooldown aberto e elegível → sobe exatamente 1 (não pula pro teto).
   *(smoke asserta)*
3. Cooldown ainda fechado logo em seguida → não sobe de novo. *(smoke
   asserta)*
4. Cooldown aberto de novo, ainda elegível → mais um passo de +1. *(smoke
   asserta)*
5. Delta não ultrapassa `upgrader.autoscaleMaxCount` mesmo com o cooldown
   aberto e a sala elegível. *(smoke asserta)*
6. Sala deixa de ser elegível (canteiro reaparece) com delta > 0 → cooldown
   seguinte devolve 1 (delta -1), repetindo enquanto delta > 0. *(smoke
   asserta, duas janelas)*
7. Delta chega a 0 → nem cresce nem encolhe mais (sem delta negativo);
   contagem volta ao tier puro da fórmula. *(smoke asserta)*
8. `setWanted`/`clearWanted` (0038) continuam funcionando por cima do
   valor já autoescalado.
9. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§1:** nenhuma varredura nova — `apply()` só lê `Memory.rooms[name]` e
  chama os predicates já registrados, que por sua vez reaproveitam
  `roomCache`/`sourceContainers` já cacheados.
- **§2:** `Memory.rooms[name].autoscale` é pequeno (`delta` só tem
  entradas pra roles que já se afastaram do tier padrão, `lastAdjustTick`
  um número).
- **§3:** `apply()` nunca lança — cada `grow`/`shrink` roda em `try/catch`
  próprio; um role malformado (sem `grow`/`shrink`) simplesmente não entra
  na disputa daquele lado.
- **§5:** a lógica de "quando" fica em `utils/autoscale.js` (cross-cutting,
  qualquer role pode usar); a lógica de "o que conta como elegível pra
  upgrader" fica em `rooms/needs.js`, onde já mora toda estratégia de
  população.
- **§6:** cooldown e teto são `config.get`, não literais.
- **§7:** o próprio mecanismo é uma forma de "spawnar o mínimo viável" ao
  longo do tempo — sobe só 1 de cada vez, e só enquanto o critério
  continuar valendo.

## Outcome

Entregue. `src/utils/autoscale.js` (novo) — `register(role, {grow,
shrink})` + `apply(room, wanted)`, delta por role persistido em
`Memory.rooms[name].autoscale`, cooldown único por sala
(`config.get("autoscale.cooldown", 30000)`), crescer com prioridade sobre
encolher quando os dois têm candidato na mesma janela. `rooms/needs.js`
extraiu `upgraderSurplusEligible(room)` (mesmo critério de 0039) e
registrou `upgrader` no autoscale (`grow` até `upgrader.autoscaleMaxCount`
= 8, `shrink` quando deixa de ser elegível e ainda há delta pra devolver).
`config.js` ganhou `autoscale.cooldown` e `upgrader.autoscaleMaxCount`;
`upgrader.surplusCount` (0039) foi removido, sem uso. Validado pelo smoke:
9 assertions novas cobrindo cooldown fechado/aberto, passo único (não
pulo), teto, encolhimento gradual, e piso em 0 sem delta negativo — a
suíte antiga de 0039 (que esperava o pulo direto pra 4) foi substituída por
essas. `node --check` limpo, `npx grunt` builda (62 arquivos), smoke
inteiro verde.
