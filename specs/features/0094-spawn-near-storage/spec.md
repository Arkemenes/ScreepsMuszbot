# 0094 — Energy structures mais próximas do anchor de spawn

- **Status:** done
- **Owner:** usuário + assistente
- **Created:** 2026-09-17

## Problem

`src/rooms/spawning.js` chama `spawnCreep()` sem informar `energyStructures`.
Assim, o motor fica livre para escolher a ordem padrão de spawns e extensions,
que não considera o `storage` nem o spawn que está executando a criação.

## Desired outcome

Sempre que um spawn for criar um creep, `spawnCreep()` recebe todos os spawns e
extensions próprios em `energyStructures`, ordenados pela distância ao
`storage` quando ele existe. Sem `storage`, a lista é ordenada pela distância
ao spawn que está executando a criação. Empates preservam a ordem original.

## In scope

- Passar `energyStructures` nas chamadas real e `dryRun` de
   `src/rooms/spawning.js`.
- Adicionar assertions offline em `test/smoke.js` para storage presente e
   ausência de storage.

## Out of scope

- Alterar a ordem de prioridade dos roles ou a composição dos corpos.
- Alterar a lógica do `hauler` ou mover energia fisicamente.
- Fazer pathfinding para decidir a ordem.

## Acceptance criteria

1. Com storage, `energyStructures` começa pelo structure mais próximo dele:
   `"spawn energy structures are ordered closest to storage first"`.
2. Sem storage, `energyStructures` começa pelo spawn que executa a criação e
   segue pela proximidade dele: `"without storage, spawn energy structures are
   ordered closest to spawn"`.
3. A mesma lista ordenada é passada no `dryRun` e na criação real.
4. `node test/smoke.js "$(pwd)"`, `node --check` nos arquivos tocados e
   `npx grunt` permanecem verdes.

## Constitution check

- **CPU:** reutiliza `roomCache` e faz apenas comparações de distância, sem
   pathfinding ou `room.find` adicional.
- **Memory:** não grava estado novo.
- **Fail-soft:** sem storage usa o spawn como anchor; a fila normal continua
   responsável pelos retornos do motor.
- **Offline test:** o smoke usa duas posições e verifica a ordem sem servidor.

## Open questions

Nenhuma. A unidade de decisão é a ordem explícita de `energyStructures` aceita
por `spawnCreep`.
