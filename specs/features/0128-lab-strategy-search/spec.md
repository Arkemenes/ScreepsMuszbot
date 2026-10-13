# 0128 — Busca offline de estratégias de labs

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-10-11
- **Linear:** ARK-99
- **Review:** plano de implementação aprovado pelo usuário nesta sessão

## Problem / Desired outcome

A comparação 0127 cobriu ondas, largo e um pipeline completo fixo. Ampliar o
harness offline para comparar múltiplos intermediários com dupla função,
pipelines parciais, compartilhamento de entradas e reutilização dinâmica.
Nenhum módulo `src/` ou configuração de produção muda.

## Acceptance criteria

1. Reproduzir os três pares de resultados anteriores para 3.000 XLH2O e o
   pipeline de 12.978 ticks antes de ampliar a comparação.
2. Recipes/cooldowns oficiais dos dez compostos catalisados; cenários RCL6/7/8,
   lotes 5/20/100/500/3.000, transporte instantâneo e B=2/4/8/16, troca 0/50/200.
3. Mineral único, alcance, capacidade, saldo, cooldown preservado entre papéis,
   reserva concorrente e snapshot de início do tick validados.
4. Enumerar trios válidos, buscar planos com beam=64, limite 100.000 expansões
   por cenário. Baselines nunca são descartadas nem substituídas por pior plano.
5. Busca exata para três labs/lotes <=20, até 200.000 estados, restrita ao modelo
   de transporte instantâneo. Prova de ótimo só quando a busca termina/prova;
   truncamento e classe de planos da heurística são explícitos.
6. Planos reexecutáveis, movimentação, trocas, atribuições/dupla função, critério
   de desempate e motivo de encerramento em JSON; tabelas de todos os cenários.
7. Regressões/invariantes no smoke, `node --check`, smoke e grunt verdes;
   análise e 0127 revisadas com resultados, grafo atualizado.

## Limits

Beam é uma busca de planos/janelas de produção, não enumeração de todos os
intents possíveis. Transporte agregado não representa creeps/caminhos reais.
Powers, boosts e mercado excluídos. Otimalidade global não é prometida.
