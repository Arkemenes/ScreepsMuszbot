# 0036 — Automatic safe mode (D6) + remote harassment (O3)

- **Status:** done
- **Owner:** -
- **Created:** 2026-09-11
- **Reviewed:** 2026-09-11 (decisões herdadas de 0032, sem pergunta nova)
- **Depends on:** 0032 (combat overhaul — D6/O3 já pesquisados e decididos
  lá; este spec só formaliza a implementação de duas abordagens que ficaram
  represadas na revisão original)

Este spec cobre os dois itens do cardápio de `0032` que continuavam de fora
depois das 4 fases: **D6** (safe mode automático) e **O3** (assédio de
remote inimigo). As decisões de design de ambos já foram tomadas na revisão
de `0032` (ver `specs/features/0032-combat-overhaul/spec.md`, seções D6 e
O3) — este documento não reabre essas perguntas, só leva pra plan/tasks.

## Problem

- **D6:** hoje não existe nenhuma resposta automática a "spawn prestes a
  cair". Um raid que consegue furar a defesa (torre + `defenderStriker`/
  `defenderMedic`) até o spawn destrói a base sem que o bot reaja — o único
  recurso do jogo pra isso (`room.controller.activateSafeMode()`) nunca é
  chamado por código nenhum.
- **O3:** o bot hoje só reage (defesa) ou limpa PvE/sala fraca já dona de
  outro jogador (O2/O4). Não existe forma de negar economicamente um
  jogador em `targetEnemies` que esteja minerando um **remote** (sala sem
  dono, só reservada) perto de nós — mesmo quando isso seria barato e de
  baixo risco.

## Desired outcome

- **D6:** quando o spawn de uma sala própria está em risco real (hostil a
  alcance de ataque **e** hp do spawn abaixo de um limiar **ou** zero
  defenders vivos), o safe mode é ativado automaticamente, sem esperar
  intervenção manual — sem disparar por qualquer raid pequeno que a defesa
  normal já resolve sozinha.
- **O3:** console `raidRemote(roomName, motherRoomName?)` despacha um
  `raider` (reaproveitado, não um role novo) pra matar o(s) creep(s) de
  economia (reserver/miner/hauler) de um `targetEnemy` numa sala reservada
  por ele mas não dona dele — sem entrar em base nenhuma (a sala-alvo por
  definição não tem dono), sem tocar estrutura, e sem ficar acampado
  esperando um respawn (baixo compromisso — mesma filosofia de O4).

## In scope

- Gatilho de safe mode conservador (D6), com `config.get()` pro limiar de
  hp e sem novo módulo de coordenação — só lê `Memory.rooms`/census/
  `combat.threats` já existentes.
- `raidRemote()` console command + `refusalReason` própria pra sala-remote
  (O3), reaproveitando `roles/raider.js` com um `memory.mission="harass"`
  novo em vez de criar um role dedicado.
- Correção de um gap real encontrado ao desenhar O3: `utils/hostiles.js`'s
  `isHostile()`, fora de sala própria, só reconhece `hostilePlayers()`/
  `systemHostiles` como hostil — um jogador só em `targetEnemies` **não**
  aparece em `getHostiles()`/`mem.enemies`/`combat.threats()` numa sala que
  não é nossa. Isso já afetava silenciosamente O4 (uma "sala fraca" de um
  `targetEnemy` podia ter um defender lá sem `mem.enemies` acusar) e
  afetaria O3 do mesmo jeito. Corrigido adicionando `isTargetEnemy(username)`
  como mais um critério de hostilidade fora de sala própria — não muda a
  política de **quando atacar** (isso continua só via `raiding.js`'s gates),
  só corrige a **detecção**.

## Out of scope

- Retaliação automática e "montar força pra criar vantagem" — ficam pro
  próximo spec, conforme pedido pelo usuário.
- D5 (boosts/lab) e D7 (nuke) — continuam represados, sem mudança aqui.
- Qualquer combate real dentro de O3: se a sala-remote na verdade tem um
  hostil de verdade (guarda armado), o gate de dispatch (`mem.enemies`,
  agora corrigido) recusa; o `raider` que já estiver lá some/kita como já
  faz hoje contra qualquer `combat.threats()`, sem lógica nova de retirada
  coordenada (isso é o trabalho do squad, O5, não de um raider solo).

## Acceptance criteria

1. `checkSafeMode(room)` (novo, `rooms/defense.js`) chama
   `activateSafeMode()` só quando: sala própria, sem safe mode já ativo,
   existe uma ameaça armada (`combat.threats`) a alcance de ataque de
   algum spawn (`RANGED_ATTACK`→3, senão 1) **e** (hp do spawn mais baixo
   abaixo de `config.get("combat.safeModeSpawnHpRatio", 0.5)` **ou** zero
   `defender`+`defenderStriker` vivos na sala). Smoke assertion cobre os
   dois lados do "E"/"OU" (não dispara só com hostil perto e spawn
   saudável+defensores vivos; dispara com spawn ferido; dispara com spawn
   saudável mas zero defenders).
2. `checkSafeMode` nunca lança nem quando `activateSafeMode` devolve um
   erro (cooldown, sem carga) — só loga.
3. `raiding.isEnemyRemote(roomName)` — `true` só pra sala escaneada, sem
   dono, reservada por um `targetEnemy`, sem hostil visto (`mem.enemies`).
4. Console `raidRemote(roomName, motherRoomName?)` recusa (sem spawnar
   nada) quando a sala não é uma remote-alvo válida (motivo logado, mesmo
   padrão de `raidRoom`/`raidSquad`), e senão seta `Memory.raidTarget` com
   `mission:"harass"`.
5. `raider` em `memory.mission==="harass"`: luta hostil armado normalmente
   (herda o comportamento existente); sem hostil armado, ataca o primeiro
   `FIND_HOSTILE_CREEPS` (não filtra por armamento — reserver/miner são
   desarmados de propósito); sem nenhum hostil no room agora, `suicide()`
   + limpa `Memory.raidTarget` (missão cumprida ou nada a fazer agora, não
   é erro) — **nunca** ataca `FIND_HOSTILE_STRUCTURES` em modo harass.
6. `utils/hostiles.isHostile()` fora de sala própria também trata
   `isTargetEnemy(username)` como hostil (além do `hostilePlayers()`/
   `systemHostiles` já existentes) — smoke assertion cobre um creep de um
   `targetEnemy` (não em `hostilePlayers`) contando como hostil fora de
   sala própria.

## Constitution check

- **§1 (CPU):** `checkSafeMode` roda 1x/tick por sala própria (loop já
  existe em `main.js`), reaproveita `combat.threats`/`roomCache` — sem
  `room.find` novo. `raidRemote`'s `FIND_HOSTILE_CREEPS` roda só no(s)
  raider(s) em missão harass (poucos, opt-in) — mesmo padrão já aceito em
  `raider.js` pra `FIND_HOSTILE_STRUCTURES`.
- **§3 (fail-soft):** `activateSafeMode()` pode devolver erro (cooldown,
  sem carga) — nunca lança, só loga e segue.
- **§4 (testável offline):** tudo aqui é determinístico (hp ratio, contagem
  de census, lista de Memory.rooms) — testa bem no smoke.
- **§6 (config sobre hardcode):** `combat.safeModeSpawnHpRatio` via
  `config.get`, mesmo padrão dos outros limiares de combate.

## Open questions

Nenhuma — D6/O3 já foram decididos na revisão de `0032`; este spec só
formaliza a implementação represada.
