# Prioridade funcional: labs e terminal — 17/10/2026

## Decisão e situação atual

Priorizar `PWR_OPERATE_LAB` e `PWR_OPERATE_TERMINAL` na 0150/ARK-137. São poderes de Power Creep; o boost mineral XLH2O de builders da 0149 continua sendo outra entrega, ainda parcial. A prioridade não ativa poderes nem autoriza criação/upgrade automático de operador.

O usuário relata média de **19,5 CPU nas últimas seis horas**. Este é o ponto de partida informado, sem atribuição causal a uma versão. Não assumir folga contínua de 0,5 CPU, nem prometer custo zero. O desenvolvimento deve preservar o caminho sem efeitos e permitir comparar trabalho útil e CPU sob carga equivalente.

`terminalOps.reuseOrderBook=true` já está no código local e fica como padrão por decisão explícita do usuário. Um `false` persistido continua prevalecendo; nenhum comando altera a Memory em jogo nesta entrega. Os testes existentes comparam manutenção real de ordens em 3/5/10 salas, inclusive reset e edição manual. Menos consultas não comprova economia de CPU live: o A/B anterior praticamente empatou (17,900 contra 17,907 CPU/tick).

## Onde está o ganho

| Poder | Exemplo de nível 1 | Condição para valer a pena |
|---|---|---|
| `OPERATE_LAB` | Reação passa de 5 para 7 unidades, com o mesmo cooldown; consome 7 de cada reagente | Reação/cooldown precisa limitar produto útil, com reagentes, transporte, capacidade e demanda disponíveis |
| `OPERATE_TERMINAL` | Fator 0,9 no frete e cooldown nominal de 10 para 9 ticks | Envios/deals iniciados por nós precisam gerar economia ou vazão que cubra ops, deslocamento e CPU |

O lab não cria reagentes grátis: o ganho é vazão por reação. O lote operado exige os insumos completos e espaço; o motor não reduz automaticamente o lote para caber na sobra. Quantidades, reservas, quotas e confirmação precisam concordar antes de remover a suspensão atual de labs operados. [Constantes oficiais](https://github.com/screeps/common/blob/master/lib/constants.js), [execução de reação](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/run-reaction.js).

No terminal, o desconto segue o terminal que paga o frete: origem de `send` e terminal de quem inicia `Game.market.deal`. Quando outro jogador atende nosso anúncio, o frete/cooldown é dele. Esse volume passivo não justifica operar nosso terminal. O poder também não reduz taxas de criação/reprecificação de ordens. O frete é arredondado para cima e o cooldown arredondado pelo motor; usar esses valores efetivos no retorno. [Processamento oficial de mercado e transferências](https://github.com/screeps/engine/blob/master/src/processor/global-intents/market.js).

Separar `requiredEnergy` (pré-condição física para a API aceitar o intent) de `expectedDebit` (consumo previsto com efeito). Nas fontes públicas consultadas, game/market.js e game/structures.js exigem combustível bruto antes de enfileirar deal/send, embora o processor debite o frete descontado. Exemplo: frete bruto100, fator0,9 e terminal com90 ainda pode receber ERR_NOT_ENOUGH_RESOURCES. Disponibilizar/reservar o buffer bruto conservador, incluindo carga ao vender/enviar energia; não contabilizar diferença como consumo. Conciliar e liberar sobra depois, protegendo concorrência. Fixtures de T10 devem cobrir API e processor, não só a fórmula econômica. Versão instalada desconhecida: não reduzir esse buffer por suposição.

Fontes da pré-condição: [API de deal](https://github.com/screeps/engine/blob/master/src/game/market.js), [API de terminal.send](https://github.com/screeps/engine/blob/master/src/game/structures.js).

## Um orçamento de ops para os dois

Nas constantes consultadas, ambos duram 1.000 ticks; aplicar lab custa 10 ops e terminal custa 100 ops. `GENERATE_OPS` nível 1 produz 1 a cada 50 ticks: limite ideal de 20 ops por 1.000 ticks. Um terminal continuamente operado já excede essa geração, antes dos labs, renew e deslocamentos. Não pressupor nível de poderes, GPL disponível, estoque gratuito ou compra automática. Renovar cedo aumenta o custo por tick útil. [POWER_INFO oficial](https://github.com/screeps/common/blob/master/lib/constants.js).

Avaliar por sala o benefício marginal, descontando ops pelo custo de oportunidade, energia, reagentes, frete e logística. Só comprometer estoque realmente livre. O mesmo saldo não pode financiar os dois poderes simultaneamente. Quando ops ou CPU não cobrem ambos, adiar o de menor retorno comprovado; empate usa critério determinístico. Dados insuficientes mantêm o poder desligado. Não fixar prioridade universal lab > terminal: isso depende da carga real.

## Sequência de execução

1. **Preservar o padrão de livro compartilhado.** Cobrir configuração ausente e `false` explícito; manter testes de equivalência. Sem mudar cadência ou política de ordens.
2. **Compatibilidade mecânica sem operador.** Nos labs, compartilhar quantidade efetiva entre modelo, executor, reservas e ledger, com caudas e inputs compartilhados. Nos terminais, compartilhar custo efetivo entre decisões de envio/deal, combustível, reservas e confirmação; evitar aplicar o desconto duas vezes nas cotações de relay existentes. Testar sem efeito, níveis 1–5, expiração, efeito externo, reset e concorrência. Fixtures devem fixar revisão de fontes; servidor instalado ainda não identificado.
3. **Diagnóstico sob demanda.** Reusar telemetria e snapshots existentes para separar reação útil de espera, e frete pago por nós de anúncios passivos. Relatar ops livres/gerados, efeito útil, retorno e cobertura. Sem histórico persistente novo, varredura global por tick ou consulta extra de mercado só para diagnóstico. Dado ausente permanece desconhecido.
4. **Decisão conjunta e lifecycle.** Um operador, orçamento compartilhado e destinos limitados; próximo despertar por cooldown/expiração relevante. Manter cadência normal de terminal: reduzir cooldown 10→9 não garante vazão se o poll de 5 ticks só acorda no tick 10. Avaliar despertar pontual do terminal afetado, sem passar todo o subsistema para cada tick. Suspensão econômica por CPU/bucket preserva manutenção segura de operador explicitamente adotado.
5. **Pilotos separados e depois combinados.** Gate de pelo menos 48h de evidência válida do regime-base, sem exigir infraestrutura persistente sofisticada. Após autorização operacional, medir lab e terminal separadamente antes da combinação, sob carga comparável. Aceite exige trabalho útil/retorno e ausência de aumento sustentado de CPU total; picos, bucket e custo de renew/reset entram na avaliação. Se a carga mudar, o resultado é inconclusivo até comparação adequada. Expansão permanece condicionada.

O runtime atual tem cotação de terminal operado em `terminalRouting`, mas isso não prova integração completa em `terminalOps`/`terminalFuel`; esses caminhos ainda usam custo bruto. A 0150 permanece **planejada**. A preparação de boost 0149-B continua **parcial local**. Nenhum operador, gasto, deploy ou flag de economia foi ativado por esta revisão.

## Rastreabilidade e validação

Contrato atualizado em [0150/spec](../specs/features/0150-power-creeps/spec.md), execução em [plan](../specs/features/0150-power-creeps/plan.md) e [tasks](../specs/features/0150-power-creeps/tasks.md). Fontes públicas consultadas em 17/10/2026; links de branches móveis não substituem fixtures pinadas nem validação da versão do servidor.

ARK-137 já existe em Backlog; ARK-139 em In Progress. A tentativa de atualizar estado/descrição no Linear não foi executada: a revisão automática de aprovação atingiu limite de uso. Atualização remota pendente; esta documentação não afirma sincronização concluída.

### Verificação local deste pacote

node --check nos dois JS tocados, smoke com 11.917 assertions OK, diff check e build isolado de127 módulos concluídos. Hash do arquivo no cliente real preservado; nenhuma publicação. Grafo AST atualizado. Não há mudança de comportamento no runtime; o código recebeu somente comentário no padrão já true; duas assertions cobrem default e override. Compatibilidade de poderes, diagnóstico, orçamento e lifecycle continuam tarefas futuras.

Revisão independente solicitada ao agente de planejamento apontou a distinção entre buffer bruto da API e débito efetivo do processor; incorporada acima e em spec/plan/T10 antes de qualquer integração.

A revisão também removeu a dependência universal de observação de labs/venda do piloto terminal-only: evidência de frete próprio e fluxo útil pode justificar esse piloto, mantendo 48h e orçamento comuns. Piloto combinado deve cobrir os dois poderes.
