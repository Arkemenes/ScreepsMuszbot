# Plano — 0083 Rampart pública no pathing multi-room

## Módulos tocados

- `src/utils/routing.js`: matriz estrutural específica do pathing multi-room,
  cacheada no heap e usada pelos três callbacks de passabilidade.
- `test/smoke.js`: fixtures e assertions para wall, rampart privada e
  rampart pública.
- `specs/ROADMAP.md`: status e resumo da feature.
- `specs/ARCHITECTURE.md`: registrar a distinção entre as políticas de
  estrutura intra-room e multiroom, se necessário após a implementação.

## Dados e cache

A matriz multiroom será cacheada por nome de sala e por uma versão derivada da
quantidade de estruturas conhecidas. Ela usará `roomCache.structures(room)` e
não guardará objetos de jogo em `Memory`. Somente `STRUCTURE_WALL` e
`STRUCTURE_RAMPART` privada serão marcadas como `255`.

## Riscos

- Reutilizar `move.roomMatrix()` perpetuaria a política intra-room e manteria
  rampart pública de terceiro válida apenas por acidente ou inválida em outros
  casos.
- A cache precisa invalidar quando a composição/quantidade de estruturas muda.
- O smoke existente contém alterações locais; as assertions novas devem ser
  adicionadas sem reverter esse trabalho.

## Aderência à constituição

- Uma chamada de `room.find` por `(room, type, tick)` via `roomCache`.
- Dados derivados ficam no heap.
- Toda mudança comportamental tem assertion no smoke.
- Nenhum role ganha lógica de pathing.

## Ordem de implementação

1. Adicionar a matriz multiroom e trocar `knownStructureMatrix()` para usá-la.
2. Adicionar teste explícito para os três tipos de estrutura e fallback sem
   visão.
3. Rodar `node --check`, smoke e `npx grunt`.
4. Atualizar arquitetura e marcar a feature como `done` após validação.
