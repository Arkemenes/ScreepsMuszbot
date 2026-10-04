# 0121 — Coleta de recursos em corredores (power, deposits)

- **Status:** spec
- **Owner:** Arkemenes
- **Created:** 2026-10-03
- **Relacionadas:** 0122 (power creeps — consome o power), 0123 (squads —
  reaproveita o quad/lockstep), 0051 (`powerSpawn`, factory), 0028/0058 (rota)

## Problem

Salas de corredor/highway (`x%10==0` ou `y%10==0`) têm **power banks** (power) e
**deposits** (silicon, metal, biomass, mist), e o bot não coleta nada disso:

- `utils/routing.js` só **evita** highway como rota (`isHighwayRoom`) e `intel`
  não registra deposit nem power bank; não há `FIND_DEPOSITS`/`FIND_STRUCTURES`
  de power bank usados em role algum.
- `structures/powerSpawn.js` processa power (0051), mas não existe fonte de
  power: o único caminho hoje é comprar no mercado.
- Os commodities de nível 1+ da factory (0051 deixou "fora de escopo") e a
  ladder de `commodities` dependem desses recursos.

## Desired outcome

Um ciclo **semi-automático por sala-alvo** (a salas observadas/escaneadas
dentro de um raio configurável da base-mãe):

1. `intel`/`observer` registra `powerBank {hits, power, ticksToDecay, pos}` e
   `deposits [{type, cooldown, lastCooldown, pos}]` por sala highway.
2. **Power bank:** um squad (ataque + cura, reaproveitando `utils/squad`)
   derruba o banco antes do decaimento, `remoteHauler`s trazem o power para o
   storage/powerSpawn da sala-mãe. Só dispara se o tempo de viagem + o tempo para
   quebrar o banco cabe no `ticksToDecay` e o power compensa o custo do squad.
3. **Deposit:** um miner de deposit (WORK/CARRY/MOVE) + haulers; o *cooldown*
   do deposit cresce com o total já coletado, então a viabilidade é por
   **recurso/tick líquido** (custo do creep × distância), com piso configurável.

## In scope

- Registro de `powerBank`/`deposits` em `Memory.rooms[x]` (intel).
- Avaliador de viabilidade (função pura, testável offline) com todos os
  parâmetros em `config.js` (`highway.*`).
- Console `harvestHighway(room, mother?)`/`cancelHighway()` manual primeiro
  (mesma filosofia de `raidRoom`/`contestRoom`), automação depois.
- Roles novos finos (`depositMiner`; squad de power bank via 0032 Fase 4).

## Out of scope

- Power creeps (0122) e processamento do power (já existe `powerSpawn`).
- Defesa contra jogadores que disputam o corredor (log + abortar por hostil,
  mesmo gate de `remotes.hasHostiles`).
- Portais e salas SK (centro).

## Acceptance criteria

1. Smoke: `intel` preenche `powerBank` e `deposits` a partir de stubs de
   `FIND_STRUCTURES`/`FIND_DEPOSITS`.
2. Smoke: o avaliador recusa power bank com `ticksToDecay` menor que viagem +
   tempo de quebra, e aceita o contrário (assert por razão de recusa).
3. Smoke: deposit com cooldown alto é recusado pela regra de rendimento líquido.
4. Smoke: squad de power bank usa o lockstep de `utils/squad` e some ao
   completar (`missionComplete`).
5. In-game: 1 power bank completo ou 1 deposit coletado, com o ledger de
   energia contabilizando o custo.

## Constitution check

- §1: nenhuma varredura nova por tick (intel/observer já varre; deposit usa
  `roomCache`). §2: só `id` em Memory. §6: tudo em `highway.*`. §3: guard por
  missão. §7 no-op: sem alvo viável, nada é spawnado.

## Open questions

- **Pesquisa antes do plano (tomar da doc oficial, não de memória):** fórmula
  do cooldown de deposit, tempo de vida, retorno de dano (power bank reflete
  parte do dano), tamanho de drop de power, `POWER_BANK_DECAY`.
- Raio máximo da base-mãe (em salas) e quais salas highway já passam por
  `scout`/`observer` hoje?
- Prioridade: power primeiro (alimenta 0122) ou deposits (alimenta factory)?
- Quantos RCL/energia a sala-mãe precisa ter para sustentar o squad?
