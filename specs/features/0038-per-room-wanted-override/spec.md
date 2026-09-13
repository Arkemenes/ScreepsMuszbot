# 0038 — Per-room wanted override

- **Status:** done
- **Depends on:** 0015, 0012

## Problem

`rooms/needs.js`'s `roomNeeds(room)` decide a contagem-alvo de cada role a
partir de fórmulas fixas (RCL, storage, backlog de canteiro, etc — ROADMAP
0015). Numa sala nova onde tudo já foi construído (sem canteiro) e os
containers/storage estão cheios e sobrando, a fórmula do `upgrader` já sobe
até 4 sozinha *acima* de `storageEnergy > 400000`, mas abaixo disso (ou numa
sala onde o gargalo é outro — containers cheios sem storage grande o
bastante, por exemplo) ela fica presa em 1 mesmo com energia excedente e
nada para construir. Não existe jeito de ajustar manualmente a contagem de
um role numa sala específica sem editar código — 0012 deixou "overrides de
config por sala" fora de escopo de propósito.

## Desired outcome

Uma sala pode ter a contagem-alvo de qualquer role sobrescrita manualmente
via console, sem redeploy. O override é por sala e por role, vale até ser
removido manualmente (sem expiração automática — o jogador decide quando
reverter, ex.: quando canteiros voltarem a aparecer). `roomNeeds(room)`
aplica o override por cima do valor calculado, então toda a cadeia
(`role.wanted` → `role.spawn` → fila de spawn → `idealPopulation`) já
funciona sem mudança em nenhum role individual — o mesmo motivo que 0015
centralizou tudo num único `compute()`.

## In scope

- `Memory.rooms[roomName].wantedOverride = { role: count }` — chave por
  role (mesmas chaves que `roomNeeds` já retorna), valor um inteiro ≥ 0.
- `rooms/needs.js`'s `compute()` aplica o override por cima do resultado
  calculado, por role, antes de cachear/retornar. Role sem entrada no
  override não muda. Valor inválido (não-número, role desconhecido) é
  ignorado silenciosamente (constitution §3 — nunca lança).
- Console: `setWanted(roomName, role, count)` seta um override;
  `clearWanted(roomName, role?)` remove um role específico, ou todos se
  `role` for omitido; `listWanted(roomName?)` mostra overrides ativos
  (de uma sala, ou de todas). Entradas em `help()`.

## Out of scope

- Expiração automática / auto-revert do override (ex.: voltar sozinho
  quando canteiros aparecerem) — o pedido original é justamente controle
  manual: sobe quando sobra energia parada, desce quando `builder` volta a
  ter trabalho. Automatizar isso é um passo futuro se o ajuste manual se
  provar repetitivo demais.
- Overrides de config gerais por sala (thresholds do `config.js`,
  `hauler.maxCountNoLinks`, etc) — só a contagem-alvo de role, que é o
  problema relatado. Config por sala genérico continua fora de escopo
  (0012).
- Validação de "esse override faz sentido pro RCL/energia atual" — é uma
  ferramenta manual, o jogador decide.

## Acceptance criteria

1. `setWanted("W1N1", "upgrader", 4)` seguido de `roomNeeds(room).upgrader`
   retorna `4` mesmo com storage vazio (onde a fórmula sozinha daria `1`).
   *(smoke asserta)*
2. `clearWanted("W1N1", "upgrader")` faz `roomNeeds(room).upgrader` voltar a
   refletir a fórmula normal no próximo tick. *(smoke asserta)*
3. Um role sem override não muda; overrides de roles diferentes na mesma
   sala coexistem. *(smoke asserta)*
4. Override com role inexistente ou valor não-numérico não lança e não
   afeta nenhum role real. *(smoke asserta)*
5. `listWanted(roomName)` e `clearWanted(roomName)` (sem role) funcionam
   sobre múltiplas entradas. *(smoke asserta)*
6. `help()` lista os três comandos novos.
7. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§6:** config/tunable por sala é dado, não literal — mora em
  `Memory.rooms[name].wantedOverride`, no mesmo espírito de `Memory.settings`
  (0012) mas por sala, já que é exatamente esse o gap que 0012 deixou aberto.
- **§3:** `compute()` nunca lança por causa de um override malformado —
  ignora silenciosamente o que não bate com uma chave/tipo válida.
- **§1/§2:** nenhuma varredura nova; `wantedOverride` é um objeto pequeno,
  só a sala que usa a feature paga o custo (poucos bytes em
  `Memory.rooms[name]`).
- **§5:** a lógica continua inteira em `rooms/needs.js` — nenhum role
  precisa saber que overrides existem, mesmo princípio de 0015 (um lugar só
  decide a população).

## Outcome

Entregue. `rooms/needs.js` ganhou `ROLE_NAMES` (lista das chaves que
`compute()` retorna) e `applyOverride(name, wanted)`, chamada por cima do
`return` de `compute()` — lê `Memory.rooms[name].wantedOverride`, aplica
só chave conhecida com valor numérico, ignora o resto em silêncio. Console
`setWanted(roomName, role, count)` (valida role/count antes de gravar),
`clearWanted(roomName, role?)` (um role ou todos), `listWanted(roomName?)`
(uma sala ou todas) — registrados em `help()`. Validado pelo smoke: override
sobrepõe a fórmula, dois overrides na mesma sala coexistem, role
desconhecido/valor não-número não afeta nada, `clearWanted` com e sem role
reverte corretamente. `node --check` limpo, `npx grunt` builda, smoke
inteiro verde.
