# 0150/T10-A — Terminal operado: deals e reservas — 17/10/2026

## Entregue localmente

Primeiro pacote de implementação da prioridade labs/terminal, na ARK-137. O runtime reconhece OPERATE_TERMINAL já observado ao cotar/executar deals iniciados pelo bot. Não cria, move nem ativa Power Creep.

- `terminalPowerCost` compartilha leitura do fator e arredondamento entre terminalOps, swingTrade e cotação de relay. Sem efeito retorna custo bruto; desconhecido não inventa desconto.
- `cost` passa a representar o débito previsto; `requiredEnergy` preserva o frete bruto exigido pela API. Critérios de preço/frete e quantidade líquida comprada usam o primeiro; funding, claims e previsão física de combustível usam o segundo. Venda de energia exige carga mais frete bruto antes de chamar deal.
- O pending guarda fator e buffer em escalares. Liquidação parcial usa a quantidade confirmada e o fator do intent, mesmo após reset ou mudança/expiração posterior do efeito. Buffer sem uso não vira consumo; claims do intent são liberados na conciliação. Pending legado sem campos novos mantém fator1 e custo anterior como buffer.
- Compra de energia por swing limita quantidade pelo líquido descontado, evitando exceder o déficit porque o terminal ganhou eficiência. Anúncios passivos continuam sem frete próprio contabilizado; suas taxas não recebem desconto.
- O fallback de saldo de venda de energia exige saída de carga mais frete previsto antes de declarar preenchimento completo; retorno OK sozinho não avança a liquidação de deals.

Não há novas consultas de mercado, Room.find, passagem sobre creeps, cadência mais frequente ou histórico persistente. Fator lido uma vez por seleção de ordens; caches de frete bruto existentes continuam. Há chamadas escalares adicionais e dois campos temporários por pending: custo live ainda não medido, não prometido como zero.

## Limites do pacote

**T10 continua parcial.** Transferências `terminal.send` mantêm pré-carga/contabilidade anteriores, conservadoras pelo frete bruto; confirmação deferida e custo operado de sends são o próximo subpacote. Relay continua somente cotação, sem execução nova. Lab operado, decisão conjunta de ops/CPU, diagnóstico, agendamento e lifecycle do operador ainda não implementados. Nenhum piloto/poder/deploy ativado.

Este pacote assume o efeito visível ao submeter o intent e a semântica das revisões abaixo. Aplicação/renovação concorrente de poder no mesmo tick exige contrato adicional de conciliação; não foi validada em servidor. A gestão futura não deve aplicar/renovar poder e usar o mesmo terminal no mesmo tick até fechar esse contrato. Confirmação atual herda o fallback de saldo existente: concorrência externa não atribuível não é provada por estas fixtures. T10 completo exige revisar esse limite antes de ativar operador.

A política de escassez e o forecast físico permanecem conservadores quanto ao buffer bruto. O desconto não autoriza compra de ops, investimento GPL ou gasto fora dos gates já existentes. reuseOrderBook segue true por padrão, com opt-out explícito preservado.

## Fontes e teste

Fontes baixadas e verificadas na pasta ignorada de validação; fixture autoral com revisões e SHA256 em `test/fixtures/0150-terminal-power.json`. Não é um emulador do engine; versão instalada no servidor continua desconhecida.

- [API de deal, engine a90d26f](https://github.com/screeps/engine/blob/a90d26fc9eb943147799e65d0bf9d4d0d79a2722/src/game/market.js): frete bruto na admissão.
- [Processador de mercado, mesma revisão](https://github.com/screeps/engine/blob/a90d26fc9eb943147799e65d0bf9d4d0d79a2722/src/processor/global-intents/market.js): pagador, desconto, arredondamento e expiração.
- [POWER_INFO, common 2fb779b](https://github.com/screeps/common/blob/2fb779b26eef9b4b0f412584f6bd47c897949766/lib/constants.js): fatores dos níveis1–5.

Regressões novas falharam antes: desconto nos cinco níveis, parcial após reset, líquido da compra de energia e exigência de carga+frete bruto na venda. Passaram após integração. Casos adicionais cobrem arredondamento, efeito expirado/desconhecido, preço efetivo, claims contra o próprio owner, liberação do buffer, replay e tamanho de compra swing.

Validação final e hashes: `graphify-out/validation-0150-terminal-a/`. Smoke11.950 assertions OK. Sintaxe dos7 JS tocados, diff check e build isolado de128 módulos concluídos. Arquivo real do cliente preservado com o hash da baseline; dist é somente artefato local.
