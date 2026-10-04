# 0122 — Power creeps para produção de itens avançados

- **Status:** spec
- **Owner:** Arkemenes
- **Created:** 2026-10-03
- **Relacionadas:** 0121 (fonte de power), 0051 (factory nível 0, `powerSpawn`),
  0111 (craft flip — consome produção avançada), 0115/0116 (labs)

## Problem

A factory só produz **nível 0** (0051): `setFactoryProduct` recusa nível 1+ com
o motivo "precisa de Power Creep/GPL, fora de escopo". Não existe nenhum código
para power creeps (`PowerCreep`, `PWR_*` aparecem só como menção em
`craftPlanner.js`). Sem isso, as cadeias de commodities (alto valor no mercado,
alvo do `craftFlip`/`craftPlanner`) ficam capadas, e as habilidades de operação
(`PWR_OPERATE_FACTORY`, `PWR_OPERATE_LAB`, `PWR_OPERATE_TERMINAL`,
`PWR_GENERATE_OPS`, `PWR_REGEN_SOURCE`…) nunca são usadas.

Pré-requisitos que o jogo impõe (verificar na doc): **GPL** (Global Power
Level) obtido processando power; criar o power creep (`PowerCreep.create`),
**spawnar** em um `powerSpawn`, **renovar** a cada ~5000 ticks perto de
power spawn/power bank, e gerar `ops` para pagar as habilidades.

## Desired outcome

Um power creep operador, por sala-alvo (a sala da factory), que:

1. nasce no `powerSpawn` e é renovado antes de morrer;
2. gera `ops` quando ocioso e usa `PWR_OPERATE_FACTORY` para liberar a produção
   de **nível 1+** que a factory já sabe pedir (estoque/`commodities`);
3. opcionalmente `PWR_OPERATE_LAB`/`PWR_OPERATE_TERMINAL`/`PWR_REGEN_SOURCE`
   quando o ganho compensa;
4. tem upgrade automático conforme o GPL sobe.

## In scope

- Módulo `roles/powerCreep.js` (não é `Game.creeps`: `Game.powerCreeps`) com
  ciclo spawn → trabalho → renew, fail-soft.
- Console `createPowerCreep(name, class)`, `setPowerCreepRoom(...)`,
  `powerCreepStatus()`.
- Liberar o nível 1+ em `structures/factory.js`/`setFactoryProduct` quando
  existir power creep apto (hoje recusa).
- Política de ops: manter reserva (config) e priorizar `OPERATE_FACTORY`.

## Out of scope

- Fonte de power (0121) e processamento (já existe).
- Combate de power creep, `PWR_DISRUPT_*`, `PWR_SHIELD`.

## Acceptance criteria

1. Smoke: stub de `Game.powerCreeps`/`PowerCreep`, `run()` spawna quando o
   creep está em `unspawned` e há `powerSpawn` livre.
2. Smoke: renew acontece quando `ticksToLive` < limiar (config), nunca em
   cooldown.
3. Smoke: `PWR_OPERATE_FACTORY` é usado só com ops ≥ custo e factory sem o
   efeito ativo.
4. Smoke: `setFactoryProduct` aceita nível 1+ só com power creep apto, e
   continua recusando com o motivo explícito sem ele.
5. In-game: 1 commodity de nível 1 produzida e vendida/estocada.

## Constitution check

- §2: `Memory` só com nomes/ids de power creep (nunca o objeto). §1: 1 iteração
  sobre `Game.powerCreeps` (poucos), sem `find`. §3 guard. §6 limiares em
  `config`. §7: sem power spawn ou GPL 0, é no-op.

## Open questions

- **GPL atual da conta (`Game.gpl`)?** Decide se é viável agora ou depende da 0121.
- Quantos power creeps e qual classe (operator é a única hoje)? Uma sala só
  (factory) ou várias?
- Habilidades e ordem de upgrade (OPERATE_FACTORY primeiro?).
- Pesquisa na doc: custos de `ops`, `ticksToLive`, requisitos de nível por
  habilidade, regras de factory com `PWR_OPERATE_FACTORY`.
