# 0180 — Rota de ruptura até o objetivo da squad

- **Status:** done (local; sem publicação)
- **Created:** 2026-10-22
- **Linear:** ARK-229

## Problem

A squad entrou na sala, mas a navegação trata muralhas e ramparts como custo
infinito. Não existe etapa que escolha e ataque uma barreira para alcançar o
objetivo. A muralha de menor HP da sala pode levar a um beco, e um trajeto com
duas barreiras pequenas pode custar mais que outro com uma barreira maior.

## Desired outcome

Preservar torre → spawn como prioridade estratégica. Calcular, até uma posição
de ataque ao objetivo, a rota de menor custo estimado de caminhada + ruptura:
`sum(terrainTravelTicks + obstacle.hits / squadStructuralDps)`. O primeiro
obstáculo da rota vira o alvo intermediário; após destruí-lo, recalcular.

## In scope

- Busca de uma sala com custos numéricos sem saturação em 254; paredes naturais,
  bordas, estruturas próprias/aliadas e obstáculos indestrutíveis são proibidos.
- Muralhas neutras e ramparts hostis podem ser rompidas; outros bloqueios ficam
  proibidos. Extensions/storage não se tornam objetivos de ataque oportunista.
- Sobreposição de rampart e objetivo: atacar primeiro a proteção; somar custos
  de barreiras sobrepostas quando necessário. Rampart público é transitável,
  mas ainda protege seu ocupante contra ataques.
- DPS por partes ativas/boosts: RANGED_ATTACK dos strikers e dismantle dos
  dismantlers. Distância de ataque: 3 para ranged, 1 quando houver dismantler.
- Movimento até uma posição acessível antes da primeira barreira; todo striker
  ou dismantler usa o mesmo alvo intermediário, com prioridade de creep armado
  preservada nos strikers. Cura e travessia permanecem independentes.
- Plano/caminho/matrizes no heap, reutilizado entre membros; TTL configurável e
  invalidação imediata se a topologia, objetivo ou capacidade ofensiva mudar.
- Sem capacidade de dano, caminho válido ou dentro do orçamento de busca:
  não atacar parede aleatória nem aceitar caminho parcial como plano completo.

## Out of scope

Prever reparos/energia de torres, medir dano recebido, garantir vitória,
otimizar o corpo da squad ou simular seu footprint completo. O custo é uma
estimativa sem reparo inimigo e com o DPS disponível reunido na posição de tiro.
Publicação não está incluída.

## Acceptance criteria

1. `0180: choose the cheapest complete breach route, not the weakest isolated wall`.
2. `0180: total barrier damage beats per-tile saturation or greedy wall choice`.
3. `0180: route stops before the first blocker and all attackers focus it`.
4. `0180: destroyed blocker invalidates the plan immediately`.
5. `0180: natural walls, allies and own structures remain impassable`.
6. `0180: active boosted parts determine structural DPS`.
7. `0180: a rampart protecting the objective is attacked before the objective`.
8. `0180: no damage or exhausted search never produces an arbitrary breach target`.

## Constitution check

Somente membros resolvidos por ID; estruturas/fontes/minerais via roomCache.
Busca limitada a 2304 tiles interiores por padrão, com caminhos no heap e sem
novo guard no main. Config em `squad.breach*`; smoke, sintaxe, build e grafo.

## References

[API oficial](https://docs.screeps.com/api/#Creep.rangedAttack): ataques ranged
têm alcance 3 e atingem rampart protetora. `dismantle` exige adjacência.
