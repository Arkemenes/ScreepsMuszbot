# 0131 — Claim: trânsito por salas SK com exclusão de tiles perigosos

- **Status:** done (implementação local; publicação e travessia em jogo pendentes)
- **Issue:** ARK-111
- **Created:** 2026-10-12
- **Depends on:** 0033, 0035, 0064, 0129

## Problem

O scout atravessou o corredor, mas o claimer usava `blockHostiles` e excluía E4N44 inteira por seus Source Keepers. Com E3N43 bloqueada pela agressão do dono, escolheu um desvio por N40. O motivo exato do desaparecimento anterior não foi confirmado. O trecho confirmado é E4N43 → E5N43 → E5N42 → E5N41; E4N43 não tem saída para E4N42. O código não fixa esse corredor.

## Scope

- Exceção somente para claim, com `claim.keeperTransit=true`; reserve mantém sua política.
- SK com apenas Source Keepers permite trânsito com máscara de custo255 no raio `claim.keeperAvoidRange=6` de lairs, fontes, minerais e keepers. Jogador/Invader bloqueia a sala; ban de proprietário prevalece.
- Geometria/matrizes no heap com `claim.keeperIntelMaxAge=200`. Sem dados recentes, bloquear SK e solicitar observer em alcance somente para sala conhecida, pela fila existente com `claim.keeperObserveTicks=20`.
- Informação nova/expirada revalida rota. Movimento do keeper não provoca busca completa. Invalidar próximo passo perigoso/inconsistente de `_move`.
- Escape local com `combat.flee`, fase `evading_keeper` em `claimStatus()`. Preservar limites de bucket/ops e guardas de stall existentes.

Novo pré-voo/gate de spawn, probes, combate/escolta, rota literal, mudanças de diplomacia, remoção de bans e publicação ficam fora do escopo.

## Acceptance criteria

1. Máscara deixa corredor externo aberto, clona matriz base e protege lair mesmo sem keeper.
2. Planejamento, execução nativa, fallback e recuo aplicam máscara e ban; Invader impede trânsito.
3. Informação ausente/expirada bloqueia sala e pede observer quando há cobertura. Geometria fica fora da Memory.
4. Informação nova revalida desvio; observação equivalente/movimento preserva rota completa.
5. Próximo passo perigoso/inconsistente é invalidado e escape aparece no diagnóstico.
6. Flag desabilitada restaura comportamento anterior; reserva não muda.
7. Node checks, smoke, bundle Grunt e atualização AST concluídos. CPU/dano/travessia reais exigem validação em jogo após publicação.

## Constitution / Risks

Scans usam `roomCache`/`getHostiles`; coleta entra pelo intel guardado. Dados derivados ficam no heap; Memory recebe fila existente, configuração e versão escalar. Config não fixa salas/jogadores. Planejamento segue limites existentes, sem busca longa por movimento do keeper. Terreno e visão determinam passagem; não há garantia de ausência de combate ou de vida suficiente para o claimer atual.

## Review

ARK-115: a versão global de territórios mudava com intel do observer, inclusive em salas sem relação com o trajeto. routing agora usa versão das restrições de jogadores e verifica segurança das salas do caminho/destino do path/recuo. Observação distante não invalida rota; mudança hostil no trajeto e alteração de bans continuam invalidando. O backoff usa ID/nome estável, porque Game recria Creep por tick; a retenção no heap é limitada.

Complemento ARK-115 (CPU): limitar busca completa a 20000 ops por padrão, com limite menor quando resta pouco orçamento do tick; uma busca completa por tick para o conjunto dos viajantes. Cache de tentativa no heap impede buscas equivalentes por 50 ticks após falha, inclusive após desvio da rota. Uma reconstrução de waypoints não deve ser seguida de segunda busca pela inicialização da mesma viagem. Caminho validado continua utilizável com bucket baixo. Sem orçamento, preservar estado e retornar ERR_BUSY; não classificar espera de CPU como sala sem saída. Testar buscas duplicadas, falha repetida, recuperação, alteração de política e CPU antes de PathFinder.

Complemento ARK-113: o diagnóstico ao vivo mostrou oscilação em E1N45, com posição (25,37) e path nativo 2437 seguido de direções. O leitor anterior tratava o primeiro dígito da coordenada como direção2. utils/nativePath agora resolve o próximo passo pelo formato serializado e posição atual; routing usa o resultado no desbloqueio e passagem entre creeps, move na checagem de parede, traffic no diagnóstico e keeperTransit na máscara. Caminho de outra sala ou sem posição correspondente não autoriza movimento forçado. Regressão usa o path real e reproduz stall recovery, esperando LEFT para (24,37). Esta correção não comprova passagem pela SK: a rota observada ainda usa N40, cuja escolha depende de informação recente/observer e terreno.

Complemento ARK-112: core isolado em E5N43 não é exclusão de sala; a política existente já considera creeps hostis/proprietário. A matriz de estruturas agora bloqueia apenas o tile do Invader Core para contorná-lo, com regressões de planejamento, grafo, fallback e recuo. Creeps hostis junto ao core continuam bloqueando trânsito. Sem nova exceção de diplomacia ou configuração.

Direção aprovada em 2026-10-12: “O scout conseguiu fazer esse caminho, o claimer tbm deveria conseguir”. Escopo final preserva spawn e claim.
