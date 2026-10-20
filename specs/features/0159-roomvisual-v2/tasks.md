# 0159 — RoomVisual v2 — Tasks

- [x] 1. Conferir release/revisão, consumidores e hash do asset oficial (AC1).
  - verify: v2.0.0 / `874f8b9`; SHA256 igual ao digest da release.
- [x] 2. Substituir cópia vendorizada e incluir licença MIT (AC1, AC2).
  - verify: `node --check src/utils/visual-room.js`; smoke de registro.
- [x] 3. Integrar regressões públicas no smoke (AC2, AC3).
  - verify: `node --check test/roomVisualCases.js`; smoke completo verde.
- [x] 4. Gerar/verificar bundle local, atualizar docs e grafo (AC4).
  - verify: `npx grunt`, bundle carrega os métodos, `graphify update .`.
- [x] 5. Concluir ARK-182 com revisão e resultados da validação.

## Validation

2026-10-18: `node --check` limpo nos três arquivos JS tocados. Smoke completo
verde (12.686 assertions). Grunt combina 130 módulos em `dist/main.js`; cópia
para o cliente desabilitada no processo. Bundle carregado com globals do
harness: métodos registrados, container desenhado com opacidade 0.15 e licença
MIT preservada. Payload após o banner coincide com SHA256 do asset oficial.
Sem commit/publicação nem verificação visual em jogo.
`graphify update .` concluído: 5.529 nodes / 11.106 edges; somente AST, sem LLM.
