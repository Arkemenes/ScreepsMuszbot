# 0131 — Plan

## Approach

ARK-115: controle de tentativas no heap por ID/nome estável do creep (Game recria objetos por tick), com retenção limitada e tick global; chave por sala/destino/bloqueios/política e backoff configurável. Checar bucket/orçamento antes de viagem/reconstrução. Marcar reconstrução somente após busca efetiva e evitar validar antes de descartar rota na inicialização. Reduzir teto default de ops e adaptar à CPU disponível. Preservar callbacks de segurança/rotas válidas. Diagnóstico compacto routePlan registra motivo, tick/custo da última busca, teto de ops e próxima tentativa.

O scout não usa `blockHostiles`; claim usa e exclui SK inteira. `takeCover` do
scout depende de `defenseActive` (sala própria), portanto não protege SK.
A exceção de claim precisa de máscara espacial e escape local explícitos.

`keeperTransit` coleta geometria/ameaças no heap pelo intel existente, sem nova
varredura. Sala SK com somente keepers e geometria conhecida recebe matriz com
raio6 excluído em lairs/resources/keepers. Jogador/Invader e ban de dono permanecem
exclusões de sala. Sem cache de geometria fresco, solicitar observer em alcance
para SK já conhecida e manter o desvio; um epoch do heap revalida a rota após
informação nova. Expiração/reset exigem reobservação.

## Modules

- Novo `src/utils/keeperTransit.js`: cache, classificação, máscara, versão,
  observação, checagem de próximo tile e escape usando `combat.flee`.
- `rooms/intel`: coleta pela chamada já guardada, usando hostiles/roomCache.
- `utils/routing`: propaga a opção em todos os callbacks/recuos; matrix overlay;
  invalida rota por mudança da política/epoch, e path nativo por próximo tile perigoso.
- `roles/reserver`: ativa opção somente para claim; registra escape sem culpar sala.
- `utils/config`: flag defaulttrue, raio6, idade máxima200 e observação20 ticks.
- Smoke: novo casefile integrado ao harness existente, com geometria/hostis reais
  de fixture e spy dos callbacks/escape/cache.

## Data shapes

Heap: Map por sala `{centers:[{x,y}], nonKeeperHostiles:boolean, lastTick:number}`;
matriz por sala/tick/raio; epoch somente para geometria/classificação/expiração.
Memory: settings e `observeRequests[room]=expires`, já existente; creep guarda
somente versão escalar `_routeKeeperKey`. Nenhuma geometria/matriz nova na Memory.

## Constitution / Risks

RoomCache/getHostiles fornecem scans únicos; máscara clona a matriz base. Cache
geométrico pode ficar sem visão entre observações, como intel normal; prazo curto
e máscara permanente de lairs/resources reduzem risco, não garantem ausência de
combate. Ameaça móvel invalida próximo tile e força fuga apenas se próxima.
Sem replanejar 200000 ops por tick por mera mudança de coordenadas do keeper.
Não há chamada nova no main nem alteração da política de vida/spawn.

## Validation

Casos SK livre/bloqueada/sem visão, lair sem keeper, mask255, novo hostil, flagfalse,
ban aliado, path cache perigoso e escape. Checks JS, smoke, grunt e graphify.
