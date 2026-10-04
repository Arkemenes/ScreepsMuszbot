# 0123 — Ofensiva: squads contra bases inimigas

- **Status:** spec
- **Owner:** Arkemenes
- **Created:** 2026-10-03
- **Relacionadas:** 0120 (defesa — mesmo `utils/combat`), 0121 (power bank usa o
  squad), 0032 Fase 4 (`raidSquad`), 0046 (`contestRoom`), 0047

## Problem

Já existe `raidSquad(room, "combat"|"siege")` (0032 Fase 4, `utils/squad.js`,
quad 2×2 em lockstep, `squadDismantler`+`defenderMedic`) e `contestRoom`
(0046), mas tudo é **manual e pontual**: o usuário escolhe sala e missão, e o
resultado (derrubar uma base com torres, ramparts e creeps de defesa) depende
de sorte. Falta:

- **Inteligência de alvo:** avaliar uma base inimiga (RCL, torres, energia das
  torres, ramparts, defensores, safe mode) a partir do `intel`/observer e
  decidir se um squad de tamanho X vence, em vez de despachar às cegas.
- **Dimensionamento:** corpo/boost e nº de squads vs. dano de torre
  (falloff 600→150 por alcance) e cura disponível.
- **Ciclo completo:** escolher alvo → montar → cruzar → quebrar defesa → matar
  spawn/controller → voltar/reforçar. Hoje `missionComplete` só cobre
  "sobrou nada".
- **Segurança de política:** só `targetEnemies` (opt-in), nunca aliado, nunca
  zona de novato/respawn (já validado em `rooms/raiding.js`).

## Desired outcome

Um **avaliador de alvo** (função pura, testável) que dá `go/no-go` + a
composição necessária, e um modo **assistido**: o usuário aponta a sala
(`attackBase(room)`), o bot calcula o plano, mostra o veredito e, se aprovado,
conduz o squad pelo ciclo completo. Automação total fica para depois, pelo
mesmo motivo do `contestRoom` (decisão do usuário: nunca automático).

## In scope

- `utils/targetAssessment.js`: DPS/HP das defesas conhecidas vs. DPS/HP/cura
  do squad (sem `room.find`, só `Memory.rooms[x]` do intel).
- Estender `intel` para guardar o que falta (nº/posição de torres, energia
  aproximada, ramparts, spawns, safe mode) quando houver visão.
- Composição por vereditos (corpo, boost opcional) e novo console
  `attackBase(room, mother?)`/`cancelAttack()`.
- Fases do squad: aproximação, quebra de perímetro (rampart), alvo prioritário
  (torre → spawn → resto), retirada por limiar de HP.

## Out of scope

- Automação sem confirmação, guerra com jogador aliado, nukes, simulação
  precisa de combate (o avaliador é conservador, não um simulador).
- Defesa própria (0120).

## Acceptance criteria

1. Smoke: avaliador recusa alvo com DPS de torre acima da cura do squad e
   aceita o contrário (assert por razão).
2. Smoke: `attackBase()` recusa aliado, sala sem `targetEnemy`, zona
   protegida (mesmas razões do `raidRoom`).
3. Smoke: squad em fases quebra rampart → mata torre → spawn, e recua abaixo do
   limiar de HP.
4. Smoke: com safe mode ativo no alvo, o plano é "abortar" com o motivo.
5. In-game: derrubar uma base de teste (ou invader core RCL alto) e voltar
   sem perder o squad inteiro.

## Constitution check

- §1: avaliador lê só `Memory.rooms`; nenhuma varredura nova por tick. §3
  guard. §6 limiares em `config.attack.*`. §7: sem alvo configurado, no-op.
  §8: o plano só sai depois da revisão desta spec.

## Open questions

- Qual o nível de risco aceitável (margem de DPS/cura, perda esperada)?
- Boost é pré-requisito (labs) ou avaliamos com/sem?
- Alvo típico: bases de jogadores próximos (que já são `targetEnemies`)? RCL
  médio?
- Reaproveitar o lockstep 2×2 ou adotar duo/quarteto maior para torres?
- Depende da correção de 0120? (compartilham `combat.pickTarget`, `kite`).
