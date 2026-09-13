# 0049 — Autoscale ganha teto absoluto; builder 0–2, hauler 0–3

- **Status:** done
- **Depends on:** 0040, 0041

## Problem

O usuário pediu, depois de revisar a faixa atual de cada role
(`upgrader`/`hauler`/`builder`/`pioneer` 0040/0041), um teto mais baixo:
`builder` de 0 a 2, `hauler` de 0 a 3. Só trocar
`builder.autoscaleMaxCount`/`hauler.autoscaleMaxCount` no `config.js` não
bastava: esses números eram lidos **apenas** dentro do `grow()` de cada
role (`if (wanted.role + delta >= cap) return 0;`), ou seja, só impediam o
autoscale de **adicionar mais** uma vez que o total já batesse o teto — não
travavam o valor em si. A fórmula base de `builder` (`byBacklog`×`byEnergy`)
já produz até **4** sozinha, e a de `hauler` sem link network já produz até
**5** (`hauler.maxCountNoLinks`) — os dois **acima** dos novos tetos
pedidos (2 e 3). Baixar só o número do `grow()` não teria efeito nenhum
nesses casos: a fórmula base já entrega mais que o teto, e nada existia
pra puxar o resultado final de volta pra baixo.

## Desired outcome

`utils/autoscale.js` ganha um terceiro campo de registro, `maxCount(room)`
— um teto **absoluto** pro total do role (fórmula base + delta do
autoscale, combinados), aplicado incondicionalmente no fim de `apply()`,
independente de como o número chegou lá. Isso generaliza o que o clamp de
RCL8 já fazia manualmente só pro `upgrader` (0041) — agora qualquer role
registrado ganha a mesma garantia sem precisar de um `if` escrito à mão em
`rooms/needs.js`. `builder.autoscaleMaxCount` vira **2**,
`hauler.autoscaleMaxCount` vira **3**.

## In scope

- `utils/autoscale.js`: `register(role, {grow?, shrink?, maxCount?})` —
  `maxCount(room)` é lido (com `try/catch` próprio, nunca lança) depois do
  merge do delta em `wanted`, pra todo role registrado, e
  `wanted[role] = Math.min(wanted[role], cap)` quando `maxCount` existir.
- `rooms/needs.js`: os 4 registros (`pioneer`/`hauler`/`builder`/`upgrader`)
  ganham `maxCount()` lendo o mesmo `config.get("<role>.autoscaleMaxCount",
  …)` que o `grow()` de cada um já usava — agora o número é uma garantia de
  verdade, não só um freio de crescimento.
- `config.js`: `builder.autoscaleMaxCount` 6→**2**, `hauler.autoscaleMaxCount`
  8→**3**. `upgrader` (8) e `pioneer` (6) ficam como estavam — hoje nenhum
  dos dois tem uma fórmula base que já ultrapasse o próprio teto, mas
  ganham a mesma garantia de qualquer forma (consistência, não regressão).

## Out of scope

- Mudar as fórmulas base de `builder`/`hauler` em si (`byBacklog`/
  `byEnergy`, `maxCountNoLinks`) — o teto absoluto convive com elas,
  simplesmente corta o resultado final quando ultrapassa.
- Tornar o clamp de RCL8 do `upgrader` redundante/removê-lo — continua
  sendo uma regra **adicional**, mais estrita (máx. 1, não 8), específica
  de RCL8, aplicada depois do teto genérico.

## Acceptance criteria

1. Backlog grande + storage cheio (cenário que já dava `builder === 4`
   antes) agora dá `builder === 2`. *(smoke asserta, mesmo cenário do
   ROADMAP 0015 atualizado)*
2. Com a fórmula já no teto, `grow()` do `builder` não acumula delta —
   fica em 0 mesmo com `builderSurplusEligible` verdadeiro. *(smoke
   asserta)*
3. Um delta "órfão" (ex.: setado à mão simulando um teto reduzido depois
   que a sala já tinha crescido) é clampado de imediato, sem esperar o
   `shrink` drenar janela por janela. *(smoke asserta, builder)*
4. `shrink` continua drenando um delta órfão normalmente quando os
   critérios de escassez batem — o clamp cobre o valor **exibido**, não
   impede a Memory de convergir também. *(smoke asserta, builder)*
5. Toda a suíte de 0040/0041 (upgrader, hauler, pioneer, tie-break)
   continua verde sem alteração de expectativa — nenhum dos cenários deles
   cruzava o próprio teto.
6. Smoke inteiro verde; nenhum subsistema pega exceção.

## Constitution check

- **§1:** nenhuma varredura nova — `maxCount(room)` de cada role só faz
  `config.get`, mesmo custo de `grow()`.
- **§3:** `maxCount` de um role tem seu próprio `try/catch` em `apply()` —
  uma predicate malformada não derruba o cálculo dos outros roles nem do
  resto do tick.
- **§5:** a regra "o que é o teto de cada role" continua em
  `rooms/needs.js` (estratégia de sala); o **mecanismo** de aplicar um teto
  absoluto é genérico em `utils/autoscale.js`, reaproveitável por qualquer
  role futuro sem repetir a lógica.
- **§6:** os dois números novos (2 e 3) são `config.get`, ajustáveis via
  `Memory.settings` sem redeploy.

## Outcome

Entregue. `utils/autoscale.js`'s `apply()` ganhou um passo final que lê
`entry.maxCount(room)` (quando definido) pra cada role registrado e clampa
`wanted[role]` incondicionalmente — não gated pelo cooldown, roda toda vez.
Os 4 registros em `rooms/needs.js` ganharam `maxCount()`.
`config.js`: `builder.autoscaleMaxCount` = 2, `hauler.autoscaleMaxCount` =
3 (upgrader=8, pioneer=6 inalterados). Corrigidas duas assertions antigas
que assumiam o teto anterior (builder chegando a 4 com backlog grande +
storage cheio, e um teste de "cresce além do tier" que não fazia mais
sentido com builder's tier já batendo o novo teto sozinho) — substituídas
por assertions que provam o clamp absoluto: teto batido mesmo com a
fórmula base sozinha ultrapassando, `grow()` não acumula delta inútil
acima do teto, um delta órfão é clampado na hora, e `shrink` continua
drenando esse delta órfão normalmente por trás do clamp. `node --check`
limpo, `npx grunt` builda, smoke inteiro verde.
