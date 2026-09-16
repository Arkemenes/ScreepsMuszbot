# Notas da investigação: `nativeMoveTo()` aceita e não desloca

## Contexto

Em produção, um scout viajando de `E1N47` para `E1N45`, com rota real
`["E1N46", "E1N45"]`, ficou sem sair de uma posição mesmo com `fatigue === 0`.
A investigação foi deixada em modo diagnóstico por decisão do usuário; esta
nota registra o estado conhecido para evitar uma nova rodada de correções
especulativas.

## Reprodução observada

Scout observado: Zana Proudwater, shard3.

Durante os ticks `83003146` a `83003148`:

- `spawning: true`;
- `fatigue: 0`;
- `nativeMoveTo()` retornou `ERR_BUSY` (`-4`);
- não houve movimento possível enquanto o creep ainda estava spawnando.

Esse trecho explica apenas o período de spawn. Não explica o bug principal.

Depois, nos ticks `83003149` a `83003151`, já com `spawning: false`:

- o alvo continuava sendo `E1N46:24,0`;
- `fatigue: 0`;
- não havia contender na `intent-resolution`;
- `nativeMoveTo()` retornou `OK` (`0`);
- `_move.path` existia e permanecia válido;
- a posição permaneceu `E1N47:44,9` por dois ticks;
- no tick `83003151`, `move(direction=4)` também retornou `OK`;
- no tick seguinte o creep deslocou-se para `E1N47:45,10`.

Esse segundo intervalo é o stall relevante.

## Sabemos com certeza

1. `fatigue` não era a causa: estava em `0` durante o stall.
2. O creep não estava mais em spawn quando o stall principal aconteceu.
3. A chamada cross-room chegou ao `nativeMoveTo()`.
4. O retorno `OK` não prova deslocamento; o servidor aplica movimento depois do tick do script.
5. Não foi detectada disputa de intenção de outro creep na amostra.
6. O passo direto `move(direction)` foi aceito e o deslocamento apareceu no tick seguinte.
7. O passo cacheado contínuo de 0089 deixava a rota errática; por isso 0090 o restringiu ao stall.
8. O guard `if (creep.spawning) return` é uma proteção auxiliar válida contra `ERR_BUSY`, mas não resolve o stall posterior.

## Suspeitas ainda não confirmadas

- O cache interno de `nativeMoveTo()`/`reusePath` pode aceitar a rota e não
  emitir uma intenção efetiva depois da transição de spawn.
- A chamada pode estar produzindo uma intenção diferente da primeira direção
  observada em `creep.memory._move.path`; esse campo é cache de movimento, não
  prova do comando efetivamente aplicado pelo servidor.
- O alvo em uma exit tile (`E1N46:24,0`) pode interagir com o cache cross-room
  do motor de forma diferente de um alvo no centro da sala.
- A transição `spawning:true` -> `false` pode deixar um estado interno de
  movimento indisponível por mais de um tick, embora o retorno já seja `OK`.

Nenhuma dessas hipóteses deve ser tratada como causa raiz sem experimento.

## O que foi descartado nesta amostra

- fadiga;
- ausência de rota real (`_realRoute` estava presente);
- bloqueador aliado no próximo tile;
- colisão registrada por `traffic.flushScoutTrace()`;
- `ERR_NO_PATH`;
- falta de `MOVE` ativo (o trace mostrava dois `MOVE` ativos);
- o período de spawn como explicação suficiente para o stall completo.

## Diagnóstico disponível

Com `scoutTrace(true)`, o trace registra:

- entrada em `moveToRoom()` (`route-enter`);
- decisão de recuperação (`forceCachedStep`);
- posição anterior e `movedSincePreviousTick`;
- alvo e retorno de `nativeMoveTo()`;
- `_move.path` antes/depois;
- chamada direta de recuperação (`cached-step`);
- intenções concorrentes no fim do tick.

A linha importante para confirmar o bug é uma sequência com:

```text
spawning:false
fatigue:0
status:0
movedSincePreviousTick:false
contenders:[]
```

## Próxima investigação recomendada

Reproduzir o mesmo stall e comparar dois ticks equivalentes:

1. chamada normal com `reusePath:30`;
2. chamada controlada com `reusePath:0`, mantendo o mesmo alvo e as mesmas
   restrições de rota.

Interpretação:

- só `reusePath:0` move: suspeita forte de cache stale do `nativeMoveTo`;
- nenhum dos dois move, mas `move(direction)` move: problema na intenção
  cross-room do `nativeMoveTo`, não na direção nem no obstáculo;
- nenhum move, inclusive direto: investigar terreno, estrutura, borda e
  estado efetivo do creep no motor.

Até esse experimento, não alterar novamente custos, destino, PathFinder ou
passo direto normal.
