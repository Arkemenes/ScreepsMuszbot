# 0129 — Plan

## Correção de regressão (2026-10-12)

Converter exclusões dos três callbacks destinados a `moveTo` em uma
`CostMatrix` cheia de 255, com template no heap e clone por retorno.
Não mudar o callback de `PathFinder.search`, onde `false` bloqueia salas.
Invalidar paths na adoção da política, como já previsto. Reproduzir a
semântica do motor nos testes e exercitar scout/claimer nos dois modos.
Referência: `screeps/engine`, `src/game/rooms.js`, `_findPath2`:
https://github.com/screeps/engine/blob/master/src/game/rooms.js

## Approach

1. Criar `utils/transitSafety.js`, independente de combate/roles. Consultar
   `config` e `hostiles.isAlly`; identificar dono/reserva pela visão atual,
   com fallback para `Memory.rooms`. Lista manual e evidências aprendidas
   são independentes de `Memory.settings.allies`/`targetEnemies`. Configuração
   manual começa vazia; não adicionar nomes de jogadores ao código de trânsito.
2. `rooms/intel.js` chama `transitSafety.observeRoom(room)` depois de atualizar
   controller/owner/reservation. A chamada permanece no `guard("intel:...")`.
   `getEventLog()` é memoizado por sala/tick; só `EVENT_ATTACK` com dano
   positivo e alvo identificado como creep próprio conta. Não confundir
   ataques de inimigos em sala aliada com ataques do dono da sala.
3. Heap guarda ids de nossos creeps vistos via `census.allInRoom`, com tick,
   para reconhecer alvo morto no tick anterior (inclusive mudança de sala).
   Autor exige objeto resolvido e `owner.username` aliado; se desaparecer
   ou não houver visão, não inferir. GC limita snapshots à janela de um tick.
4. Persistir no máximo uma evidência `{room, tick}` por autor; atualizar o
   tick a cada ataque confirmado. Consultar a validade pela janela configurada
   em `routing.allyAttackAvoidTicks` (default 10000); fazer GC das evidências
   expiradas. Logar só a transição para bloqueado, não cada ataque.
   `routing.learnAllyAttacks=false` pausa novos registros; evidências existentes
   ainda respeitam o prazo. Liberação manual remove a evidência imediatamente.
   A lista manual começa vazia e bloqueios manuais só saem por comando.
5. Versão de política no heap muda quando lista/evidências ou o dono/reserva
   observado mudam. `moveToRoom` invalida `_move`, `_realRoute` e seu estado
   de progresso/recuo ao detectar a mudança. A versão pode ser pequena chave
   persistida por creep; o conteúdo derivado da política permanece no heap.
6. Impor bloqueio antes das exceções para destino/aliados em `findRoute`,
   `routeCostCallback`, `avoidCostCallback`, `hopCostCallback` e
   `computeRealRoute`. Apenas a origem atual pode ser consultada para escape.
   Sem rota segura, devolver `ERR_NO_PATH`, inclusive `nativeRoute`, sem
   fallback direto à sala proibida. Recuos não podem atravessar bloqueios.
7. Corrigir no fluxo de assinatura a identificação de fase: depois de
   `_signSourceReached=true`, ela é `to:<destino>` inclusive fora da origem.
   O trace do usuário mostra `from:E1N45` apesar de `sourceReached:true`;
   isso hoje reinicia a rota/timeout ao sair da origem. Teste de regressão
   deve comprovar que a política aprendida não é apagada por essa transição.
8. Expor os comandos de bloqueio, liberação e status, documentados no help.

## Files

- Novos: `src/utils/transitSafety.js`, `test/transitSafetyCases.js`.
- Alterados: `src/utils/config.js`, `src/utils/routing.js`,
  `src/rooms/intel.js`, `src/roles/scout.js`, `src/utils/console.js`,
  `test/smoke.js`, `specs/ARCHITECTURE.md`, `specs/ROADMAP.md`.
- Preservar todas as mudanças locais existentes, inclusive em arquivos
  compartilhados; não criar commit ou deploy ao jogo sem pedido.

## Validation

Adicionar casos ao harness existente, inicialmente vermelhos: bloqueio
manual/reserva, aliados seguros, torre e creep autores, dano zero/cura/alvo
estrangeiro/autor desconhecido, morte com snapshot recente, ausência de
evento/visão, troca de dono, cache antigo, escape/recuo, destino proibido,
modo nativo, liberação, expiração/renovação do bloqueio aprendido, lista
manual inicialmente vazia e fase de assinatura.

Depois de cada tarefa de código: `node --check` nos arquivos e smoke. Ao
concluir: `npx grunt`, inspeção do diff e `graphify update .`.

## Risks and limits

- `getEventLog()` descreve ações do tick anterior; uma morte que elimina a
  visão pode impedir a coleta. O console permite um bloqueio manual opcional
  para incidentes relatados pelo usuário; nenhum é pré-carregado no build.
- Propriedade desconhecida não pode ser bloqueada antecipadamente. A visão
  nova invalida rotas antes do movimento do tick, mas o creep já pode ter
  entrado na sala no tick anterior.
- Expiração permite tentar o trânsito novamente, sem garantia de segurança;
  um novo ataque reaplica o bloqueio. O usuário pode liberar imediatamente
  quando o aliado confirmar a correção, ou configurar um prazo maior.
- Mudanças de política podem provocar buscas novas; invalidar apenas quando
  a versão muda, sem PathFinder extra por evento.

## Review status

Spec revisada e aprovada pelo usuário em 2026-10-12; implementação autorizada.
