# 0156 — CPU: lógica restante — Tasks

Para cada item: spec do item nas Notes, referência em `test/`, flag, um deploy, validação pelo `cpuReport`, invariantes.

- [ ] 1. `decisionCache.js` (assinatura, tamanho limitado, invalidação por reset, contadores)
  - verify: smoke `"0156: the cache invalidates on any input change and on reset, and never by time"`
- [ ] 2. **L4** `intel`/`transitSafety` por (sala, tick de visão) e hostilidade; segurança sem atraso (AC1, AC2)
  - verify: smoke `"0156: intel results are identical with and without the cache under fuzzed hostiles"`
- [ ] 3. **L2** `listResidual` ocioso por assinatura; reprice e confirmação no tick certo (AC1, AC2)
  - verify: smoke `"0156: listing decisions, prices, fees and intents are identical under fuzz"`
- [ ] 4. **L3** `assignments`/`resolve`/`profile` por assinatura com fuzz de cada entrada (AC1, AC2)
  - verify: smoke `"0156: labPolicy decisions are identical under fuzz; each input invalidates the cache"`
- [ ] 5. Validar cada item em produção (flag ligada; spans-alvo e `warm` do `cpuReport` automático; reverter a flag se piorar) e anotar nas Notes (AC3)
- [ ] 6. **L6** picos: espalhar o scan do swing e orçamentar `miner.distribute`
  - verify: smoke de equivalência do resultado; `cpuTop` mostra o pico menor
- [ ] 7. **L7** partida a frio: hidratação preguiçosa e orçamento global
  - verify: `cpuReport` mostra `cold tick` menor; sem perda de estado restaurado
- [ ] 8. **O3** remover spans temporários (`claims.*`, `fuel.plan.*`, `swing.scan.*`) e, após deploy com `removed = 0`, o `memoryCleanup`
- [ ] 9. DoD: `node --check`, smoke, `graphify update .`, `npx grunt` por item; invariantes (AC4); `ROADMAP.md`/`ARCHITECTURE.md`

## Notes

- Hit-rates dos probes (96,5–99,1% e 92%) são limites superiores; o ganho real aparece nos spans do `cpuReport`.
