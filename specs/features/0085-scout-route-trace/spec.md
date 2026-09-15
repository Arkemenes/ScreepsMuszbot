# 0085 — Scout route trace

- **Status:** done
- **Owner:**
- **Created:** 2026-09-15

## Problem

O scout pode parar durante uma viagem de `signRoom`, mas o console publicado
só expõe comandos de função já registrados pelo bot. Não há uma forma
confiável de observar a posição, a rota e o retorno de movimento sem editar ou
monkey-patchar o runtime pelo console.

## Desired outcome

`scoutTrace()` mostra o estado do único scout e `scoutTrace(true)` liga logs
por tentativa de `moveToRoom()` do scout, incluindo a próxima tile do path
cacheado e seus ocupantes. O operador consegue distinguir se o role não chama
o roteador, se a API devolve `ERR_NO_PATH` ou se a API aceita a intenção sem
deslocamento por tráfego.

## In scope

- Comando global `scoutTrace(enabled?)`.
- Flag opt-in `Memory.settings.debug.scoutTrace`.
- Log compacto antes/depois dos movimentos multi-sala de scout.
- Probe manual único `scoutTrace("step")` para enviar a primeira direção cacheada diretamente via `move()`.

## Out of scope

- Alterar a política de rota, cache ou recuperação de stall.
- Diagnóstico automático para outros roles.

## Acceptance criteria

1. O smoke test assert que `scoutTrace(true)` habilita `Memory.settings.debug.scoutTrace` e `scoutTrace(false)` a desabilita.
2. O smoke test assert que `scoutTrace()` funciona com um único scout sem lançar.
3. Com a flag habilitada, `moveToRoom()` registra para scout a posição, destino, próxima tile/ocupantes e status retornado; sem a flag não registra nada adicional.
4. O smoke test assert que `scoutTrace("step")` usa a direção cacheada do único scout em uma chamada direta a `move()`.

## Constitution check

- **CPU:** o gate é uma leitura simples e só ocorre em chamadas de rota do scout; não há varredura nova no tick.
- **Memory:** a única persistência é uma flag booleana em `Memory.settings`.
- **Fail-soft:** o comando trata zero ou múltiplos scouts e o log não altera o resultado do movimento.
- **Offline test:** o smoke chama o comando e verifica a flag e ausência de exceção.

## Open questions

- Nenhuma.