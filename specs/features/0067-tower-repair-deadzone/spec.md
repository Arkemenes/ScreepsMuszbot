# 0067 — Fecha a zona morta entre o refill da torre e o gate de reparo

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-14

## Problem

Usuário reportou (2026-09-14) estruturas destruídas por falta de reparo e
pediu análise das três causas possíveis: energia, logística, ou thresholds
baixos. Investigação (`structures/tower.js`, `roles/hauler.js`,
`utils/config.js`) achou um gap real entre dois números independentemente
tunados que deveriam concordar:

- `structures/tower.js`'s repair só dispara com energia própria **≥ 70%**
  (`tower.repairEnergyRatio`).
- `roles/hauler.js`'s bandas de entrega (ROADMAP 0054) só tratam a torre
  como urgente de reabastecer **abaixo de 50%** (`tower.criticalRatio`); entre
  50% e 80% (`tower.satisfactoryRatio`) ela cai na banda "satisfatória" —
  nem crítica nem no alvo, deixada em paz a menos que o hauler não tenha
  mais nada melhor pra fazer.

Resultado: uma torre reabastecida até sair da faixa crítica (ex.: 55%–65%)
tem energia sobrando mas **não pode gastar em reparo** (abaixo do gate de
70%) enquanto o hauler também **não prioriza** enchê-la mais (já não é mais
"crítica" pro hauler). Energia parada, estrutura danificada ao lado sem
receber reparo, sem nenhum erro ou log — mesmo padrão dos outros bugs
"silenciosos" já documentados neste repo (ROADMAP 0037, 0054).

Não é o causador confirmado da destruição de containers relatada pelo
usuário (esse caso específico já foi rastreado a dano de combate, ver
ROADMAP 0066) — é um gap real e independente encontrado na mesma varredura,
que o usuário pediu para corrigir agora.

## Desired outcome

`tower.repairEnergyRatio` passa a ser igual a `tower.criticalRatio` (0.5)
em vez de um número independente (0.7) — a partir do momento em que
`hauler.js` deixa de tratar a torre como urgente (saiu da faixa crítica),
a torre também pode gastar o que já tem em reparo. Fecha o gap sem alterar
a semântica de nenhuma das duas bandas do `hauler.js` (0054) nem o
comportamento sob `defenseActive` (a torre só chega no branch de reparo
depois de checar hostil/cura, então esse ajuste não compete com defesa
ativa).

## In scope

- `src/utils/config.js`: `defaults.tower.repairEnergyRatio` 0.7 → 0.5,
  comentário explicando o motivo (evitar a zona morta com `criticalRatio`).
- `src/structures/tower.js`: fallback literal do `config.get(...)`
  atualizado de 0.7 para 0.5, em paridade com o novo default.

## Out of scope

- Mudar `tower.criticalRatio`/`satisfactoryRatio` ou a lógica de
  `roles/hauler.js` — o gap fecha só do lado do gate de reparo.
- Investigação de containers destruídos em combate (ROADMAP 0066, já
  tratado separadamente) e da própria destruição relatada pelo usuário —
  esta spec cobre só o gap de threshold encontrado, não uma causa raiz
  confirmada do incidente original.
- Uma ferramenta de diagnóstico ao vivo (`repairAudit`) — sugerida ao
  usuário, mas ele preferiu, por ora, só o fix pontual da torre.

## Acceptance criteria

1. `config.get("tower.repairEnergyRatio")` sem override em `Memory.settings`
   devolve `0.5`, igual a `tower.criticalRatio`.
2. `structures/tower.js` repara com energia da torre a partir de 50% (não
   mais 70%) — cobertura já existente em `test/smoke.js` (fixtures a 100% de
   energia) continua verde, nenhum teste dependia especificamente da faixa
   50%-70%.
3. `node test/smoke.js "$(pwd)"` verde.
4. `npx grunt` builda sem erro.

## Constitution check

- Mudança de tuning puro, nenhuma varredura nova de `Game.creeps`/
  `room.find`.
- Nenhum objeto de jogo em Memory — inalterado.
- Fail-soft preservado — `config.get` continua com fallback, nunca lança.
- Testável offline — coberto pelo smoke existente, sem depender do motor.

## Open questions

Nenhuma — usuário confirmou focar nesse fix específico depois da análise
das três hipóteses (energia/logística/threshold).

## Outcome

Entregue. `tower.repairEnergyRatio` alinhado a `tower.criticalRatio` (0.5)
em `src/utils/config.js` e `src/structures/tower.js`. `node test/smoke.js`
verde (`EXIT_CODE:0`), `npx grunt` gerou `dist/main.js` sem erro.
