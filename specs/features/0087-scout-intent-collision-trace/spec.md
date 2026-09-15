# 0087 — Scout intent collision trace

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

`scoutTrace` confirmou `moveTo() === OK`, fadiga zero e tile seguinte vazia
quando o scout roda, mas o creep não se desloca. Posições são observadas antes
de todos os scripts terminarem; outro creep pode declarar a mesma tile depois,
e o motor resolve a colisão somente ao fim do tick.

## Desired outcome

Com `scoutTrace(true)`, o log de fim de tick mostra quais creeps também
declararam movimento para a próxima tile do scout. Sem a flag, o bot não
mantém nem processa intenções extras.

## In scope

- Registro heap-only de intenção por `move` e `moveTo` enquanto a trace está ativa.
- Relatório de concorrentes da próxima tile do scout após o loop de creeps.

## Out of scope

- Mudar prioridade ou resolver colisões de movimento.
- Coordenar movimento quando a trace estiver desligada.

## Acceptance criteria

1. Com `Memory.settings.debug.scoutTrace` desligado, o registro de intenção é no-op.
2. Com a flag ligada, `moveTo` e `move` registram a tile pretendida por creep no heap.
3. Após todos os roles, o log da trace lista os concorrentes da próxima tile observada do scout.
4. Smoke e build permanecem verdes.

## Constitution check

- **CPU:** só ativo sob debug explícito e limpa o registro por tick.
- **Memory:** todos os intents são heap-only; a flag pequena já existe.
- **Fail-soft:** o observador não modifica retorno nem intenção nativa.
- **Offline test:** smoke verifica o no-op desligado e o registro/flush ligado.

## Open questions

- Nenhuma.