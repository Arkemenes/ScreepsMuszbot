# 0009 — Scout hardening — Tasks

Ordenadas. Cada tarefa é pequena, verificável de forma independente, e termina
num check. Referencie critérios de aceitação como `(AC#)`.

- [x] 1. `utils/move.js`: `findPath()` devolve `{path, incomplete}`;
      `travel()` retorna `ERR_NO_PATH` quando `result.incomplete` é `true`,
      antes de cachear o caminho.
  - verify: `node --check src/utils/move.js`
- [x] 2. `utils/config.js`: adicionar `scout: { blacklistTicks: 5000 }` aos
      defaults.
  - verify: `node --check src/utils/config.js`
- [x] 3. `roles/scout.js`: reescrever o bloco de exploração livre para usar
      `routing.moveToRoom` em vez do cálculo manual de tile de borda; remover
      `creep.memory.target`; adicionar `isBlacklisted()`/`blacklistRoom()` e
      usá-los na reseleção (pular sala em blacklist) e no tratamento de
      `ERR_NO_PATH`/`ERR_INVALID_TARGET` (blacklistar antes de limpar
      `targetRoom`). (AC3, AC5)
  - verify: `node --check src/roles/scout.js`
- [x] 4. `test/smoke.js`: nova seção de teste pro scout de exploração livre —
      cria um scout numa sala com 2 saídas conhecidas, roda `scout.run` e
      asserta que o `moveTo` disparado (via `routing.moveToRoom` →
      `creep.moveTo`) mira uma posição com `roomName` igual à sala-alvo, não a
      sala atual (AC3).
  - verify: `node test/smoke.js` verde
- [x] 5. `test/smoke.js`: assertar que `travel()` devolve `ERR_NO_PATH` quando
      `PathFinder.search` é sobrescrito pra devolver `{path: [...], incomplete: true}`
      num repath (AC4).
  - verify: `node test/smoke.js` verde
- [x] 6. `test/smoke.js`: assertar que uma sala com `scoutBlacklistUntil` no
      futuro é pulada na reseleção (o scout escolhe a outra saída disponível
      mesmo com `lastVisit` mais antigo) (AC5).
  - verify: `node test/smoke.js` verde
- [x] 7. `npx grunt` builda `dist/main.js`; atualizar `ROADMAP.md` (0009 →
      `done`) e a linha da "Fila atual" que menciona 0009 como candidato.
- [x] 8. Achado em produção logo após o item 7 (usuário reportou com
      screenshot: scout parado na borda de um beco-sem-saída, entrando e
      saindo sem parar): `roles/scout.js` ganha `creep.memory.cameFrom`; a
      reseleção exclui `cameFrom` das candidatas e, se sobrar só ele,
      blacklista a sala atual antes de recuar (AC6).
  - verify: `node --check src/roles/scout.js`
- [x] 9. `test/smoke.js`: novo bloco de teste — sala com uma única saída
      conhecida que é um beco-sem-saída; assertar que o scout entra nela, ao
      constatar que não há nada novo blacklista-a e recua, e que de volta ao
      hub escolhe uma sala nova em vez do beco-sem-saída (AC6).
  - verify: `node test/smoke.js` verde
- [x] 10. `npx grunt` builda `dist/main.js` de novo.

## Notes

- Achado durante a investigação (screenshot do usuário: scout parado perto de
  uma área murada): o bug real não era só "sem blacklist" (o único item que
  sobrava no spec original) — era que a exploração livre nunca conseguia
  cruzar a borda de sala nenhuma, com ou sem bolsão. O `range: 1` default do
  `utils/move.js`'s `travel()` fazia o scout parar sempre um tile antes do
  tile de borda que ele mesmo calculava. Ver `spec.md` pro detalhe completo.
- A solução acabou mais simples que a spec original previa: em vez de somar
  mais lógica de borda (`range: 0` + andar mais um passo manualmente), a
  exploração passou a reusar `utils/routing.moveToRoom` — o mesmo caminho já
  usado por sign/layout — que delega o cruzamento pro `moveTo` nativo. Isso
  também tornou `creep.memory.target` (x/y) desnecessário.
