# 0159 — RoomVisual v2

- **Status:** done (local)
- **Owner:** Codex / ARK-182
- **Created:** 2026-10-18

## Problem

`src/utils/visual-room.js` contém a implementação antiga de RoomVisual, sem
versão/origem registrada. O upstream publicou v2.0.0 em 2026-10-10 e o usuário
solicitou substituir as referências locais pela versão atualizada.

## Desired outcome

O bot carrega o build oficial Screeps v2.0.0 pelo ponto de entrada existente.
Os previews do architect continuam desenhando estruturas com opacidade 0.15;
os métodos públicos atualizados ficam disponíveis em `RoomVisual.prototype`.
A origem, revisão e licença acompanham a cópia distribuída no bundle.

## In scope

- Substituir a implementação vendorizada pelo asset oficial `RoomVisual.js`.
- Preservar `utils/index.js` → `./visual-room` e a integração CommonJS/Grunt.
- Registrar versão, revisão, hash do asset original e licença MIT.
- Validar os consumidores e contratos públicos no smoke offline.

## Out of scope

- Alterar política/cadência de visuais, layout ou planejamento da cidade.
- Migrar o projeto para TypeScript, ESM ou outro empacotador.
- Publicar/ativar o bot em jogo ou alterar outros pacotes locais pendentes.

## Acceptance criteria

1. A cópia deriva de v2.0.0, commit
   `874f8b9beac09e215a9d8939857471282018a4b0`, e identifica a licença MIT.
   Asset original: SHA256
   `1599a777355065d9c1077dc14a1ba0254fe095c4807f6486ed69d9e789f14e6a`.
2. O smoke verifica `0159: register installs the public RoomVisual methods`
   e `0159: planned structures preserve preview opacity and chaining`.
3. O smoke verifica `0159: road connections stay isolated per visual`,
   `0159: resources reject unknown types without drawing` e
   `0159: symbol badges scale by radius without SYMBOLS`.
4. `node --check` passa nos arquivos JS tocados, o smoke completo passa e
   `npx grunt` produz `dist/main.js` incluindo a implementação e licença.

## Constitution check

- CPU/Memory: preserva os gates de visualização; nenhum scan de Game ou dado
  persistente novo. Caches internos do upstream ficam no heap.
- Fail-soft: não muda o fluxo de subsistemas nem os guards existentes.
- Offline: testes exercitam o registro e as chamadas usadas pelo bot.

## Review

Escopo conferido contra o pedido explícito de atualização e a documentação
oficial: usar o asset Screeps evita migração do empacotador e mantém a API
pública consumida. Não foram encontrados consumidores dos helpers privados
removidos na v2. Sem ambiguidades de implementação pendentes.

## Sources

- https://github.com/screepers/RoomVisual/releases/tag/v2.0.0
- https://github.com/screepers/RoomVisual/releases/download/v2.0.0/RoomVisual.js
- https://github.com/screepers/RoomVisual/tree/874f8b9beac09e215a9d8939857471282018a4b0
