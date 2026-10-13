# Tasks — 0124 / ARK-32

- [x] Política compartilhada de recursos, reservas e capacidade.
- [x] Piso financeiro compartilhado com flip/craft e intents no tick.
- [x] Hauler, loot, overflow, staging e receipts seguem os destinos.
- [x] Mercado oportunista com referência válida, margem, frete e reposição interna.
- [x] Simulação e `swingStatus`.
- [x] Executor com limite efetivo explícito e revalidação.
- [x] Ordens próprias: taxa, preço fixo, parciais, expiração e retenção.
- [x] Smoke de estoque, mercado, operações legadas e proteção financeira.
- [x] Spec, plan, arquitetura, roadmap e help atualizados.
- [x] Verificações finais: sintaxe, smoke, grunt e graphify update.
- [x] Atualizar ARK-32 com resultado da implementação.

## Validação

`test/stockPolicyCases.js` é executado pelo smoke existente; usa os módulos reais com stores e intents stubados. Cobre frete líquido de energia, limites estritos, histórico, orçamento compartilhado, custos no tick, pendências, reservas de cadeias/manuais/ordens, destino e overflow, simulação, receipts parciais, preço fixo e expiração. As suites legadas continuam cobrindo flip/craft e terminalOps.

Validação offline concluída: sintaxe dos 14 arquivos alterados, smoke com exit 0, bundle dist/main.js e atualização AST do grafo. Sem teste no servidor ou deploy.

## Correção do histórico

- [x] Reproduzir corte de 168 para 31 amostras após reset.
- [x] Persistência paginada, migração version 1 e validação de geração.
- [x] Ativação gradual preservando slots de city plans.
- [x] Flush de amostras reais coletadas durante a hidratação.
- [x] `marketHistoryStatus()` e referência no help.
- [x] Regressões integradas ao smoke em `test/marketHistoryCases.js`.
- [x] Checks finais da correção e atualização de ARK-32.

- [x] `marketHistoryFlush()` para migração imediata sem nova amostra, com regressões integradas ao smoke.

- [x] Coleta com bucket mínimo 500 e agenda fixa preservada após atraso e reset.
- [x] Smoke: 499/500, retomada fora da grade do book, horário seguinte original, reset e atraso por múltiplos períodos.

- [x] Reduzir temporariamente swing.minSamples para 30, testar limiar 29/30 e override de retorno a 48.
- [ ] Após validação no servidor, restaurar o mínimo de 48 amostras (etapa futura).

- [x] Expor `swingReference` e contagens totais/válidas nos bloqueios; smoke com 33 observações, 29 preços válidos e referência independente de energia.

- [x] Corrigir ordem de execução: scan/hidratação de mercado antes de terminalOps, flip, craft e swing.
- [x] Distinguir `history-loading`, não consumir a cadência de swing durante hidratação e recalcular referências assim que as páginas completam.
- [x] Smoke com prontidão, bloqueio de amostras parciais, recuperação imediata e preservação da cadência de 120 ticks após recuperação.

- [x] Liberar reposição de uso concorrente com operações do mesmo recurso sem remover reservas quantitativas.
- [x] Proteger intents por terminal/tick, frete reservado e associação/confirmação dos recebimentos concorrentes.
- [x] Validar reposição parcial, alvo já coberto, consumo de craft, cooldown e proteção das travas legadas.

- [x] Implementar previsão compartilhada de frete das próximas duas transações +20%, com escassez e proteção separada de cargas.
- [x] Unificar abastecimento, retirada, receipts e executor; devolver excesso sem oscilação ou dupla contagem.
- [x] Validar reserva dinâmica, operações listadas, quotes desatualizados, bootstrap de compras e proteção de carga/haulers.
