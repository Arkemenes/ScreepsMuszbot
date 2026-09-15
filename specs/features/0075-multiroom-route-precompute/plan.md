# 0075 — multiroom-route-precompute — Plan

Derivado de `spec.md`.

## Approach

Duas mudanças independentes, na mesma feature porque a segunda depende da
primeira existir pra valer a pena:

1. **Default-on:** trocar as duas checagens `if (opts.realRoute)` em
   `utils/routing.js` por `if (opts.realRoute !== false)` — o comportamento
   vira "valida terreno real a menos que o caller peça explicitamente pra
   não validar". Todo caller que já passava `realRoute: true` fica
   inalterado (o valor explícito continua sendo `true`, só que agora
   redundante — removido por limpeza). O único caller de alta frequência sem
   destino fixo (`scout`'s exploração livre) ganha `realRoute: false`
   explícito nas suas duas chamadas.

2. **`opts.allowRoom`:** um predicado opcional `(roomName) => boolean`,
   aplicado como MAIS uma restrição (E lógico) em cima de `avoid`/hostil nos
   quatro pontos que decidem se uma sala é atravessável:
   `findRoute`'s `routeCallback`, `computeRealRoute`'s `roomCallback`,
   `routeCostCallback`'s conjunto `allowed` (inclusive ao adicionar vizinhos
   de folga) e `avoidCostCallback`. Isso permite que `remoteHauler`/
   `remoteMiner` reproduzam a regra "só sala minha/reservada" que
   `remotes.roomCallback` já impunha, agora dentro do módulo de rota
   completo (retreat, validação prévia, tudo) em vez de um `costCallback`
   solto sem nenhuma dessas garantias.

`remoteHauler.js`/`remoteMiner.js` trocam as 3 chamadas de
`creep.moveTo(new RoomPosition(25,25,dest), {..., costCallback:
remotes.roomCallback(dest)})` por
`routing.moveToRoom(creep, dest, {range: 20, reusePath: 30, allowRoom: (name)
=> name === dest || remotes.isMine(name) || remotes.isReservedByMe(name)})`.
`remotes.roomCallback` continua existindo (não é removido — é só que nada
mais o chama depois dessa mudança; mantido porque é uma função pequena e de
uso óbvio, sem custo de manutenção real, mas se `npx grunt`/lint algum dia
acusar código morto, é candidato a remoção numa limpeza separada).

## Modules

### New

Nenhum módulo novo — tudo dentro de `utils/routing.js` (extensão) e ajustes
pontuais em roles existentes.

### Changed

| Path | Change |
|------|--------|
| `src/utils/routing.js` | `opts.realRoute` opt-out em vez de opt-in (2 pontos); novo `opts.allowRoom` aplicado em `findRoute`, `computeRealRoute`, `routeCostCallback`, `avoidCostCallback`. |
| `src/roles/scout.js` | 2 chamadas de exploração livre ganham `realRoute: false`. |
| `src/roles/reserver.js` | remove `realRoute: true` (redundante). |
| `src/roles/raider.js` | remove `realRoute: true` (redundante). |
| `src/roles/pioneer.js` | remove `realRoute: true` nas 3 chamadas (redundante). |
| `src/utils/squad.js` | remove `realRoute: true` nas 2 chamadas (redundante). |
| `src/roles/remoteHauler.js` | 2 chamadas de `creep.moveTo` viram `routing.moveToRoom` com `allowRoom`. |
| `src/roles/remoteMiner.js` | 2 chamadas de `creep.moveTo` viram `routing.moveToRoom` com `allowRoom`. |
| `test/smoke.js` | novas assertions (AC1-AC4). |

## Data shapes

Nenhuma chave nova de `Memory`/heap/segment — `opts.allowRoom` é uma função
passada por chamada, nunca persistida; o cache de rota existente
(`creep.memory._realRoute` etc., já documentado em `utils/routing.js`)
continua igual.

## How it satisfies the constitution

- **CPU:** ver "Constitution check" do `spec.md` — o único caller de alta
  frequência sem destino fixo opta por `realRoute: false`; o resto já pagava
  esse custo ou é uma viagem curta de 1 hop.
- **Memory:** nenhuma mudança.
- **Fail-soft:** `computeRealRoute` retornando `null` continua caindo pro
  fallback `findRoute()`-based existente, sem mudança de comportamento nesse
  caminho.
- **Offline test:** `test/smoke.js` ganha um cenário que chama
  `routing.moveToRoom` sem `realRoute` e confirma que `_realRoute` foi
  populado; um cenário com `realRoute: false` confirmando que não foi; e um
  cenário com `allowRoom` restringindo `findRoute`/`computeRealRoute` a um
  subconjunto de salas.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Rodar `computeRealRoute` a mais em algum caller esquecido pode gastar CPU sem necessidade | Escopo revisado: todo caller atual já é ou de baixa frequência (viagem de role, não por tick) ou já usava a flag; o único de alta frequência (`scout` free-roam) opta out explicitamente. |
| `allowRoom` mal implementado deixando `remoteHauler`/`remoteMiner` atravessarem sala não-permitida | AC3/AC4 cobertos por assertion dedicada no smoke test, replicando o cenário que `remotes.roomCallback` já tinha. |
| `remoteHauler`/`remoteMiner` ganharem overhead de retreat/backtrack desnecessário pra uma viagem de 1 hop | Aceito — o mecanismo de retreat já é barato (só dispara em `ERR_NO_PATH` real) e é exatamente a proteção que faltava pro caso de labirinto interno na sala remote. |

## Rollback

Reverter via `git revert` no commit desta feature. Caso só o default-on
precise ser desfeito em produção sem reverter tudo, qualquer caller pode
voltar a opt-out passando `realRoute: false` explicitamente — não exige
mudança em `utils/routing.js`.
