# 0167 — Postura de defesa por nível de ameaça

- **Status:** planned
- **Owner:** a definir após revisão
- **Created:** 2026-10-21
- **Linear:** [ARK-214](https://linear.app/arkemenes/issue/ARK-214/0167-postura-de-defesa-por-nivel-de-ameaca)

## Problem

O bot coleta contagem de hostis em `rooms/intel.js`; `rooms/needs.js` usa essa contagem para determinar defensores, enquanto `rooms/defense.js` calcula separadamente dano e tempo até a queda do spawn para safe mode. Isso cobre decisões locais importantes, mas não há uma avaliação comum que indique o nível e a causa da ameaça para orientar uma postura defensiva graduada.

Essa lacuna já consta em `specs/ROADMAP.md` como ideia de DEFCON por sala, com uso explícito em decisões automáticas de defesa/ataque. A análise comparativa identificou um monitor de defesa mais integrado no ScreepsWorldGame. Copiar agressividade, contra-ataques ou regras de torre sem a semântica de segurança local criaria falsos positivos e poderia ativar safe mode ou consumir energia em incursões sem risco real.

## Desired outcome

Cada sala própria visível tem uma avaliação explicável de ameaça — nível, causa e sinais observados. A política começa em `observe`, sem alterar ações. Depois de validar a classificação, a postura pode priorizar reforço defensivo/população conforme ameaça armada e risco projetado ao spawn. O gatilho atual de safe mode permanece como decisão de segurança final.

## In scope

- Consolidar sinais já disponíveis: hostis armados, dano/proximidade via `combat`, estruturas defensivas próprias, proteção efetiva por rampart e a projeção existente de tempo até a queda do spawn.
- Produzir níveis nomeados `calm`, `watch`, `engaged` e `critical`, cada um com causa/códigos de evidência. Hostil desarmado pode aparecer em `watch`, mas não é ameaça armada.
- Escalar para `critical` imediatamente quando o critério atual de tempo até a queda for atingido; histerese/cooldown só atrasam recuperação, nunca escalada crítica.
- Começar em modo `observe`; depois do aceite offline/live, permitir que `rooms/needs.js` consuma níveis `engaged`/`critical` para ordenar ou dimensionar reforços dentro dos limites existentes.
- Publicar nível e causa na telemetria da sala para depuração e para integração futura com o governor de CPU por sala.
- Tratar visão/dados ausentes como `unknown`, sem transformar ausência de evidência em ameaça ou segurança garantida.
- Reutilizar cache de estruturas e a inteligência do tick, sem nova varredura global de creeps ou novo `room.find` redundante.

## Out of scope

- Alterar/relaxar o limite atual de `ticksToKill` ou a chamada de safe mode.
- Contra-atacar, iniciar raids, escolher alvo/jogador, lançar nukes ou gastar créditos automaticamente.
- Mudar comportamento por ausência de visão, dados inválidos ou inimigos desarmados.
- Replicar o monitor ou a taxonomia de roles do upstream sem necessidade local demonstrada.

## Acceptance criteria

1. Fixtures para sala calma, hostil desarmado, hostil armado fora de alcance, atacante capaz de causar dano e atacante boosted produzem nível e causa determinísticos.
2. Rampart efetiva aumenta a estimativa de sobrevivência do spawn; uma ameaça que cruza o limite atual de safe mode vira `critical` no mesmo tick, sem histerese de escalada.
3. Histerese só reduz nível após o sinal persistir pelo intervalo configurado; dado ausente/stale resulta em `unknown` e não em `critical` nem em `calm` afirmativo.
4. Em modo `observe`, assertions provam que spawn, torre e safe mode mantêm as ações de referência. Em modo `enforce`, somente prioridade/contagem defensiva aprovada muda; o critério de safe mode continua idêntico.
5. O cálculo usa `roomCache`/inteligência existentes e não adiciona passagens por `Game.creeps` nem chamadas extras de `room.find`.
6. Uma janela live controlada confirma causa/nível coerentes e ausência de degradação econômica ou de spawn antes de ativar `enforce`.

## Constitution check

- **CPU:** reusa dados de `intel`, `combat` e `roomCache`; não cria passagem global nem varredura duplicada.
- **Memory:** guarda somente nível, tick e causa compactos necessários à histerese/telemetria; nunca objetos de jogo ou snapshots de hostis.
- **Fail soft:** `observe` é o default, níveis críticos escalam imediatamente, e dado ausente não provoca ação. Safe mode continua sob seu `guard()` atual.
- **Testabilidade:** fixtures cobrem sinais, rampart, transições, stale intel e ações em cada modo; a ativação exige observação live.
- **Configuração:** modo, histerese e limites vivem em `Memory.settings.combat.threatPosture`/config.

## Open questions

Nenhuma decisão de produto está aberta. Os níveis e o rollout observe-first estão definidos; limiares quantitativos configuráveis serão calibrados contra fixtures e dados live, mantendo o critério atual de safe mode como limite invariável.
