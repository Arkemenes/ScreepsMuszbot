# 0080 — Builder único por sala

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

A fórmula de população de `rooms/needs.js` e o autoscale ainda permitiam que uma sala pedisse mais de um `builder`. Isso fazia backlog e energia excedente aumentarem a população de builders, embora a política desejada seja manter no máximo um.

## Desired outcome

Cada sala pode querer zero ou um `builder`, nunca mais de um. A sala fica em zero quando não há energia coletável suficiente; quando há trabalho e energia, a contagem desejada é um. O limite também vale para autoscale e overrides manuais.

## In scope

- Limitar a fórmula base de `builder` a `0..1`.
- Limitar o autoscale de `builder` a `1`.
- Limitar `wantedOverride.builder` a `1`.
- Atualizar o smoke test e a documentação da arquitetura.

## Out of scope

- Alterar a lógica de trabalho, reparo ou corpo do role `builder`.
- Alterar limites de outros roles.
- Remover o mecanismo geral de `wantedOverride`.

## Acceptance criteria

1. Backlog grande e storage cheio resultam em `builder === 1`.
2. Sem energia coletável, a sala resulta em `builder === 0`.
3. Autoscale não acumula um total acima de um builder.
4. Delta antigo de autoscale é limitado imediatamente a um builder.
5. `wantedOverride.builder` acima de um continua resultando em `builder === 1`.

## Constitution check

- **CPU:** nenhum scan novo; apenas clamps na contagem já calculada.
- **Memory:** não adiciona estado persistente.
- **Fail-soft:** preserva o fluxo existente de `needs.js` e `autoscale.js`.
- **Offline test:** todos os critérios são cobertos por assertions em `test/smoke.js`.

## Open questions

- Nenhuma.
