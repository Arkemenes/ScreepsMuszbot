# 0179 — Travessia compartilhada do squad entre salas

- **Status:** done (local; publicação e aceite live pendentes)
- **Created:** 2026-10-22
- **Linear:** ARK-226 (continuação da 0178)

## Problem

`advance()` alterna navegação e formação pela sala de cada membro. Quando um
seguidor entra antes do líder, seu slot ainda aponta para a sala anterior.
O retorno impede a entrada conjunta e pode contaminar o detector geral de
becos. A formação tática bloqueia bordas e não consegue completar a travessia.

## Desired outcome

Após o staging, cada salto tem uma fase compartilhada: reunião junto à saída,
travessia por um corredor comum e reunião no interior. Slots táticos só voltam
quando todos terminarem a passagem; cura e ataque continuam nos roles.

## In scope

- Travessia nos quatro sentidos, inclusive recuo; recuperação de squads já
  divididos entre salas, independentemente de quem entrou primeiro.
- Um planejamento de duas salas por tentativa; terreno e estruturas conhecidas
  respeitados, caminho derivado fora de Memory, somente âncoras/estado primitivo.
- Reunir sem fadiga antes da partida; quem já entrou não volta ao slot antigo.
- Stall guard por posição e prazo total; retentativa espaçada, recuo na falha
  de avanço e diagnóstico local, sem marcar sala como beco global.
- Limpar somente a marca e a exclusão da sala de partida que um membro desta
  squad carregava, após comprovar um caminho completo pela passagem.
- A formação em combate continua proibindo bordas. Recuo só desmobiliza quando
  todos os sobreviventes estiverem em casa e fora da borda.
- Após a entrada, a validação da coluna usa a direção candidata, mesmo sem uma
  direção anterior; quem chegou primeiro desocupa a âncora do líder.

## Out of scope

Regras de vida média (ARK-228), siege (ARK-227), mudança global no routing,
deploy ou escrita pela API read-only.

## Acceptance criteria

1. `0179: a follower entering first never moves back to the previous room`.
2. `0179: leader first waits inside until every member has crossed`.
3. `0179: all four directions finish inside before tactical formation resumes`.
4. `0179: gather waits for fatigue and uses one shared doorway`.
5. `0179: blocked crossing retries with a bound and never creates a global dead end`.
6. `0179: a validated passage clears only its contaminated origin route state`.
7. `0179: retreat keeps the squad until every survivor is home`.

## Constitution check

Somente os membros por ID são percorridos; matrizes usam o cache de combate.
Sem objetos de jogo/caminhos em Memory e sem novo subsistema no main. Limites
de busca, reunião, retentativa e timeout ficam em `config.squad`. Smoke cobre
transição e falhas; nenhuma alegação de ganho de CPU sem medida live.
