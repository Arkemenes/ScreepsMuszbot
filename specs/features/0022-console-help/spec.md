# 0022 — Console help()

- **Status:** done

## Problem

Vários módulos registram comandos de console (`global.X = ...`) espalhados
pelo código — `replanRoom`/`destroyUnplannedRoads`/`testSpawnPosition`
([architect.js](../../../src/rooms/architect.js)),
`prioritizeBuild`/`clearBuildPriority`
([builder.js](../../../src/roles/builder.js)), `addAlly`/`removeAlly`
([hostiles.js](../../../src/utils/hostiles.js)),
`signRoom`/`signQueue` ([scout.js](../../../src/roles/scout.js)),
`GCStructureMemory` ([memory.js](../../../src/utils/memory.js)). Não existe
lugar nenhum pra lembrar o que dá pra digitar no console do jogo.

## Desired outcome

Uma função `help()` no console que lista todos os comandos disponíveis,
agrupados por assunto, com a assinatura e uma descrição curta de uma linha.

## In scope

- `global.help()` — imprime a lista via `console.log`, agrupada em seções
  (Planejamento de sala, Fila de construção, Aliança, Scout, Manutenção).
- Novo `src/utils/console.js`, `require`ido (efeito colateral) por
  `utils/index.js` — assim `help()` sempre existe, independente de qual role
  já rodou naquele tick.

## Out of scope

- Descobrir comandos automaticamente (introspecção de `global`) — a lista é
  mantida à mão; um comando novo precisa ser adicionado aqui também.
- Ajuda por tópico (`help("scout")`) — só a lista completa por enquanto.

## Acceptance criteria

1. `help()` existe em `global` assim que o bot carrega. *(smoke)*
2. A saída menciona todos os comandos hoje registrados
   (`replanRoom`, `destroyUnplannedRoads`, `testSpawnPosition`,
   `prioritizeBuild`, `clearBuildPriority`, `addAlly`, `removeAlly`,
   `signRoom`, `signQueue`, `GCStructureMemory`). *(smoke)*

## Constitution check

- **§1/§2:** zero custo em tick normal — só roda quando chamado a mão do
  console; não toca Memory.
- **§4:** coberto por assertion de smoke (existência + conteúdo da saída).

## Outcome

Entregue. `src/utils/console.js` define `global.help()`; `utils/index.js`
o `require`ia por efeito colateral. Lista mantida à mão (comentário no topo
do arquivo lembra de atualizar ao adicionar/remover um comando). Validado
pelo smoke (117 assertions no total, 2 novas: `help` é uma função em
`global`, a saída cita os comandos conhecidos) + `npx grunt`.
