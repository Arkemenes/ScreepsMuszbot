# 0032 — Combat overhaul: defesa mais forte + capacidade ofensiva

- **Status:** done (Fase 1 — `tasks.md`; Fase 2 — `tasks-phase2.md`; Fase
  3 — `tasks-phase3.md`; Fase 4 — `tasks-phase4.md`. As 4 fases do
  documento estão entregues - `targetEnemies`/"montar força pra criar
  vantagem" continuam como extensão futura anotada na spec, não bloqueiam
  o fechamento)
- **Owner:** -
- **Created:** 2026-09-11
- **Reviewed:** 2026-09-11 (ver "Decisões da revisão")
- **Depends on:** 0003 (base defense layout — mincut/ramparts/torres),
  0004 (combat behaviour — `defender.js`/`utils/combat.js` atuais)

Este documento é o passo 1 do processo (`specs/README.md`): problema,
pesquisa, e um cardápio de abordagens com prós/contras. As perguntas em
aberto foram revisadas e decididas (ver "Decisões da revisão"). `plan.md`
da Fase 1 escrito (D1 corrigido durante o planejamento — ver a nota lá);
próximo passo é `tasks.md`, quando pedido.

## Problem

O `defender` de hoje (`roles/defender.js`) é um generalista solo: kita a 3
tiles, atira + se cura no mesmo corpo, corpo fixo ~1:1 MOVE
(`RANGED_ATTACK MOVE RANGED_ATTACK MOVE HEAL MOVE` a partir de 700 energia).
Isso resolve bem o caso M8 original (invader/raid pequeno, não-boostado,
melee-heavy) mas tem lacunas reais:

- **Ordem do corpo é ruim pra tankar.** Screeps dana as body parts **na
  ordem do array**, começando do índice 0 — o corpo atual começa com
  `RANGED_ATTACK` (a parte mais cara e mais importante), então o dano
  degrada a arma primeiro em vez de MOVE/HEAL "de sobra".
- **Um corpo faz duas coisas mal.** `RANGED_ATTACK` e `HEAL` competem pelos
  mesmos slots do corpo (máx. 50 parts) — nem o DPS nem a cura escalam
  bem sozinhos, e a "vida" total de combate é só o hp de UM creep.
- **Kiting não ajuda contra hostil ranged** (mesmo alcance, não dá pra abrir
  distância) nem contra um enxame que cerca de vários ângulos.
- **Rampart existe (0003, mincut) mas o defender não usa** como posição —
  ele kita em campo aberto quando podia simplesmente segurar atrás do
  perímetro e negar o melee inteiramente (ver pesquisa abaixo).
- **Sem boosts, sem safe mode, sem resposta a nuke** — zero desses hoje.
- **Zero capacidade ofensiva.** Nenhum role ataca proativamente; nada usa a
  intel que o scout/observer já coletam (ROADMAP 0028/0029) pra agir sobre
  ela (limpar invader core, assediar remote inimigo, ou futuramente montar
  um squad de invasão).
- **`needs.js`'s `defender` count** (`min(maxCount=3, hostiles+1)`) spawna N
  cópias do MESMO corpo genérico — não distingue "preciso de mais DPS" de
  "preciso de mais cura", nem varia o corpo pela ameaça (boostado vs não).

## Desired outcome

Uma defesa que aguenta um raid maior/boostado sem perder a base, mais
barata em CPU/energia que "spawnar mais do mesmo", e uma base de código
(posicionamento, corpos, coordenação) que já nasce pensando na fase
ofensiva que vem a seguir (squads de múltiplas unidades) — não dois
sistemas desconexos depois.

## Pesquisa: mecânica de combate do Screeps

Referência técnica pra fundamentar as abordagens abaixo. Números de boost
citados são de memória e **precisam ser confirmados contra as constantes
do jogo antes de qualquer corpo depender deles** — o formato (T1/T2/T3
crescente) é confiável, os valores exatos não.

- **Dano ataca a body part pelo índice do array, não por "vida total".**
  `creep.hits` é a soma das partes vivas (100 hp cada, sem boost). Dano
  acumulado destrói a parte do índice 0 pra frente. Logo: partes baratas/
  descartáveis (`MOVE`, `TOUGH`) na frente protegem `RANGED_ATTACK`/`HEAL`
  por mais tempo — **mas só vale a pena se o creep não precisa daquele
  `MOVE` pra continuar funcional**. Um kiter que perde `MOVE` primeiro fica
  preso (pior que perder depois); um tanque parado atrás de rampart não
  liga.
- **`TOUGH` sem boost é hp puro e barato: 100 hp por 10 de custo** (o
  melhor hp/custo do jogo — nenhuma habilidade ativa). Só ganha a redução
  de dano (~30/50/70% conforme o tier) **quando boostado**; sem boost é
  apenas enchimento de array.
- **Rampart bloqueia movimento, não bloqueia dano.** `ATTACK`/
  `RANGED_ATTACK`/`HEAL` não têm linha de visão — só checam distância
  (Chebyshev). Um rampart não "absorve" o hit de um creep em cima dele; ele
  impede o hostil de **chegar a alcance 1** (melee) se não houver brecha no
  perímetro. Ou seja: segurar atrás do mincut (0003) já existente **nega
  melee de graça**, mas **não protege de `RANGED_ATTACK`** (alcance 3,
  ignora parede) nem impede `dismantle` na própria rampart (por isso ela
  tem hp alto — ROADMAP 0003/tower.js's `rampartCriticalLimit*`).
- **Torre (`structures/tower.js`, já sofisticada)**: prioridade por parte
  do corpo (HEAL>RANGED>ATTACK>WORK>CLAIM>CARRY, boost furada a prioridade
  ainda mais), score por tempo-pra-matar, dano cai de 600→150 entre
  alcance 5–20. Ponto fraco conhecido do Screeps: **"tower drain"** — um
  hostil boostado em HEAL fica parado no alcance máximo, tanka o dano da
  torre indefinidamente enquanto a torre gasta energia; só resolve com
  energia/torres suficientes ou expulsando fisicamente.
- **Boosts (labs, RCL6+)**: compostos T1/T2/T3 aplicados a um body part
  (`creep.body[i].boost`). Padrão: T1 ~2×, T2 ~3×, T3 ~4× o efeito da
  parte (dano, cura, redução de fadiga); `TOUGH` é redução percentual de
  dano recebido em vez de multiplicador. Sem infraestrutura de lab/reação
  nenhuma hoje (stamp de lab existe no `architect.js`, sem role/lógica).
- **Safe mode** (`room.controller.activateSafeMode()`): 20.000 ticks de
  invulnerabilidade total da sala (hostil não ataca nada). Recursos
  limitados — 1 grátis por sala (ganha mais por GCL — 1 a cada... verificar
  a constante atual) e cooldown longo entre usos. Botão de pânico, não
  estratégia contínua.
- **Nuke**: `room.find(FIND_NUKES)` dá ~50.000 ticks de aviso antes do
  impacto (300k dano no epicentro, menos em anel). Tempo de sobra pra
  reforçar rampart no ponto de impacto ou evacuar.
- **Arquétipos comuns de PvP/PvE do Screeps** (pra referência das
  abordagens abaixo):
  - **Kiter** (o que já existe): ranged+heal num corpo, mantém distância.
  - **Tanque estático**: `ATTACK`/`TOUGH`-heavy, parado atrás de rampart,
    não precisa de `MOVE` sofisticado.
  - **Dupla striker+medic**: DPS e cura em creeps separados — mais hp total
    (dois pools) e cura não compete por slot com a arma.
  - **Quad**: 4 creeps se movendo como bloco sincronizado (2+2 ou boostado)
    — o padrão competitivo pra quebrar rampart/base inimiga. Complexo:
    exige movimento coordenado (nada parecido existe em `utils/move.js`
    hoje, que é por-creep independente).
  - **Dismantler**: `WORK`-heavy, ataca estrutura (`dismantle`) em vez de
    creep — usado tanto ofensivamente (abrir rampart inimigo) quanto
    defensivamente (nada aqui hoje).

## Abordagens — defesa

### D1. Reordenar o corpo do defender — `MOVE` por **último**, não na frente
- **Mecanismo:** `getBody()` gera `[RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE, MOVE, MOVE]` (700 energia) em vez da ordem atual (`RANGED_ATTACK, MOVE, RANGED_ATTACK, MOVE, HEAL, MOVE`, intercalada).
- **Correção (planejamento):** a intuição genérica "descartável na frente" (MOVE/TOUGH primeiro) é certa pra um **tanque parado** (D3), onde mobilidade não importa — mas é **errada** pro kiter de hoje. Rastreando a ordem de morte das partes: com `MOVE` na frente, perder só 1 `MOVE` já derruba a proporção MOVE:resto abaixo de 1:1 — o creep acumula fadiga e fica **mais lento que o inimigo** bem na hora que mais precisa fugir; com todo `MOVE` perdido, fica imóvel com arma+cura intactas (alvo parado, cercado). Com `MOVE` por **último**, a mobilidade fica intacta até o fim — o defender sempre consegue fugir, mesmo reduzido a "só pernas" depois de perder arma e cura. Pro kiter, proteger a fuga vale mais que proteger a arma.
- **Prós:** mudança de uma função, zero custo extra de energia, ganho real de sobrevida (mantém a capacidade de fugir o máximo possível, que é a estratégia central do kiter).
- **Contras:** sacrifica ofensiva/cura primeiro — um defender já sem arma ainda ocupa um corpo, só foge; aceitável (sobreviver > morrer atirando), mas significa que ele para de contribuir dano antes.
- **Esforço:** trivial.

### D2. Separar striker (DPS) de medic (cura) — dupla em vez de generalista
- **Mecanismo:** dois roles/corpos (`defenderStriker`: `RANGED_ATTACK`-heavy; `defenderMedic`: `HEAL`-heavy), sempre spawnados em par, medic segue o striker a alcance 1–3.
- **Prós:** hp de combate total dobra (dois pools de 100hp/parte em vez de um corpo compartilhado); cura não compete por slot com dano — mais DPS E mais cura pelo mesmo energyCapacity total. Base natural pra um trio/quad depois (0032→futuro).
- **Contras:** mais um role pra manter sincronizado (o medic sozinho é inútil/vulnerável se o striker morre ou foge rápido demais); dobra a complexidade de spawn/priorização (`needs.js` precisa contar os dois junto).
- **Esforço:** médio.
- **Decidido (revisão):** meio-termo — sem `Memory.squads` novo por
  enquanto. Cada medic guarda `memory.partnerId` (id do striker que segue)
  e vice-versa; simples o bastante pra não ser over-engineering com N=2,
  mas já no formato (par explícito por id, não posição ad-hoc) que
  facilita promover pra um grupo de N quando o quad (O5) sair do papel.

### D3. Tanque estático atrás do mincut (usa o rampart que já existe)
- **Mecanismo:** o defender (ou um novo corpo `ATTACK`/`TOUGH`-heavy) segura posição numa tile de rampart do perímetro já calculado pelo `architect.js` (0003), atirando/atacando o que chegar a alcance — sem perseguir, sem kitar contra melee (o rampart já nega isso).
- **Prós:** CPU quase zero (sem pathfinding de fuga a cada tick), corpo pode ser `ATTACK`-heavy (mais dano por energia que `RANGED_ATTACK`) já que não precisa fugir de melee, reaproveita infraestrutura existente (mincut, `tower.rampartCriticalLimit*`) em vez de criar uma nova.
- **Contras:** **não protege de `RANGED_ATTACK`** (ver pesquisa) — ainda precisa de HEAL ou reposicionamento contra um hostil ranged/boostado; só funciona onde o perímetro já está fechado (sala nova/sem plano ainda fica exposta); um hostil pode simplesmente ficar fora de alcance e "tower drain" a torre em vez de se aproximar.
- **Esforço:** médio (posicionamento + saber distinguir "hostil vai virar a esquina do perímetro" de "hostil é puramente ranged, ainda preciso me mexer").

### D4. Rampart/wall com hp escalando por RCL (mais do que já existe)
- **Mecanismo:** `tower.rampartCriticalLimit*` já existe (10k / 100k sob ataque) — estender pra um alvo que sobe com o RCL (ex.: teto realista de proteção em vez de só "crítico"), gasto de energia após storage cheio.
- **Prós:** puramente passivo, não compete por spawn queue, força o atacante a investir muito mais pra furar.
- **Contras:** caro em energia (rampart pode ir a 300M hp — não dá pra maximizar tudo), só compensa com storage/energia sobrando (RCL6+ efetivamente).
- **Esforço:** baixo (é ajustar `config.js` + o loop de repair já existente).

### D5. Boosts via lab (TOUGH/RANGED_ATTACK/HEAL)
- **Mecanismo:** reações de lab (mineral + energia) produzem compostos; defenders boostam antes de entrar em combate.
- **Prós:** salto de ordem de grandeza no poder de combate — um punhado de creeps boostados aguenta um raid que exigiria dezenas sem boost.
- **Contras:** **exige construir toda a cadeia de lab/reação do zero** (stamp existe, papel/role não) — mineral logistics, reações, fila de boost. Escopo grande, só compensa contra ameaça séria/persistente; desperdício contra invader casual.
- **Esforço:** alto — provavelmente um spec próprio (lab/mineral logistics) antes deste aqui poder usar boost de verdade.
- **Decidido (revisão):** represado por enquanto — sem spec de lab/mineral
  logistics agora. Revisitar quando o squad de verdade (O5) ou uma ameaça
  real justificar o investimento.

### D6. Safe mode automático
- **Mecanismo:** gatilho (ex.: spawn prestes a cair, ou sem defenders vivos + hostil na sala) chama `activateSafeMode()`.
- **Prós:** rede de segurança contra perda total; simples de implementar (é uma chamada + condição).
- **Contras:** recurso limitado (poucos usos, cooldown longo) — um gatilho mal calibrado desperdiça a única carga numa ameaça pequena; precisa de critério cuidadoso, difícil de testar offline (é uma decisão de "vida ou morte" que só aparece raramente no jogo real).
- **Esforço:** baixo pra implementar, médio pra calibrar/confiar.
- **Decidido (revisão):** gatilho conservador — dispara só quando o spawn
  está em risco real: hostil a alcance de ataque do spawn **E** (hp do
  spawn abaixo de um limiar `config.get("combat.safeModeSpawnHpRatio", …)`
  **OU** zero defenders vivos). Não dispara por qualquer raid pequeno que
  a defesa normal já resolve.

### D7. Resposta a nuke
- **Mecanismo:** `FIND_NUKES` detecta impacto futuro; reforça rampart no ponto de impacto ou prioriza evacuação de creeps caros.
- **Prós:** ~50k ticks de aviso é bastante tempo — mitigação real é viável.
- **Contras:** só relevante contra oponente com nuker (raro nesta fase do jogo); baixa prioridade até a sala ter probabilidade real de ser alvo.
- **Esforço:** baixo, mas baixo ROI agora.

## Abordagens — ofensiva

*(O usuário confirmou que squads multi-unidade fazem parte do roadmap num
futuro não muito distante — as abordagens abaixo já consideram isso, não
são só "algum dia talvez".)*

**Política de alvo ofensivo (decidido na revisão):** por padrão, o bot só
faz defesa/retaliação (O1) e PvE (O2, invader core — não é jogador, fica
de fora dessa política). Contra outro jogador, O3/O4/O5 só valem pra quem
está numa lista opt-in nova, `Memory.settings.targetEnemies` (mesmo
formato/lugar dos overrides de `hostilePlayers`/`allies` já existentes em
`utils/hostiles.js` — ver 0012), adicionada manualmente por enquanto.
Mesmo um jogador em `targetEnemies` só é atacado quando o critério de
vantagem do O4 (sala sem torre/defender visto, RCL baixo) indicar
vantagem clara — a lista não é "ataque cego", é "esses valem a pena
avaliar". Duas extensões ficam **explicitamente fora de escopo desta
spec**, anotadas pra revisão futura quando a política básica já estiver
rodando:
- **Retaliação automática** — promover um jogador pra `targetEnemies`
  sozinho depois que ele ataca primeiro (grudge list).
- **Montar força pra criar vantagem** — em vez de só esperar uma janela de
  vantagem oportunista, spawnar/reunir um squad deliberadamente contra um
  `targetEnemy` específico até a vantagem existir. Isso é essencialmente
  O5 (quad) aplicado com intenção, não por acaso — faz mais sentido depois
  que o squad de verdade existir.

### O1. Retaliação reativa / mop-up (postura mínima)
- **Mecanismo:** nunca inicia — mas depois de repelir um ataque, persegue/termina hostis feridos em vez de deixá-los recuar e voltar depois.
- **Prós:** zero risco diplomático (nunca ataca primeiro), reaproveita o defender que já existe.
- **Contras:** não gera nenhum ganho econômico/expansão — é só "reduzir a chance do mesmo raid voltar".
- **Esforço:** trivial (ajuste de alvo no `defender.js` existente).

### O2. Limpeza de invader core / estrutura em highway
- **Mecanismo:** um role (ou o `reserver`/`defender` reaproveitado) ataca `invaderCore`/estrutura hostil numa sala highway pra liberar loot e permitir remote mining ali.
- **Prós:** ROI direto (loot + abre remote), risco baixo (invader core não persegue), reaproveita corpo de combate existente quase sem mudança.
- **Contras:** precisa de lógica de alvo por estrutura (não só creep), e de saber qual sala vale a pena (intel do scout/observer já dá isso — ROADMAP 0028/0029).
- **Esforço:** baixo/médio.

### O3. Assédio de remote inimigo (negação econômica)
- **Mecanismo:** manda um par pequeno pra matar reserver/miner de um jogador rival numa sala disputada, sem entrar na base dele.
- **Prós:** barato, assimétrico — custa pouco pra negar o remote de outro jogador.
- **Contras:** risco diplomático real; pode escalar pra guerra que a base ainda não aguenta.
- **Esforço:** médio (precisa de seleção de alvo por jogador + intel de quem é remote de quem).
- **Gate (revisão):** só contra um jogador em `Memory.settings.targetEnemies`, e só com vantagem clara (ver "Política de alvo ofensivo" acima).

### O4. Raid oportunista em sala fraca (usa a intel do observer)
- **Mecanismo:** o observer (ROADMAP 0029/0031) já mantém `Memory.rooms` atualizado com dono/RCL/torres/hostis de tudo em alcance; uma rotina periódica pontua "sala fraca o bastante pra valer o risco" (sem torre, RCL baixo, sem defender visto) e despacha um raid barato só quando encontra alvo.
- **Prós:** aproveita infraestrutura que já existe (0029/0031) quase de graça — não precisa de nova coleta de intel, só de uma função de pontuação; oportunista (não gasta nada quando não há alvo bom).
- **Contras:** pontuação errada manda creep caro pra morrer numa sala "fraca" que na verdade tem defesa fora do que o intel capturou (torre construída depois da última observação); ainda é risco diplomático.
- **Esforço:** médio.
- **Gate (revisão):** mesma coisa — só contra `targetEnemies`, só quando a pontuação de vantagem for clara. A pontuação de "vantagem" desta abordagem é literalmente o critério que O3/O5 também usam (uma função só, reaproveitada).

### O5. Squads coordenados (quad) — striker+medic em bloco, ou dismantle+heal
- **Mecanismo:** 2–4 creeps se movem como uma unidade sincronizada (mesma direção, mesmo tick), pra furar rampart/base de outro jogador ou aguentar uma torre inimiga. É o mesmo padrão da dupla striker+medic (D2) escalado, e a base natural pra ofensiva séria depois.
- **Prós:** é o que realmente compete em PvP de verdade; reaproveita D2 (dupla) como o caso-base de 2 unidades — **não é um sistema à parte, é D2 crescendo**.
- **Contras:** de longe o mais complexo daqui — exige um primitivo de "movimento em formação" que não existe hoje (`utils/move.js` é por-creep independente; ver `specs/constitution.md` §5 sobre não duplicar comportamento compartilhado — isso pede um novo módulo, não um hack no `move.js`); caro em CPU (coordenar N creeps por tick); caro em creeps (perder um quad boostado dói); só compensa contra alvo que justifique o investimento.
- **Esforço:** alto. **Mas**: D2 já sai com `memory.partnerId` (ver decisão de D2), então o salto pra quad é generalizar um par pra N, não inventar o conceito do zero.
- **Gate (revisão):** ofensivamente, só contra `targetEnemies` com vantagem — ou, na extensão futura já anotada acima ("montar força pra criar vantagem"), um squad deliberado contra um `targetEnemy` específico.

## Caminho recomendado (confirmado na revisão)

Ordem confirmada — Fase 1 é o próximo passo (`plan.md`/`tasks.md`, quando
pedido):

1. **Fase 1 — agora, baixo risco:** D1 (reordenar corpo) + D4 (rampart/wall
   escalando) — ganho de sobrevida real, mudança pequena e isolada, testa
   fácil offline.
2. **Fase 2 — próxima:** D2 (dupla striker+medic) **desenhada como "grupo
   de N creeps" desde o início** (mesmo que N=2 por enquanto) + D3 (tanque
   atrás do mincut como postura padrão do striker contra melee) + O1
   (mop-up). Isso já entrega a defesa mais forte que o pedido original
   pede, E é a mesma peça que O5 (squad) vai reaproveitar depois — nenhum
   trabalho jogado fora quando chegar a vez do squad.
3. **Fase 3 — ofensiva oportunista, baixo compromisso:** O2 (invader
   core/highway) primeiro (risco quase zero, ROI direto), depois O4 (raid
   oportunista via intel do observer) se O2 se provar útil.
4. **Fase 4 — mais pra frente:** O5 (quad de verdade) e O3 (assédio de
   remote), ambos gateados por `targetEnemies` + vantagem (ver "Política
   de alvo ofensivo"); D5 (boosts/lab) e D6/D7 (safe mode/nuke) entram
   quando houver ameaça real que justifique o investimento — D6 já com o
   gatilho decidido abaixo, D5/D7 represados.

## Decisões da revisão

Resumo das 5 perguntas que estavam em aberto — o detalhe de cada uma está
inline na seção da abordagem correspondente (procure por "Decidido
(revisão)" / "Gate (revisão)"):

1. **Ordem das fases:** confirmada a recomendada — Fase 1 (D1+D4) é o
   próximo passo.
2. **Design do squad (D2/O5):** meio-termo — `memory.partnerId` por creep,
   sem `Memory.squads` novo por enquanto (ver D2).
3. **Política de alvo ofensivo (O3/O4/O5):** conservadora por padrão
   (só defesa/PvE) + lista opt-in `Memory.settings.targetEnemies`, sempre
   gateada por vantagem clara. Retaliação automática e "montar força pra
   criar vantagem" ficam anotadas como extensão futura, fora de escopo
   por agora (ver "Política de alvo ofensivo" acima).
4. **Gatilho de safe mode (D6):** conservador — spawn em risco real
   (ver D6).
5. **Spec de lab/mineral logistics (D5):** represada por enquanto,
   revisitar quando o squad de verdade ou uma ameaça real justificar.

## Constitution check

- **§1 (CPU):** D3/D4 são praticamente grátis (sem pathfinding extra); D2
  é O(creeps de combate), já pequeno; O5 (squad) é o único item aqui com
  risco real de custo de CPU — precisa de profiling antes de generalizar
  além de 2-4 creeps.
- **§3 (fail-soft):** qualquer novo role de combate entra no `guard()` do
  `main.js` como os outros; D6 (safe mode) precisa de um fallback claro
  se `activateSafeMode()` falhar (cooldown ativo, etc.) — não pode travar
  o resto do tick.
- **§4 (testável offline):** D1/D2/D3/D4 testam bem no smoke (corpo, hp,
  posição são determinísticos). O5 (squad) é o mais difícil de testar
  offline — coordenação multi-creep e PathFinder real são difíceis de
  mockar fielmente; provavelmente precisa de um harness de teste dedicado
  quando chegar a vez.
- **§5 (roles finos, sem duplicar):** squad/movimento-em-formação é
  comportamento compartilhado — se acontecer, vira um módulo em
  `utils/` (ex. `utils/squad.js`), chamado pelos roles, não copiado entre
  striker/medic/quad.
- **§6 (config sobre hardcode):** limites de rampart, threshold de safe
  mode, pontuação de alvo ofensivo — tudo isso são candidatos a
  `config.get()`, não literais; `targetEnemies` vive em `Memory.settings`,
  mesmo padrão de `allies`/`hostilePlayers` (0012).
- **§8 (spec antes do código):** revisão concluída, status `ready`. Cada
  fase ainda ganha seu próprio `plan.md`/`tasks.md` antes de codar — este
  spec.md não vira licença pra implementar as 4 fases de uma vez.
