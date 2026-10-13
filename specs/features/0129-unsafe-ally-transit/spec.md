# 0129 — Trânsito por aliados que atacam nossos creeps

## Regressão em produção (2026-10-12)

O detector registrou dano em E3N43 e o intel identificava corretamente o
autor como dono da sala, mas o scout continuava atravessando o território.
O motor ignora `false` em `moveTo.costCallback`: só aceita uma `CostMatrix`.
O bloqueio deve produzir uma matriz com **todos os 2500 tiles em 255** nesse
callback. `PathFinder.roomCallback` continua usando `false`. Scout e claimer
devem respeitar o mesmo bloqueio dinâmico, inclusive nos modos normal,
nativo, fallback e recuo, mantendo a origem disponível para escape.
Os testes devem verificar a matriz efetivamente usada pelo motor.

## Problem

ARK-100: scouts enviados de E1N45 para E5N41/E6N41 seguem uma rota válida,
mas morrem ao entrar no território de `TimelessTacticianEon`. A lista de
aliados hoje também funciona como permissão de trânsito, embora alguns
aliados não tenham configurado suas torres para poupar nossos creeps.

## Desired outcome

Separar diplomacia de segurança de trânsito. Aprender quais aliados causaram
dano confirmado a nossos creeps e desviar temporariamente de suas salas
conhecidas. Nenhum nome de jogador entra nos defaults da política de trânsito;
o relato de `TimelessTacticianEon` é contexto do bug, não uma exceção de código.
O bloqueio afeta todos os usuários de `utils/routing`, inclusive scouts,
claimers e pioneers, e permite retomar o trânsito se o aliado corrigir o bot.

## In scope

- `Memory.settings.routing.avoidPlayers`: bloqueio manual opcional por
  jogador; default vazio, sem nomes pré-carregados. Aprendizado funciona
  independentemente dessa lista.
- Aprendizado habilitado por `routing.learnAllyAttacks` (default `true`):
  `Room.getEventLog()` identifica `EVENT_ATTACK` com dano positivo, alvo
  próprio e autor aliado resolvido. Guardar uma evidência compacta por autor
  em `Memory.routingAggressors` (sala e tick do último ataque), sem objetos
  de jogo. Cada novo ataque confirmado renova a evidência.
- Bloqueio aprendido expira após `routing.allyAttackAvoidTicks` sem novos
  ataques confirmados (default configurável: 10000 ticks). Expiração permite
  uma nova tentativa de trânsito normal, não comprova que o aliado mudou
  nem despacha scouts de teste. Se houver novo ataque, bloquear novamente.
  Bloqueios manuais persistem até liberação explícita.
- Reconhecer também um alvo morto quando seu id consta no snapshot próprio
  do tick anterior, mantido no heap. Ler eventos uma vez por sala/tick dentro
  do intel, antes das decisões de movimento.
- Bloquear salas de propriedade ou reserva do jogador usando visão atual ou
  intel existente. Uma sala nossa nunca entra no bloqueio.
- Aplicar a política à busca de rota, callbacks do PathFinder/moveTo e rotas
  já cacheadas. Bloqueio é absoluto, mesmo sem `blockHostiles` e mesmo se a
  sala proibida for destino. Permitir o cômodo atual como origem para sair;
  nunca voltar a uma sala proibida durante um recuo.
- Console: `avoidPlayer(name)`, `allowPlayer(name)`, `routeAvoidStatus()`.
  Liberação remove tanto bloqueio manual quanto evidência aprendida. Um novo
  ataque confirmado pode bloquear novamente.
- Corrigir a fase de assinatura depois de alcançar a origem: o trace deve
  continuar `to:<destino>` quando o scout deixa essa sala, sem limpar o
  estado da rota e reiniciar o timeout apenas por sair da origem.

## Out of scope

- Alterar a lista de aliados, declarar guerra ou criar alvos ofensivos.
- Inferir autoria apenas pela morte/desaparecimento de um creep.
- Garantir detecção quando a morte elimina toda a visão da sala ou o autor
  não pode ser resolvido; sem evento disponível, usar bloqueio manual.
- Saber o dono de uma sala nunca observada. O desvio passa a valer quando
  houver intel de propriedade/reserva.

## Acceptance criteria

1. Todos os aliados começam transitáveis, sem bloqueios por nome nos defaults.
   Após ataque confirmado, a propriedade/reserva conhecida do autor não entra
   na rota; a lista de aliados permanece intacta.
2. Eventos de torre e creep aliados com dano positivo a alvo próprio
   produzem evidência; cura, dano zero, alvo estrangeiro e autor desconhecido
   não produzem bloqueio.
3. Alvo morto identificado pelo snapshot do tick imediatamente anterior
   conta; snapshot antigo/reset e morte sem evento não contam.
4. Rota cacheada é invalidada após mudança da política ou da propriedade
   conhecida; nenhum callback permite reentrada, inclusive em modo nativo.
5. Creep já dentro de uma sala proibida pode sair por uma rota segura;
   destino proibido retorna `ERR_NO_PATH`.
6. Comandos de inspeção/liberação funcionam sem alterar diplomacia.
7. Bloqueio aprendido expira no prazo configurado; novo ataque renova esse
   prazo. Expiração/liberação invalida as rotas e permite retomar o trânsito.
   Bloqueio manual não expira com a evidência automática.
8. Smoke cobre os casos acima; `node --check`, smoke e `npx grunt` verdes.

## Constitution check

Uma leitura de eventos por sala/tick; census fornece nossos creeps sem nova
varredura de `Game.creeps`. Snapshot/versão de rotas no heap; só configuração
e evidência compacta persistem. Integração dentro do intel já protegido por
`guard()`. Sem ataque automático ou loops sem limite.

## Review

Aprovada pelo usuário em 2026-10-12, após remover jogadores dos defaults e
adotar aprendizado temporário com expiração/renovação configurável.
