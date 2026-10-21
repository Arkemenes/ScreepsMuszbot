# 0160 — Tiers de prioridade por nível do CPU bucket

- **Status:** spec
- **Owner:** Claude / ARK-198
- **Created:** 2026-10-20

## Problem

Hoje o bot só reage ao bucket de forma pontual e espalhada:

- `src/main.js` `shedding()` pausa `marketFlip` e `swingTrade` abaixo de
  `cpu.shedBucket` (2000). Os demais subsistemas rodam com qualquer bucket.
- Gates locais e independentes: `market` (500), `planner.minBucket` (500),
  `profile.minBucket` (100) e o gate de pixel (`pixel.headroomGate`).
- Com o bucket cheio (10000), a CPU sobrando é perdida: o bucket não passa de
  10000 e nada aproveita a folga. Com o pixel desligado (ARK-197), toda tick
  com bucket cheio desperdiça até `Game.cpu.limit − uso`.

Não existe um lugar único que diga o que é essencial e o que é opcional, nem
um jeito de gastar mais quando sobra.

## Desired outcome

Cada chamada de subsistema em `main.js` pertence a um tier. Um único módulo
calcula, uma vez por tick, a faixa do bucket (`critical` / `low` / `normal` /
`full`) e quais tiers rodam nela. Com o bucket crítico, só o essencial roda
(defesa, spawn, creeps, torres); com o bucket cheio, os trabalhos de luxo rodam
e os subsistemas que aceitam orçamento ganham mais (cadências mais curtas,
orçamentos maiores). Os limiares e a tabela de tiers ficam em
`Memory.settings`, ajustáveis sem deploy, e o tier/faixa atual aparece em
`Memory.stats.cpu` e no Grafana.

## In scope

- Módulo `utils/cpuTier.js`: faixa do tick (`band()`), `runs(tier)` e
  `boost()` (multiplicador para quem aceita orçamento maior com bucket cheio).
- Tabela de tiers por label de `guard()` em `config` (`cpu.tiers`), com padrão
  proposto abaixo; `main.js` consulta `cpuTier.runs()` antes de cada guard
  opcional. Substitui `shedding()` sem mudar o comportamento atual dele no
  padrão (marketFlip/swingTrade continuam pausando abaixo de 2000).
- Faixas padrão (configuráveis em `cpu.bands`), com histerese para não
  oscilar na fronteira:
  - `critical` < 1000 → só T0
  - `low` < 3000 → T0–T1
  - `normal` → T0–T2
  - `full` ≥ 9000 → T0–T3 + `boost()`
- Tiers propostos (padrão):
  - **T0 essencial:** `defense`, `spawn`, `creep`, `traffic`, `structure`,
    `rampart`, `bootstrapStorage`, `intel` (hostis), `energyLedger`, `stats`
    (caminho leve), `memoryCleanup`, `planStore`.
  - **T1 economia:** `terminalOps`, `energyBalancing`, `boostLogistics`,
    `craftLedger`, `market` (scan), `plan` (construction sites).
  - **T2 otimização:** `craftPlanner`, `marketFlip`, `swingTrade`,
    `plan` (preview visual), `cpuReport`.
  - **T3 luxo:** `pixel` (quando religado), prévias de layout de salas não
    próprias, `raiding.autoRaid`, scans adiantados com `boost()`.
- Publicação: `Memory.stats.cpu.band` e `Memory.stats.cpu.skipped` (labels
  pulados no tick); painel no Grafana.
- Smoke cobrindo cada faixa, a histerese e o boost.

## Out of scope

- A nova lógica do pixel (decisão do usuário, depois desta spec); aqui o pixel
  só é classificado como T3.
- Pular creeps individualmente ou mudar o comportamento interno de roles
  (o laço de creeps é T0 inteiro).
- Remover qualquer gate local existente: `market` 500, `planner.minBucket`,
  `profile.minBucket` continuam valendo além do tier.
- Ajuste automático dos limiares por aprendizado.

## Acceptance criteria

1. O smoke afirma `0160: critical band runs only tier 0`: com bucket 500,
   `craftPlanner`, `terminalOps`, `marketFlip` e `swingTrade` não são chamados;
   `spawn`, `defense` e o laço de creeps são.
2. O smoke afirma `0160: default tiers keep the legacy shed behaviour`: com
   bucket 1500, `marketFlip`/`swingTrade` pausam e `terminalOps` roda (igual a
   `shedding()` hoje).
3. O smoke afirma `0160: band hysteresis`: o bucket oscilando ±50 em torno de um
   limiar não alterna a faixa a cada tick.
4. O smoke afirma `0160: full band enables tier 3 and boost`: com bucket ≥ 9000,
   `cpuTier.runs(3)` é verdadeiro e `cpuTier.boost() > 1`.
5. O smoke afirma `0160: tiers are configurable`: mover um label para outro tier
   em `Memory.settings.cpu.tiers` muda o resultado no tick seguinte.
6. `Memory.stats.cpu.band` e `Memory.stats.cpu.skipped` são publicados; o
   Grafana mostra a faixa ao longo do tempo.
7. Ao vivo, com o bucket acima de 3000, nenhum subsistema muda de
   comportamento em relação ao atual (equivalência no padrão).

## Constitution check

- CPU: uma conta por tick (faixa) e um lookup por guard; nada por creep.
- Memory: só a config (`Memory.settings.cpu`) e dois campos de stats; estado da
  histerese no heap.
- Fail-soft: label sem tier conhecido roda (T0 implícito), para nunca desligar
  algo por esquecimento; erro no módulo cai no comportamento atual.
- Config, não literais: faixas e tabela em `config`/`Memory.settings`.
- Testável offline: tudo coberto pelo smoke com `Game.cpu.bucket` simulado.

## Open questions

1. A tabela de tiers acima está certa? Em especial: `plan` (construction sites)
   em T1 ou T0? `intel` de salas não próprias pode cair para T2?
2. Com bucket cheio, o que deve ganhar `boost()`? Sugestões: `craft.scanInterval`
   e `terminalOps.tickInterval` divididos por 2, orçamento do `labPolicy.poll`
   maior, reavaliação dos haulers/builders ociosos mais frequente.
3. Os limiares 1000 / 3000 / 9000 servem, ou prefere outros?
4. O laço de creeps deve ter um modo degradado em `critical` (ex.: só roles
   econômicos e de defesa a cada tick, os demais a cada 2)? A spec atual deixa
   o laço inteiro em T0.
