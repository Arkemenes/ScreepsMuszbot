# Plano — 0124

## Implementação

1. Introduzir `resourcePolicy` para destinos, alvos, déficit, espaço e compromissos quantitativos; manter reservas operacionais separadas.
2. Introduzir `marketAccounting` com piso global, ledger de flip/craft, compras pendentes, ordens legadas e custos aceitos no tick.
3. Integrar a política ao hauler, receipts e planejamento de craft; preservar carregamentos e operações existentes.
4. Implementar `swingTrade` usando `market`, `marketPricing` e `orderBook` compartilhados: referências válidas, quotes líquidos, balanceamento interno e simulação.
5. Ampliar `terminalOps` com limite efetivo explícito e revalidação swing, mantendo chamadores antigos. Tratar confirmação, parciais, preço fixo e expiração.
6. Expor status/help e adicionar a chamada em `main` via `guard` e shedding.
7. Documentar arquitetura/roadmap; validar sintaxe, smoke, bundle e atualização AST do grafo.

## Limites e riscos

- Reservas conservadoras podem adiar negócios; processamento manual sem quantidade conhecida protege todo o recurso.
- A retenção de cancelamentos segue a janela de `craft.retentionTicks`; o sweep libera a retenção para a política, sem venda direta.
- Capacidade e crédito precisam ser revalidados porque operações de outros subsistemas podem mudar o estado após o scan.
- Ordens próprias podem ter fills parciais e taxa sem reembolso; preço fixo implica exposição de mercado durante sua vida.
- A reserva `noRelist` é quantitativa por sala/recurso, não identifica unidades individuais.
- A validação offline não substitui observar os intents e transações reais; início em simulação permite inspecionar candidatos antes de habilitar.

## Correção do histórico

- Substituir corte de linhas por paginação linear e limitada a dez segmentos reservados.
- Ativar somente raiz + uma página pendente durante reidratação, preservando slots dos planos.
- Ler version 1 e migrar na próxima gravação; bloquear sobrescrita de histórico incompleto ou páginas de outra geração.
- Persistir amostras coletadas durante reidratação no primeiro tick seguro, sem esperar o próximo scan.
- Cobrir 90 recursos × 168 amostras, precisão, limites, geração, migração, atraso de ativação e integração do coletor.

Comando de flush usa as temporalSnapshots já mescladas; não chama scan nem modifica configurações. Regressão verifica migração imediata e bloqueio antes de hidratação.

Cadência: piso próprio de bucket no coletor, separado de cpu.shedBucket; vencimento histórico bypassa cadence do book; último horário previsto persiste junto à observação real para evitar drift após atraso/reset. Coalescer múltiplos vencimentos sem duplicar preços.

Validação inicial com swing.minSamples=30, incluindo referência de energia do frete. Restaurar 48 após validar; simulação permanece ativa. Override via Memory.settings.swing.minSamples.

### Diagnóstico durante validação no servidor

Expor metadados na validação existente de `swingTrade.reference`, preservando preços, limiares e simulação. O helper `swingReference` lê os dados atuais; observações bloqueadas levam os mesmos metadados. Cobrir amostras com preço ausente e a diferença entre contagem total e válida, sem assumir que o total informado por `marketPrice` atende ao mínimo.

### Ordem de execução e recuperação de hidratação

Mover o guard de mercado para antes dos consumidores e expor `market.historyReady()`. `reference` distingue carregamento de histórico insuficiente; `tick` só registra a cadência depois da prontidão. Ao terminar a hidratação, recalcular o snapshot para os consumidores usarem as medianas completas. Smoke cobre páginas pendentes, referência parcial bloqueada, recálculo e recuperação antes de 120 ticks.

### Reposição sem trava exclusiva de recurso

Remover o veto genérico de operação pendente na compra do swing. Estender `lockConflict` com opções, liberando sobreposições envolvendo uma compra de reposição, preservando os chamadores legados. Descontar os recebimentos pendentes via policy e conservar exclusividade entre saídas. Serializar intents físicos por terminal/tick, descontar combustível carregado por outras operações e vincular recebimentos por orderId/tick ou descrição da transferência. Validar compras parciais simultâneas e cobertura completa do alvo, consumo/reservas de produção e ausência de roubo de carga ou duplicação de reposição.

### Política única de combustível

Criar terminalFuel com previsão fresca por operação/candidato, reserva, carga comprometida e histerese. resourcePolicy, hauler e receipts compartilham esses valores. Executor atualiza o quote de frete e abastece o custo exato; previsão não é somada novamente ao custo da transação atual. Priorizar reposição de energia e revalidar ações opcionais durante escassez. Validar ociosidade, horizonte de duas transações, taxas já carregadas, margem/escassez, ordens listadas, devolução, histerese e frete dinâmico.
