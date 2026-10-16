# 0156 — CPU: lógica restante (listagens ociosas, labPolicy, intel, picos, partida a frio)

- **Status:** spec
- **Owner:** ARK-128
- **Created:** 2026-10-15
- **Depende de:** 0145 (régua, oráculo), 0147 (probes)

## Problem

Medição `cpuTop` de 2026-10-15 (warm 15,97–17,0): o que sobra de lógica reaproveitável, com evidência.

| Item | Evidência [M] | Ganho CPU/tick [E] | Risco |
|---|---|---:|---|
| **L2** listagens `sell:listed` sem evento | `op sell:listed` 0,37–0,51 (2,6–3,3 chamadas/tick); probe: **96,5–99,1%** das chamadas repetem as entradas | 0,3–0,4 | médio-alto (estado de ordens) |
| **L3** `labPolicy` (`assignments` 0,32–0,39, `confirm` 0,07–0,15, `resolve` 0,11) | probe `assignments` **92%** | 0,2–0,3 | médio (estado complexo) |
| **L4** `intel` (0,8–0,9; `transitSafety` 0,21–0,27, pico 1,76) | 6,1 chamadas/tick | 0,2–0,3 | baixo-médio |
| **L6** picos | `miner.distribute` max 5,59; `intel` max 1,9; `craft.chains` max 4,6; `swing` scan 18 | segurança de bucket | baixo |
| **L7** partida a frio | 167–197 CPU por deploy | 0 na média | médio |
| **O3** limpeza | spans temporários `claims.*`, `fuel.plan.*`, `swing.scan.*`; módulo `memoryCleanup` | ~0,05 | baixo |

Já feito (0147/0152): `resolve` sem alocação, índice do livro por recurso, `commitments` em um scan,
buscas do hauler/builder ociosos e entrega em trânsito.

## Desired outcome

Mesmas decisões, menos CPU quando nada mudou, **provado por oráculo de equivalência e validado em produção pelo `cpuReport`**.

## In scope

- **L2:** cache de decisão de `listResidual` por **assinatura das entradas** (estado da op, `remaining`, preço e
  restante da ordem viva, estoque do terminal, versão do mercado, config, `repriceTick`/janela de reprice,
  `pendingExtension`); nunca por tempo; invalidação por qualquer mudança; a janela de reprice e a verificação de
  confirmação (`orderConfirmationTicks`) continuam disparando no tick certo.
- **L3:** cache de `assignments` por assinatura (estado dos labs: tipo, quantidade, `cooldown` booleano; `desired`,
  `roles`, `refilling`, fase, `phaseRemaining`, estoque do mineral, `incoming` dos haulers, limiares); `resolve` e
  `profile` por assinatura estrutural; `confirm` continua por tick (lê os labs). Oráculo com **fuzz** de mutação de
  cada entrada.
- **L4:** `transitSafety`/`getIntel` por (sala, tick de visão) e por mudança de hostilidade; **segurança e defesa
  nunca ganham atraso**: invalidação por evento (hostil visto) e teste de equivalência.
- **L6:** espalhar picos (scan do swing por sala/recurso em ticks; `miner.distribute` com orçamento) sem mudar o resultado.
- **L7:** hidratação preguiçosa de segmentos/caches e distribuição do custo frio em ticks com orçamento global.
- **O3:** remover spans temporários e, após um deploy com `removed = 0`, o `memoryCleanup`.

## Out of scope

- Qualquer cache por TTL de saldo, preço ou estoque; mudar cadências de jogo (reprice, `tickInterval`, cooldowns).
- Indexar `Game.market.orders` entre chamadas (testes mutam a lista no mesmo tick).

## Acceptance criteria

1. The oracle (`test/equivalence/compare.js`) asserts, with random mutation of every input between ticks, that the cached and the reference decisions are identical (reactions, holds, desired, reasons for L3; price, amount, fee and intents for L2).
2. The smoke test asserts each cache invalidates on a mutation of each of its inputs (one assertion per input) and on reset.
3. O `cpuReport` automático mostra queda dos spans-alvo e `warmUsed` sem regressão (flag por item, desligável sem deploy); resultado nas Notes.
4. Produção de XLH2O por cadeia, ordens abertas e preços, créditos e claims inalterados (invariantes pós-deploy).
5. Nenhuma Memory nova por tick.

## Constitution check

Heap para assinaturas e caches com tamanho limitado; invalidação por mudança de entrada; cada item atrás de flag
desligável sem deploy; `guard()` mantido.

## Open questions

- Hit-rate real do `assignments` com 10 labs em produção contínua (probe diz 92%, é um limite superior).
