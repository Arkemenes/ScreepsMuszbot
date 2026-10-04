# 0115 — Etapas de lab concorrentes (ondas)

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-10-03

## Problem

Uma cadeia de lab de vários níveis roda **uma reação por vez**: para XLH2O o executor faz
`OH`, depois `LH`, depois `LH2O`, depois `XLH2O`, cada uma com um único `labReaction` por
sala e um ponteiro `chain.qi`. Mas `OH` e `LH` não dependem uma da outra, e
`labSlots.planPhases` já as coloca em labs diferentes (só para o intermediário ficar no
lugar). Com 10 labs, 7 ficam parados em cada etapa e o tempo total é a **soma** dos tempos
das etapas (a reação de 5 unidades leva 15-20 ticks por lab), em vez do caminho crítico.

## Desired outcome

As etapas independentes da árvore (mesma altura) rodam **ao mesmo tempo**, em labs
disjuntos, em "ondas": onda 0 = folhas (`OH` e `LH`), onda 1 = `LH2O`, onda 2 = `XLH2O`.
O tempo de uma onda é o da etapa mais lenta, não a soma. O planner estima `T` pelo caminho
crítico, então a margem exigida acompanha. Com labs insuficientes para isolar as etapas, o
plano cai no sequencial de antes.

## In scope

- `labSlots.planPhases` passa a gerar planos por onda (slots exclusivos dentro de uma onda)
  e escolhe o paralelo quando ele existe e custa poucos remanejamentos a mais.
- Várias reações simultâneas por sala: `Memory.rooms[r].labReactions` (lista), lida por
  `utils/labReactions.js` (`list`), com `labReaction` (uma só) como caso particular/manual.
  Consumidores: `structures/lab.js`, hauler (reagente/saída), `nonEnergyLogistics`,
  `transientStock`.
- `craftChain`: itens de lab com a mesma `wave` consecutivos formam um grupo que inicia
  junto, mede progresso do grupo e fecha quando todos terminam; item pronto sai da lista de
  reações na hora (o hauler não reabastece o que já acabou).
- `marketPricing.evaluate`: `T` das etapas de lab = soma das ondas (máximo dentro de cada).
- `craft.parallelLabs` (true) liga/desliga; `craft.parallelExtraMoves` (4).

## Out of scope

- Várias saídas (wide) em etapas intermediárias: o produto precisaria voltar a UM lab de
  entrada da etapa seguinte (viagem pelo storage). Continua só na última etapa.
- Pipelining (iniciar `LH2O` antes de `OH`/`LH` terminarem).
- Pré-carregar o reagente da onda seguinte enquanto a anterior roda.
- Duas cadeias de lab em paralelo na mesma sala (continua uma por tipo de estrutura).

## Acceptance criteria

1. `planPhases` (10 labs, árvore XLH2O) devolve fases com `wave`: `OH` e `LH` na mesma onda,
   `LH2O` e `XLH2O` em ondas seguintes; dentro de uma onda os slots (entradas e saída) não se
   repetem entre reações.
2. Com 3 labs (ou só os necessários para uma reação) o plano é sequencial (uma fase por onda).
3. `craft.parallelLabs = false` devolve exatamente o plano sequencial anterior.
4. `labReactions.list(sala)` devolve `labReactions` se houver, senão `[labReaction]`, senão `[]`.
5. `lab.js` roda a reação em cada lab de saída de qualquer reação ativa, cada um no seu cooldown.
6. O hauler abastece os labs de entrada de todas as reações ativas (um job por reagente e
   destino) e esvazia o lab de saída mais cheio de qualquer reação.
7. `transientStock` não esvazia o produto nem os reagentes de nenhuma reação ativa.
8. O executor inicia `OH` e `LH` juntos (`labReactions` com 2 entradas), só passa à onda
   seguinte quando as duas terminam e tira da lista a que acabar primeiro.
9. O `T` estimado de XLH2O em ondas é menor que a soma das etapas, e igual a ela quando o
   plano é sequencial.
