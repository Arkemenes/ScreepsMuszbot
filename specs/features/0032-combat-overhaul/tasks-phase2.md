# 0032 — Combat overhaul — Tasks (Fase 2: D2 + D3 + O1)

Derivado de `plan-phase2.md`.

- [x] 1. `utils/combat.js`: migrar de `defender.js` — `KITE_RANGE`,
      `threatPriority`, `pickTarget(room)` (era `getTarget`), `shoot`,
      `patch`, `kiteAwayFrom`. Exportar todas.
  - verify: `node --check`
- [x] 2. `roles/defender.js`: encolher pra usar as funções migradas de
      `combat.js`. Comportamento idêntico ao de hoje.
  - verify: `node --check`; suite da Fase 1 (corpo/etc) continua verde
    sem alteração
- [x] 3. `roles/defenderStriker.js` (novo): corpo `RANGED_ATTACK`-heavy
      sem `HEAL`, `MOVE` por último. Pareamento (`memory.partnerId`) com
      `defenderMedic` via `census`. D3 (segurar rampart própria mais
      perto contra melee, cair pra kite se não achar ou se a brecha
      deixar o melee chegar mesmo assim). O1 (perseguir hostil ferido
      dentro de `defender.mopUpRange` quando não sobra hostil armado).
      Sem parceiro: kite/tiro como o `defender` solo (sem self-heal -
      striker não tem `HEAL` no corpo).
  - verify: `node --check`
- [x] 4. `roles/defenderMedic.js` (novo): corpo `HEAL`-heavy sem
      `RANGED_ATTACK`, `MOVE` por último. Pareamento com
      `defenderStriker`. Segue o parceiro a alcance 1–3
      (`creep.moveTo(partner, {range:2})` quando > 3), cura via
      `combat.patch` (self primeiro, depois aliado ferido mais perto -
      normalmente o parceiro). Sem parceiro: só cura.
  - verify: `node --check`
- [x] 5. `roles/index.js`: registrar `defenderStriker`/`defenderMedic`
      logo após `defender`.
  - verify: `node --check`
- [x] 6. `utils/config.js`: `defender.pairEnergyThreshold` (500),
      `defender.mopUpRange` (10).
  - verify: `node --check`
- [x] 7. `rooms/needs.js`: `usePairs =
      room.energyCapacityAvailable >= config.get("defender.pairEnergyThreshold", 500)`.
      `defender` zera quando `usePairs`; `defenderStriker`/`defenderMedic`
      = mesma fórmula de contagem de hoje (`min(maxCount, hostiles+1)`)
      só quando `usePairs`, `0` senão.
  - verify: `node --check`; novas assertions no smoke (alterna conforme
    `energyCapacityAvailable`)
- [x] 8. Cobertura no smoke: pareamento fecha dos dois lados; corpo dos
      dois roles (contagem/ordem); striker segura em rampart própria
      contra melee a alcance > 1; striker foge quando o melee alcança
      mesmo em cima da rampart (e no campo aberto, pra contraste); mop-up
      fecha em alcance 1 num alvo ferido e mantém KITE_RANGE num alvo
      saudável; medic segue o parceiro; `needs.js` alterna `defender` vs
      par pela energia.
  - verify: `node test/smoke.js` verde
- [x] 9. `npx grunt`; atualizar `specs/ARCHITECTURE.md` (roles novos,
      `combat.js` migrado) e `specs/ROADMAP.md` (Fase 2 done).

## Notes

Entregue, com três desvios do plano descobertos durante a implementação
(documentados inline no código onde se aplicam):

- **Medic não usa `takeCover()`.** O plano original previa reaproveitar
  `utils/combat.takeCover()` (já que o medic não tem `ATTACK`/
  `RANGED_ATTACK`, contaria como não-combatente). Na prática isso é um bug:
  `takeCover` dá um raio de segurança de `safeRange` (5 tiles, default) de
  qualquer ameaça — exatamente a distância em que o medic *precisa* estar
  pra curar o parceiro em combate de verdade. Reusar teria feito o medic
  fugir do próprio combate que deveria sustentar. Corrigido pra uma
  checagem própria: só foge quando um hostil melee está **adjacente** a
  ele mesmo (perigo real e imediato), não a uma "boa distância" genérica.
- **O1 (mop-up) reduzido a perseguição na mesma sala.** A spec original
  não distinguia isso, mas perseguir um hostil que fugiu pra uma sala
  vizinha exigiria visão da sala vizinha, limite de tempo/distância, e
  risco de emboscada em território desconhecido - bem além de "trivial".
  Implementado como: quando não há ameaça de melee (ou já protegido por
  rampart), um alvo **ferido** dentro de `defender.mopUpRange` da spawn é
  perseguido até alcance 1 pra terminar o serviço, em vez de só segurar
  `KITE_RANGE` pra sempre; um alvo saudável continua só sendo segurado a
  distância, como o `defender` de sempre.
- **Corpo do striker/medic escala por unidade de custo** (`RANGED_ATTACK+
  MOVE`=200 / `HEAL+MOVE`=300 por par), não por faixas fixas de energia
  como o `defender` solo - mais simples de manter proporção 1:1 em
  qualquer `energyCapacityAvailable`, tetado em 25/16 pares (dentro do
  limite de 50 parts).

Validado pelo smoke (275 assertions no total - 11 novas: alternância
`needs.js` por energia, corpo dos dois roles, pareamento, D3 (segura vs.
foge, incluindo o caso de brecha), O1 (fecha em ferido vs. segura em
saudável), e o medic seguindo o parceiro) + `npx grunt`.
