# 0164 — Critério econômico do mineral extractor

- **Status:** in-progress — T1–T2 publicados em 2026-10-21; verificação live (T3) pendente.
- **Issue:** ARK-199 (M2).
- **Created:** 2026-10-21. Referência da lógica: descrição da ARK-199 (fornecida pelo usuário).

## Problem

O `mineralMiner` é admitido só por `mineralMiner.minAmount` (2000) com extractor e container plantados. Não há avaliação econômica. Neste shard a energia vale cerca de 33 créditos (fairPrice de 2026-10-21) e minerar custa entre 0,4 e 1,1 de energia por unidade, conforme a parcela de hauler atribuída. Com isso, minerais de 12 a 35 créditos (U, K, Z, O) podem custar mais energia do que valem. Há também uma lacuna: o piso de haulers da operação mineral (`hauler.minCountWithMineral`) vale enquanto houver depósito, extractor e container, mesmo sem nenhum miner.

## Desired outcome / In scope

Lucro líquido por depósito, `W = Y − K`:

- **Equipe:** um `mineralMiner` (um assento no container) com o corpo de `mineralMiner.body(sala, restante)`. O assistente é só o hauler marginal, ou seja, quantos haulers o piso `hauler.minCountWithMineral` acrescenta ao que a sala já teria sem mineral (`rooms/needs`, heap). A referência s = ⌈0,4 i⌉ contava haulers inteiros, mas esse hauler também carrega energia.
- **Vidas:** A = ⌈restante / (WORK × `mineralMiner.lifeBudget` / EXTRACTOR_COOLDOWN)⌉, contando vidas cheias (conservador). `T = A × (custo(miner) + marginal × custo(hauler))`, com o custo do hauler pelo corpo escalado `[CARRY, CARRY, MOVE]`.
- **Custo de oportunidade:** `K = T × a`, com `a` = fairPrice da energia (`utils/market.snapshot`).
- **Receita:** `Y = p × R`, com p = restante e R = fairPrice do mineral. Com uso próprio em alguma sala (`resourcePolicy.used`), R = max(fair, ask): vale o custo de compra evitado.
- **Veredito:** com `W > extractorEconomics.minProfit` (0), admitido. Caso contrário, o spawn é bloqueado. Revisão a cada `extractorEconomics.checkTicks` (1000) ou quando muda o mineral. O console mostra `[ExtractorEconomics]` com R, preço de equilíbrio (K/p) e déficit. Estado pequeno em `Memory.rooms[r].extractorEconomics` {admitted, reason, nextCheckTick, mineral, profit, breakeven, price, energyPrice}.
- **Preço ausente** (sem fairPrice de energia ou do mineral; o histórico de mercado fica no heap e some no reset): mantém o veredito anterior; sem veredito anterior, admite (comportamento legado) com motivo `price-unknown`. Em ambos os casos revê após `extractorEconomics.unknownRecheckTicks` (100).
- **Alcance:** só gate de spawn. O miner vivo termina a vida. O piso de haulers da operação mineral passa a valer só com miner vivo ou veredito admitido.
- **Flag:** `extractorEconomics.enabled` (true). Desligada, vale o legado.

## Acceptance criteria

1. Depósito lucrativo: admitido, e o spawn segue o legado (`minAmount`, container livre).
2. Depósito não lucrativo: `wanted` = 0 e próxima revisão em `checkTicks`; o relatório traz breakeven e déficit.
3. Revisão só depois do prazo (cache), salvo troca de mineral; nenhum scan novo por tick.
4. Preço ausente: mantém o anterior ou admite com `price-unknown`.
5. Uso próprio: R = max(fair, ask).
6. Veredito bloqueado e nenhum miner vivo: o piso `hauler.minCountWithMineral` não se aplica.
7. Flag off: legado.

## Constitution check

Config em `Memory.settings`/`config`; estado por sala sem objetos de jogo; decisão em cache (1 avaliação por sala a cada 1000 ticks); census/roomCache; sem `room.find` novo; §9 não se aplica (gate de admissão, não cascata de gasto).
