# 0170 — Revisão completa da lógica de combate

- **Status:** planned
- **Owner:** a definir após revisão
- **Created:** 2026-10-21
- **Linear:** [ARK-216](https://linear.app/arkemenes/issue/ARK-216/0170-revisao-completa-da-logica-de-combate)

## Problem

Squads, defenders, defender medics, strikers e outros creeps defensivos falham em jogo: ficam parados, não mantêm formação, não escolhem alvo válido, não curam ou não recuam a tempo. O comportamento está distribuído entre combat.js, roles e missions, sem um contrato tático comum e sem reprodução completa das falhas relatadas.

## Desired outcome

Cada papel de combate executa uma decisão explicável e segura a partir de ameaça atual, capacidades dos body parts, geometria/obstáculos e estado da missão. Defensores protegem a sala e recuam conforme risco; medics mantêm vivos alvos úteis; squads coordenam movimento e encerram missões de forma previsível. A operação ofensiva continua manual/opt-in.

## In scope

- Inventário/reprodução de falhas por role e estado de missão.
- Contratos comuns para detecção/prioridade de alvo, dano e cura disponíveis, movimento, formação, recuo, retorno e conclusão/cancelamento.
- Integração com defender, defenderStriker, defenderMedic, squad, raider e squadDismantler.
- Uso da futura postura por sala 0167 como sinal de risco, sem duplicar a avaliação de ameaça.
- Preservar safe mode, allowlist de aliados, filtros de jogador hostil, guard(), census e roomCache.
- Testar adversários melee/ranged/healer/boosted, grupo, rampart/wall, hostil sem arma, intel stale, creep preso/morto e reset.
- Medir e validar em simulação/janela controlada antes de ampliar políticas.

## Out of scope

- Ataque, retaliação ou raid automática; ARK-31/0123 permanece manual e será reconciliada com o núcleo.
- Alterar o limite de ativação de safe mode sem revisão independente.
- Gastar recursos em boosts/torres/nukers sem a política existente.
- Reproduzir papéis ou agressividade do upstream sem evidência de valor local.

## Acceptance criteria

1. Cenários determinísticos produzem escolha de alvo, ação, movimento, cura/recuo e resultado esperados para todos os perfis de ameaça definidos.
2. Defenders se deslocam/protegem a sala de origem, não ficam em espera por parceiro ausente e reagem a alvo nulo ou desaparecido.
3. Medics curam um alvo válido prioritário, recuam quando apropriado e não perseguem alvos mortos ou fora do escopo da missão.
4. Squads mantêm formação alcançável, tratam path parcial/stall e encerram/retomam missões após morte, cancelamento ou reset.
5. Intel ausente ou stale, aliado e hostil desarmado não iniciam ataque ou threat state indevido; safe mode conserva o contrato vigente.
6. A implementação mantém as regras de uma passagem por Game.creeps e um room.find por tipo/sala/tick; validação controlada não mostra degradação de defesa/spawn.

## Constitution check

- **CPU:** uma avaliação compartilhada alimenta roles a partir do census e caches; não haverá scans globais por role.
- **Memory:** persiste missão, fase, IDs, sala e ticks compactos; objetos de jogo ficam no heap.
- **Fail-soft:** ausência de alvo/intel/path força espera ou recuo conforme o papel, nunca agressão automática.
- **Offline test:** cenários de combate usam fixtures e ações espiadas no smoke.
- **Configuração:** limites e allowlists vêm de config; ataque continua manual/opt-in.

## Open questions

Nenhuma decisão de escopo está aberta. A primeira etapa precisa produzir reprodução das falhas e baseline por role antes de substituir módulos.
