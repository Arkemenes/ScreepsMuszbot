# 0181 — Várias squads simultâneas, inclusive para o mesmo destino

- **Status:** done (local; sem publicação)
- **Created:** 2026-10-22
- **Linear:** ARK-230

## Problem

`raidSquad` recusa outro pedido se há montagem ou squad ativa em qualquer sala.
O registro usa o destino como identidade; remover apenas o bloqueio misturaria
grupos que compartilham alvo. IDs baseados somente no tick também colidiriam.
Além disso, uma squad sem sobreviventes não tem creep que execute sua limpeza.

## Desired outcome

Cada comando cria uma squad independente e retorna seu ID. Várias podem
montar, viajar e lutar na mesma sala, com missões e salas-mãe distintas.

## In scope

- `Memory.pendingSquads[id]` substitui o singleton. `memory.pendingSquad`
  identifica a montagem por ID, não pelo destino.
- IDs únicos mesmo em comandos/promoções no mesmo tick e após reset do heap.
- Fila por mãe em ordem de pedido: completar receita por role, incluindo
  creeps ainda spawning e descontando mortos. Montagem completa aguardando
  registro não impede outra de iniciar. Uma requisição por mãe/tick conserva
  o mecanismo existente de consumo de requests entre spawns.
- Registro/promocão só do grupo correspondente, sem usar membros de outra
  squad, mãe ou missão. Liderança segue a ordem da receita.
- Migração do singleton legado e de seus marcadores por sala, incluindo
  creeps ainda spawning; squads ativas existentes são preservadas.
- Manutenção sob guard no main remove squads vazias e promove líder vivo,
  independentemente de haver um sobrevivente executando seu role.
- Um novo pedido deve acordar uma mãe cujo spawn foi marcado ocioso.
- Help e testes refletem que chamadas repetidas ao mesmo destino são aceitas.

## Out of scope

Reposição automática de squads ativas/expiradas, coordenação tática entre
squads, nova política de alvo, spawn paralelo de vários pedidos no mesmo tick
da mesma mãe, deploy ou alteração de missões live pela API.

## Acceptance criteria

1. `0181: repeated commands for the same destination return distinct queued IDs`.
2. `0181: an active squad does not block another request`.
3. `0181: assembling groups never borrow members sharing the same destination`.
4. `0181: mothers select their own oldest incomplete recipe`.
5. `0181: promotions in the same tick keep distinct identities`.
6. `0181: legacy pending squad and spawning markers migrate without loss`.
7. `0181: maintenance removes a fully dead squad without a survivor running`.
8. `0181: queued assembly bypasses a cached idle spawn verdict`.

## Constitution check

Census para população, IDs em Memory e nenhuma varredura nova de Game.creeps.
Contagens derivadas ficam transitórias; guard protege a manutenção do main.
Fila e contadores são estado operacional mínimo. Não há ciclo infinito de
tentativa nem mudança nas regras políticas do raid.
