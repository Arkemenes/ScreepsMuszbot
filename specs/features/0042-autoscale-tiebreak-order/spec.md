# 0042 — Autoscale tie-break order: pioneer > hauler > builder > upgrader

- **Status:** done
- **Depends on:** 0041

## Problem

`utils/autoscale.js` resolve empate (dois roles elegíveis pro mesmo passo
de ±1 na mesma sala/janela) pela ordem de `Object.keys(registry)`, que é a
ordem de chamada de `register()`. Isso já era verdade desde 0040/0041, mas
era incidental — a ordem `upgrader, hauler, builder, pioneer` em
`rooms/needs.js` era só a ordem em que cada um foi escrito, não uma decisão
de prioridade. A pedido do usuário, a prioridade real deve ser:
**pioneer > hauler > builder > upgrader** — resgatar uma sala-irmã sem
spawn é mais urgente que a vazão desta sala, que é mais urgente que
terminar a própria construção, que é mais urgente que guardar progresso de
upgrade que ninguém pediu.

## Desired outcome

Reordenar as chamadas de `autoscale.register(...)` em `rooms/needs.js`
para `pioneer`, `hauler`, `builder`, `upgrader` (nessa ordem) — sem mudar
nenhum critério de `grow`/`shrink` em si. `utils/autoscale.js` ganha um
comentário explícito de que a ordem de registro **é** a prioridade de
empate, pra próxima mudança não reordenar por acidente.

## In scope

- `rooms/needs.js`: reordenar os 4 blocos `autoscale.register(...)`.
- `utils/autoscale.js`: comentário deixando claro que a ordem de chamada de
  `register()` decide o empate.
- Smoke: um cenário real de empate (`pioneer` e `upgrader` elegíveis pro
  mesmo grow ao mesmo tempo — os dois compartilham `roomEnergySurplus`)
  confirmando que `pioneer` ganha agora, não `upgrader`.

## Out of scope

- Uma pontuação de urgência mais fina que 0/1 entre roles diferentes (a
  ordem continua sendo o único desempate — ver 0041).
- Mudar qualquer critério de elegibilidade em si.

## Acceptance criteria

1. Num cenário onde `pioneer` e `upgrader` ficam elegíveis pro mesmo grow
   na mesma sala/janela (ambos compartilham `roomEnergySurplus`), o passo
   vai pro `pioneer`, não pro `upgrader`. *(smoke asserta)*
2. Todo o resto do smoke de 0040/0041 continua verde — nenhum dos cenários
   anteriores dependia da ordem antiga por acidente (cada um já isolava a
   elegibilidade dos outros 3 roles).

## Constitution check

- **§4:** mudança de comportamento (ordem de desempate) ganhou assertion
  nova no smoke.
- **§6:** a prioridade continua expressa em código (ordem de `register()`),
  não em `Memory.settings` — não há um caso de uso real ainda pra tornar
  isso configurável em runtime; se aparecer, é spec própria.

## Outcome

Entregue. `rooms/needs.js`: os 4 `autoscale.register(...)` reordenados pra
`pioneer`, `hauler`, `builder`, `upgrader`, com um comentário explicando o
raciocínio da prioridade (resgate > vazão local > construção local > banco
de upgrade). `utils/autoscale.js` ganhou uma frase explícita: ordem de
`register()` = ordem de desempate. Smoke ganhou 2 assertions novas
reaproveitando o mock `pMother`/`PNew` do teste de pioneer (0041): com RCL
não travado em 8 (então `upgrader` também fica elegível pelo mesmo
`roomEnergySurplus`), confirma que `pioneer` leva o passo e `upgrader` não.
`node --check` limpo, `npx grunt` builda (62 arquivos), smoke inteiro
verde.
