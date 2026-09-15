# 0090 — Passo cacheado só no stall

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

0089 passou a emitir `move(direction)` a cada tick de uma rota multi-sala.
Isso tira o creep da inércia, mas força uma direção do cache interno `_move`
mesmo enquanto `moveTo()` está refazendo sua própria decisão, produzindo um
percurso visivelmente errático.

## Desired outcome

O `moveTo()` nativo volta a controlar o percurso normal. A direção cacheada é
emitida apenas uma vez quando o detector existente confirma falta de progresso;
`excuseMe` continua movendo o viajante imediatamente depois de liberar uma
tile ocupada.

## In scope

- Restringir o passo direto de 0089 ao limiar existente de `noProgressTicks`.
- Preservar o passo imediato depois de `excuseMe.ask()` bem-sucedido.

## Out of scope

- Trocar o PathFinder, custos ou destino da rota.
- Alterar o limite configurável de stall.

## Acceptance criteria

1. O smoke test assert que uma rota multi-sala com tile livre não chama `move()` diretamente em tick normal.
2. O smoke test assert que uma tile ocupada ainda abre passagem e move o viajante.
3. O smoke test assert que o limiar de falta de progresso emite um passo direto uma única vez após renovar `_move`.
4. Smoke e build permanecem verdes.

## Constitution check

- **CPU:** nenhum search adicional; usa o contador de stall já existente.
- **Memory:** nenhum campo novo.
- **Fail-soft:** só recupera depois do limite já configurado; `ERR_NO_PATH` continua sem passo direto.
- **Offline test:** cobre percurso normal, cortesia e recuperação de stall.

## Open questions

- Nenhuma.