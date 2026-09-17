# 0091 — Política global de tiers para recursos e ações — Plan

Derivado de `spec.md`. A revisão da spec definiu a política global e os limites do escopo inicial; a implementação agora foca na camada de estado econômico e na migração gradual dos consumidores que ainda dependem das regras locais.

## Approach

A implementação usa uma API pequena em `src/utils/resourceTiers.js` para calcular o estado da sala (`critical` / `stable` / `abundant`), o motivo dominante e o número de consumidores críticos conhecidos. Em seguida, os consumidores que já tinham lógica local — `hauler`, `remoteHauler` e `bootstrap` — passam a consumir essa API como um guard, sem reescrever suas ações principais. A camada de prioridade também fica em `src/utils`, com `pick()` declarativo e sem efeitos colaterais, para manter os critérios de desempate centrados e testáveis offline.

A estratégia é migrar gradualmente os consumidores mais problemáticos e deixar o restante dos subsistemas do código intacto até que o estado econômico novo seja validado no smoke. Isso reduz risco de regressão e mantém a Constituição: CPU com cache por sala/tick, Memory pequeno, fail-soft e `guard()` em `main.js` preservados.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/resourceTiers.js` | Estado econômico por sala, motivo dominante, piso de reserva e seleção de candidatos por tier/prioridade. |
| `src/utils/priority.js` | API `pick(candidates)` declarativa para ordenação por `tier`, `priority` e `allowed`. |

### Changed

| Path | Change |
|------|--------|
| `src/roles/hauler.js` | Evita `mineralJob` quando há consumidor crítico; mantém a cascata local compatível com a nova política global. |
| `src/roles/remoteHauler.js` | `pickDeliver()` considera a criticidade da sala-mãe antes de entrar em `storage`/consumidores satisfatórios. |
| `src/roles/bootstrap.js` | Dá preferência para consumidor crítico antes de link/container e mantém o fallback para energia física. |
| `src/utils/stats.js` | Expõe `Memory.stats.rooms[name].economyState`, `.economyReason` e `.criticalConsumers`. |
| `test/smoke.js` | Assertions para tier, desempate, reserva e preempção. |

## Data shapes

`Memory.stats.rooms[name]` adiciona:

```js
{
  economyState: "critical" | "stable" | "abundant",
  economyReason: "spawn" | "controller" | "defense" | "reserve" | "none",
  criticalConsumers: 0,
}
```

Toda lógica de decisão vive no heap e usa `Memory.rooms[room.name]` somente para sinais persistentes já existentes (`defenseActive`, `storage`, `controller`, `settings`). Não há objeto de jogo em `Memory`.

## How it satisfies the constitution

- **CPU:** uma avaliação por sala/tick, reuso dos caches existentes (`roomCache`, `census`, `config.get`), sem `room.find` novo por creep. A seleção `pick()` é uma ordenação pura em memória.
- **Memory:** somente os campos pequenos e observáveis em `Memory.stats`; candidatos e rankings ficam no heap.
- **Fail-soft:** todas as funções de estado e seleção verificam ausência de `storage`, controller e estruturas antes de acessar propriedades, sem lançar.
- **Offline test:** `test/smoke.js` cobre estado crítico/estável/abundante, `pick()`, reserva emergencial, preempção de jobs e `Memory.stats` determinístico.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Regra local de consumidor divergir da global | A API global fica centralizada em `resourceTiers` e os calls locais só montam candidatos; a regra local continua sendo a ação final, não a decisão de prioridade. |
| Estado econômico flutuar a cada tick sem motivo estável | A função calcula um motivo dominante (`spawn`, `controller`, `defense`, `reserve`, `none`) e deixa o critério explícito para depuração/monitoramento. |
| `Storage` ausente em salas novas | Todas as funções retornam `false`/fallback seguro quando não existe `room.storage`, sem quebrar a tick. |

## Rollback

Se a nova política vier a causar regressão, o rollback é simples: desligar o uso de `economyState`/`pick()` nos consumidos migrados e deixar a cascata antiga em vigor, mantendo `Memory.stats` com campos extras de leitura apenas. A lógica de reserva e a API declarativa ficam isoladas em `src/utils`, então a reversão não exige reescrever os roles principais.
