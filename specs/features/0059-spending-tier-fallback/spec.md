# 0059 — Universal critical→healthy→optimal spending fallback

- **Status:** ready
- **Owner:** usuário
- **Created:** 2026-09-13

## Problem

Várias decisões de "onde gastar um recurso" no código (`hauler.pickDeliver`,
`rampartRepair.worthHardening`, `structures/link.js`'s `pickTarget`,
`structures/tower.js`, `roles/builder.js`, `rooms/spawning.js`) já resolvem
em faixas — **crítico** (precisa agora, incondicional), **saudável/
satisfatório** (vale a pena, sem gate de reserva) e **ótimo/ideal** (só topar
mais enquanto sobra reserva) — mas essa disciplina nunca foi um princípio
formal da constitution, só um padrão que foi se repetindo spec a spec (0032,
0043, 0054). Sem o princípio escrito, nada garante que uma cascata nova (ou
uma faixa "propositalmente pulada" numa já existente) tenha um caminho de
volta quando nada mais reivindica o recurso naquele tick.

Isso já causou um bug real, corrigido nesta sessão antes desta spec existir:
`roles/hauler.js`'s `pickDeliver()` deixava uma torre entre `criticalRatio`
(50%) e `satisfactoryRatio` (80%) de fora das duas faixas de entrega de
propósito (nem crítica, nem "vale completar") — mas sem nenhum fallback, um
hauler cheio ficava parado do lado da torre indefinidamente sempre que nada
mais no cascade (spawn/ext, storage, lab, container do controller) também
precisasse da energia. O usuário reportou observando exatamente isso em jogo
(hauler parado cheio ao lado de uma torre).

Uma auditoria do restante do código (`roles/*`, `structures/*`, `rooms/*`,
`utils/*`) encontrou um segundo lugar com a mesma lacuna, mais discreto:
`roles/remoteHauler.js`'s `pickDeliver()` só considera `storage` e depois
`spawn`/`extension` — nunca torre nem lab — então numa sala-mãe sem storage
(RCL baixo) com spawn/extensions cheios mas uma torre com espaço livre, o
remoteHauler volta pra casa e fica parado cheio em vez de topar a torre,
exatamente o mesmo padrão do bug do hauler local.

## Desired outcome

A regra "gasta no crítico, depois no saudável, depois no ótimo — e, faltando
tudo isso, no que sobrar antes de ficar ocioso com capacidade disponível" é
um princípio nomeado da `constitution.md`, com uma nota explícita de que a
**coleta** (harvest, regen de source/mineral, cooldown de lab/link) fica de
fora — ela já tem limite físico próprio e não precisa (nem deveria) ser
forçada nessa mesma cascata. Toda spec futura que introduzir uma cascata de
gasto é checada contra esse princípio na revisão. `roles/remoteHauler.js`
ganha o mesmo fallback de última instância que `roles/hauler.js` já tem: uma
torre com capacidade livre, quando nada mais no cascade precisa da energia.

## In scope

- Novo princípio na `constitution.md` (crítico → saudável → ótimo, sempre
  com fallback; coleta isenta).
- `roles/remoteHauler.js`'s `pickDeliver()` ganha um fallback pra torre (com
  capacidade livre) depois de `storage` e `spawn`/`extension`.
- Assertion nova no smoke test cobrindo esse fallback.

## Out of scope

- Reabrir o fix do `roles/hauler.js` (já implementado e testado antes desta
  spec — ver `ROADMAP.md` 0054/hauler dead-zone fix, commit desta sessão).
- `roles/miner.js`'s `distribute()`: a auditoria encontrou uma janela teórica
  (sala nova, sem container ainda, miner já com `CARRY`, torre acima da
  reserva, sem link) onde energia excedente não tem pra onde ir via
  `transfer()` — mas o próprio motor derrama esse excedente no chão quando o
  `CARRY` do miner enche e não há container, então um hauler recolhe depois;
  não é uma unidade ficando ociosa com capacidade real disponível, é o lado
  da **coleta** com limite físico (a mesma isenção que este spec documenta),
  então fica de fora.
- Qualquer outra cascata revisada pela auditoria e já classificada como OK
  (`upgrader`, `bootstrap`, `builder`, `tower`, `link`, `spawning`,
  `rampartRepair`) — nenhuma delas tinha a lacuna.

## Acceptance criteria

1. `specs/constitution.md` ganha um princípio novo (crítico → saudável →
   ótimo, com fallback; coleta isenta), referenciando este spec.
2. `roles/remoteHauler.js`'s `pickDeliver()` retorna uma torre com
   `getFreeCapacity(RESOURCE_ENERGY) > 0` quando `storage` e `spawn`/
   `extension` não qualificam — smoke test assert
   `"remoteHauler tops off a tower when storage and spawn/extension are both full (ROADMAP 0059)"`.
3. `node --check` limpo em todo arquivo tocado.
4. `node test/smoke.js "$(pwd)"` verde com a assertion do item 2.
5. `npx grunt` builda `dist/main.js`.
6. `ROADMAP.md` ganha a linha `0059` com status `done`.

## Constitution check

- **Fail-soft (princípio 3):** o fallback nunca lança — só mais um
  `findClosestByPath`/`findClosestByRange` que pode devolver `null`, mesmo
  tratamento que o resto do cascade já tem.
- **Testável offline (princípio 4):** a assertion nova roda sob
  `test/smoke.js`, sem servidor.
- **Roles finos (princípio 5):** o fallback fica em `pickDeliver()`, mesmo
  módulo/role que já hospeda o resto do cascade — nada novo em `utils/`.
- Esta própria spec é a "emenda" que o princípio 8 (spec before code) e o
  meta-texto do topo da `constitution.md` exigem para alterar a constitution.

## Open questions

Nenhuma — escopo confirmado com o usuário (documentar o princípio **e**
auditar/corrigir o código existente).
