# 0158 — Storage provisório até RCL 4

- **Status:** done (local; publicação pendente)
- **Owner:** ARK-161
- **Created:** 2026-10-17

## Problem

Salas RCL 1–3 ainda não podem construir storage. O planejamento reserva um
tile para terminal, mas a logística não oferece um depósito central nesse estágio.

## Desired outcome

Construir um container no tile planejado do terminal até RCL 3 e expô-lo como
`room.storage` para toda a economia. Em RCL 4, construir o storage definitivo;
quando estiver pronto, trocar a referência, transportar todos os recursos do
container para ele e remover o container somente após confirmar a entrega.

## In scope

- Site temporário derivado do plano, sem alterar o layout persistido.
- Manter o container como storage durante a construção do definitivo.
- Migração de energia e minerais pelos haulers; preservar prioridades essenciais.
- Recuperação após reset/segmento indisponível usando somente IDs na Memory.
- Evitar contagem duplicada e novas entregas no container após a troca.

## Out of scope

- Publicação no servidor; mudança de posições no layout.

## Acceptance criteria

1. `0158: early room queues terminal-tile container`: RCL 1–3 cria site no
   tile do terminal, respeitando orçamento e limite; não duplica sites.
2. `0158: buffer is canonical storage`: economia, coleta, entrega e reservas
   leem o container via `room.storage`, com capacidade real e sem dupla contagem.
3. `0158: RCL4 builds real storage and keeps buffer`: mudança de RCL dispara
   planejamento; não recria container em RCL 4+, nem o remove antes do storage.
4. `0158: migration delivers every resource to real storage`: haulers esvaziam
   energia e minerais para o storage definitivo, independentemente da política
   de terminal. Destino cheio espera sem descartar; urgência adia nova coleta,
   exceto energia para iniciar um storage vazio e desbloquear o abastecimento.
5. `0158: removal waits for confirmed cargo delivery`: container com saldo ou
   carga em trânsito nunca é destruído; falha de destroy é retentada.
6. Reset, plano ausente, objeto destruído e sala alheia não causam perda de
   referência válida, serialização de objetos ou remoção de outro container.

## Constitution check

`roomCache` fornece estruturas; `census` fornece haulers sem nova varredura de
`Game.creeps`. Coordenadas derivadas ficam no heap/plano; Memory guarda somente
o ID do container e IDs/recurso do job. Preparação da sala usa `guard` antes dos
consumidores. Migração em passos limitados, validando estoque/capacidade a cada
tick. Critérios cobertos pelo smoke, `node --check` e build isolado.

## Review

Contrato conferido com o pedido explícito: RCL 4 inicia construção; a referência
só troca ao concluir a estrutura, e remoção exige entrega física confirmada.
Sem perguntas abertas de comportamento.
