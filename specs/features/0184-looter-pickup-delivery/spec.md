# 0184 — Coleta mínima e entrega próxima do looter

- **Status:** done (local); smoke13124/check/build153 verdes, sem deploy
- **Linear:** ARK-233
- **Review:** pedido explícito do usuário em 2026-10-22; implementação autorizada.

## Problem

O looter pode ficar retirando a energia regenerada de um spawn de 1 em 1.
A entrega também fica presa à sala-mãe que gerou a missão, mesmo quando
outra sala própria está mais perto.

## Desired outcome

- Energia só é coletada de piles/stores com pelo menos `loot.minEnergyAmount`
  (default 30). Outros recursos continuam coletáveis em qualquer quantidade.
  Em store misto, energia abaixo do mínimo é ignorada e o mineral é coletado.
- Entrega na sala própria visível mais próxima com capacidade para toda a
  carga restante em um único storage/container (refinamento ARK-234);
  distância por `remotes.roomDistance`, incluindo a sala atual. Dentro dela,
  storage tem prioridade; containers são o fallback. Terminal não é destino.
- Destinos cheios/inválidos são reavaliados. Sem nenhum destino com espaço,
  conserva a carga e tenta novamente. Não abandona nem recicla carregado.
- A sala-mãe/ID da missão permanece responsável por reposição e reciclagem.
  Novas missões aceitam mãe com spawn e storage ou containers.
  Após descarregar, volta ao saque se a missão continua e há TTL suficiente.
  A margem de TTL para entregar usa a sala de entrega mais próxima.
- Sala com apenas restos de energia abaixo do mínimo encerra sua missão.

## Acceptance criteria

Smoke cobre energia 1/29/30, mineral pequeno e store misto; storage antes de
container na mesma sala; container próximo antes de storage distante;
exclusão de sala neutra/inimiga, falta de capacidade, reroute após lotação;
capacidade parcial insuficiente, igualdade exata e soma da carga mista;
entrega real fora da mãe, retorno ao alvo, cancelamento com carga e TTL.

## Constraints

`roomCache` para estruturas, sem nova varredura de creeps, nenhum objeto de
jogo em Memory. Nenhuma mudança de política dos outros roles ou deploy.
