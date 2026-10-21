# 0155 — Utilização e produção confirmada dos labs

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** done — labReport com confirmação por cooldown, produção final vs intermediária, regime/época e evidência de 48h (gate do OPERATE_LAB) publicados em 2026-10-21; 48h live na ARK-203.
- **Issue:** ARK-134 (filha de ARK-128).
- **Created / revisão documental:** 2026-10-15.
- **Contrato integrado e aceite:** [planejamento vigente](../../../docs/planejamento-integrado-2026-10-16.md); análises anteriores são históricas.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.

## Problem

state.wait é resultado parcial: ready precede execução e pode virar reservation/intent error. Early returns e consultas repetidas
não formam amostragem uniforme. Cooldown elevado de um lab não demonstra ganho marginal da cadeia ou venda adicional.

## Desired outcome / In scope

- Uma observação final por lab/tick, incluindo períodos sem assignments. Classificar saída/entrada/lab não alocado e produto/fase; labs existentes sem atividade não desaparecem do denominador de disponibilidade.
- Estados distinguem cooldown, ready, intent aceito, confirmação, input, transporte quando comprovado, switch, capacity, reservation, intent erro, planning, powers, manual/boost, sem demanda, unavailable e unknown.
- Capturar decisão em assignments, resultado em execute e confirmação posterior; contabilizar cada uma no tick de origem e sem somar consultas repetidas.
- Separar disponibilidade física, utilização da saída elegível e produção final da cadeia; registrar denominador de cada métrica. Ready/cooldown são proxies, não confirmação nem receita.
- Contar quantidade efetiva confirmada, efeitos e produto; estimativa LAB_REACTION_AMOUNT/REACTION_TIME rotulada, sem dupla contagem de intermediários.
- reactionLimited threshold proposto 0.85 é indicador descritivo; inputLimited inclui causas observadas de espera, sem presumir transporte apenas porque falta reagente.
- Conclusão para investimento exige pelo menos 2 dias reais válidos e gargalo da cadeia completa, abastecimento de energia/reagentes, hauler e capacidade de venda; janela curta pode imprimir sem aprovar.
- Heap limitado por entidades/janelas; reset/gaps preservam agregados confirmados e descontam lacunas conforme 0157. Não declarar dois dias por multiplicar ticks por 4.1 ou juntar globais sem dados persistidos.
- `labReport(n=1200)`/auto-report exibem top 3 motivos, unknown/cobertura, quantidades estimadas/confirmadas e sugestão proporcional à evidência; quando inputLimited não provar retorno zero absoluto, informar hipótese em vez de encerrar definitivamente o poder.

### Observação final e cobertura por regime

Coletar uma observação final por lab/tick em hook próprio depois de todos os executores, antes de cpuMeter.endTick, inclusive em cache hit/off de planejamento e sem assignments. Se coleta estiver off, manutenção de pendências continua, mas o período não tem cobertura.

Registro efêmero: {originTick,labId,room,product,phase,physicalAvailable,eligibleOutput,state,intentStatus,expectedAmount,confirmedAmount,quality,owner,regimeId}. Uma classificação principal por lab/tick; confirmação é resultado vinculado à origem. Fonte fecha em até5ticks como confirmado/unknown para coverage; após fechamento, tardio é só diagnóstico. Estatísticas por população/qualidade são as do metricSet da0157, incluindo saídas elegíveis distintas do físico.
Precedência da classificação: unavailable/manualBoost/powersUnsupported; planning/switch; erro/claim/reservation/capacity/input; intentAccepted; cooldown/ready/noDemand; unknown. O observador não inventa falta de transporte apenas de input ausente.
Disponibilidade usa todos os labs físicos observados; utilização usa saídas elegíveis por tick. Produção final por cadeia/produto conta somente quantidade final atribuível confirmada e entregue; intermediários não somam. Confirmar quantidade variável sem alterar decisões do executor.

Persistência e gate são exclusivamente os da [0157](../0157-operational-readiness/spec.md): 48h efetivamente observadas no mesmo regime, duração/qualidade/denominadores explícitos e limites serializados. Reset conserva agregado confirmado e perde cauda não persistida. Flag off abre gap. Regime novo não herda aprovação anterior.
ReactionLimited=0.85 é descritivo; investimento também exige reagentes, energia, transporte, ops e demanda executável da cadeia completa. Baseline habilita avaliação do piloto; regime operado exige nova evidência antes de expansão.

## Acceptance criteria

1. Sequência roteirizada reproduz estados por tick/lab/produto; múltiplas chamadas no mesmo tick contam uma observação e early returns não somem do relatório.
2. Ready com intent rejeitado não vira produção; reservas/erros/capacidade/input e confirmação tardia são distintos e ligados ao tick de origem.
3. Fixtures 95% e 50% de utilização indicam gargalo descritivo com denominador explícito; cobertura curta/lacunosa, mudança de regime ou qualidade insuficiente impede gate econômico; reset sozinho não apaga evidência válida.
4. Produção confirmada por produto/fase usa quantidade real e não soma intermediários à produção final; estimativa por cooldown permanece rotulada.
5. Auto-relatório mostra top 3 causas e cobertura sem alterar decisão/intents; overhead da observação final medido antes de endTick.
6. Labs ativos com falta de reagentes, energia logística, transporte ou venda não aprovam ganho marginal de OPERATE_LAB somente pela utilização; exige 2 dias reais válidos e verificação da cadeia.

7. `0155 representative coverage`: gate exige 172800000ms observados no mesmo regime e qualidade da 0157; dias parciais/reset/off/alteração de população/topologia não fabricam 48h; preservar agregados e respeitar tetos.

## Constitution check

Reusar census/roomCache; configuração em Memory.settings; dados derivados no heap limitado;
somente ownership/recuperação persistente necessária, nunca objetos de jogo; guard e stall guard.
Observações e relatórios novos antes de cpuMeter.endTick. Preservar cascata crítico → saudável → ótimo e fallback.
Smoke e invariantes verificam comportamento, não só ausência de exceção.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.
