# 0150 — Power com meta evolutiva e operador compatível com labs e terminal

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — compatibilidade de deals/sends/labs e quotas strict implementada localmente; piloto/ops/lifecycle e aceite live pendentes.
- **Issue:** ARK-137 (filha de ARK-128).
- **Created / revisão documental:** 2026-10-15.
- **Contrato integrado e aceite:** [planejamento vigente](../../../docs/planejamento-integrado-2026-10-16.md); análises anteriores são históricas.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.

## Problem

O processamento atual não tem meta/payback nem prova de excedente. O runtime dos labs suspende efeitos e assume lotes de 5.
Os estoques e 7.600 power do handoff são históricos, não um orçamento atual. Operador pode consumir CPU/energia sem produzir venda adicional.

## Desired outcome / In scope

- `power.targetLevel` inicial 3 é marco configurável de reavaliação, não teto permanente. Ao atingir, pausar processamento destinado à evolução.
- Metas maiores explicitamente configuradas permitem nova avaliação sob os mesmos gates; nunca elevar automaticamente nem hardcodar 7.600 power.
- Calcular restante de Game.gpl/constantes, descontando estoque no spawn e transferências comprometidas para não duplicar logística; só processamento confirmado avança GPL.
- Custo restante e investimento total separados; payback usa contribuição marginal realizável da cadeia completa com reagentes, ops, frete, logística, venda e cobertura.
- Preferência econômica pode persistir sem preço; autorização de novo gasto expira. Sem dados/abastecimento válidos, pausar alimentação e processPower, inclusive estoque já no spawn.
- optionalConsumer não comprova excedente: proteger reservas, defesa, manutenção e progresso útil; limitar consumo à energia realmente disponível após compromissos.
- Usar power livre primeiro. Se necessário, permitir cancelamento mínimo de ordens inteiras para liberar o necessário, reconciliando operação/taxas/claims e mantendo excedente livre em estoque por padrão.
- Não criar novas ordens para power; venda futura só em bids conforme política autorizada, sem vender o lote comprometido para processamento.
- Antes do operador: quantidade efetiva de reação em reservas, capacidade, quotas, pendências, confirmação e craftLedger; reconhecer OPERATE_LAB sem suspender a cadeia, tratar caudas de lote e efeitos desconhecidos conservadoramente.
- Operador opt-in; criação/upgrade manuais após gate. Usar GPL livre real e poderes lidos de POWER_INFO, não presumir conta vazia.
- Gate do operador exige pelo menos 2 dias reais de observação válida (0155), gargalo ou economia marginal comprovados e logística disponível. Para ganho baseado em venda adicional, exigir reagentes e profundidade de bid suficiente; para terminal baseado em economia de frete de operações úteis existentes, provar gasto evitado sem exigir venda incremental. Book instantâneo não promete demanda futura.
- Budget de ops considera geração real e usos interrompidos por renew/trânsito; 2 labs sustentados em T1 é limite ideal, não rendimento garantido.
- Suspender atividade econômica por CPU/bucket, mantendo renovação, proteção e retorno seguro; TTL/caminho/margem e cooldown real de spawn. Não prometer teto rígido por medir depois.
- Prioridade de 17/10/2026: OPERATE_LAB e OPERATE_TERMINAL, com orçamento compartilhado de ops e CPU; [decisão e sequência](../../../docs/prioridade-labs-terminal-2026-10-17.md).
- Reusar infraestrutura de ciclo de vida na futura 0122; factory avançada e demais poderes fora desta fase.

### Terminal operado e orçamento conjunto

Antes de ativar OPERATE_TERMINAL, alinhar custo efetivo, combustível, reservas, decisão econômica e confirmação de sends/deals iniciados por nós. O desconto pertence ao terminal pagador do frete; anúncio passivo atendido por outro jogador não gera economia de frete para nós. Não descontar taxas de listing/reprice. Preservar Math.ceil do frete e arredondamento nativo do cooldown; sem efeito manter comportamento atual. Não aplicar fator duas vezes em relay. Mudança/expiração de efeito invalida cotação antes do intent; reconciliação usa deltas atribuíveis, sem inferir sucesso pelo retorno OK.

Separar `requiredEnergy` (pré-condição física para a API aceitar o intent) de `expectedDebit` (consumo previsto com efeito). Nas fontes públicas consultadas, game/market.js e game/structures.js exigem combustível bruto antes de enfileirar deal/send, embora o processor debite o frete descontado. Exemplo: frete bruto100, fator0,9 e terminal com90 ainda pode receber ERR_NOT_ENOUGH_RESOURCES. Disponibilizar/reservar o buffer bruto conservador, incluindo carga ao vender/enviar energia; não contabilizar diferença como consumo. Conciliar e liberar sobra depois, protegendo concorrência. Fixtures de T10 devem cobrir API e processor, não só a fórmula econômica. Versão instalada desconhecida: não reduzir esse buffer por suposição.

Fixtures devem verificar fonte/revisão e fronteira de expiração próprias do terminal, níveis 1–5, energia como carga, efeito externo, capacidade, cooldown e reset. Custo bruto calcTransactionCost não implica desconto automático na API. A cotação parcial de terminalRouting não conclui este contrato.

Um orçamento de ops cobre ambos os poderes e pendências; geração usa nível real, cooldown, deslocamento e renew. T1 ideal gera 20 ops/1.000 ticks; lab custa 10 e terminal 100 por aplicação nas constantes consultadas. Sustentação simultânea não é presumida. Decisão compara contribuição marginal após custos e demanda, sem prioridade fixa por tipo nem compra automática. Unknown bloqueia gasto. Evitar reaplicação antecipada sem benefício justificado.

Diagnóstico sob demanda reusa snapshots/telemetria, sem nova varredura global por tick nem histórico persistente preventivo. Agendar oportunidades do terminal afetado sem aumentar globalmente o poll. O gate de CPU cobre o operador inteiro e seus consumidores, incluindo manutenção/recuperação; suspender economia preserva safety managed. Baseline relatada em 17/10: 19,5 CPU/6h. Aceite desta prioridade exige ausência de aumento sustentado da CPU total sob carga comparável; throughput ou menor frete não são prova de redução de CPU.

### Reações operadas e quotas (pré-requisito da fase 2)

Uma primitive pura reactionAmount(effect,tick) é compartilhada por labPlanModel, labPolicyRuntime, labReactions e reservas/ledger. Quantidade A=LAB_REACTION_AMOUNT+POWER_INFO[PWR_OPERATE_LAB].effect[level-1] enquanto o efeito observado está ativo. O handler público usa endTime>gameTime; ticksRemaining=1 é cenário ativo nas fontes consultadas. Registrar revisão de engine/constants nas futuras fixtures; versão instalada no servidor ainda não identificada. Não generalizar o corte do lab para outros poderes.

Não aplicar/renovar OPERATE_LAB e reagir no mesmo lab/tick na primeira versão. Quantidade incerta por efeito externo: reservar maior consumo/capacidade plausível ou adiar; nunca reservar só a base.
Remover suspensão apenas do efeito suportado; outros efeitos continuam conservadores. Reservar A de cada input compartilhado e capacidade LAB_MINERAL_CAPACITY-A. Produto do mesmo tick não entra no snapshot de inputs.

QuotaMode por owner: strict (default conservador) ou boundedSurplus (opt-in explícito no plano e orçamento). Strict exige candidato executável sem exceder a quota; busca limitada sem prova retorna unknown/replanning. boundedSurplus permite um último lote inteiro quando confirmed+pending<quota: excedente final < A desse lote, com insumos/custo previamente reservados e propagados pela cadeia. Exemplo quota 10/A7: orçamento 14 de cada input, produção 14, sobra 4 identificada como inventário.
Quota/pending são agregados por quotaKey=(ownerId,itemId,product,quotaGeneration), com meta absoluta congelada da fase; múltiplos outputs leem o mesmo confirmed+pending quantitativo e não reiniciam quota por lab. Atualizar pending após cada intent, antes de outro lab decidir. Excedente existente reduz necessidade seguinte; não arredondar repetidamente a mesma demanda. Não alterar teto/quantidade estrita do usuário.

Pending registra tick, owner, out/input IDs, produto, amount/range, stores anteriores e movimentos atribuídos. Confirmar deltas observáveis no tick de origem; concorrência não atribuível fica uncertain e suspende nova reação dependente. Não atualizar produção/custos com literal 5.
Fase encerra só com confirmed>=quota e pending vazio; cadeia exige entrega do produto final. Restante positivo inexequível vai a replanning, nunca é ocultado por drenagem.
Estados de fase: planning → executing/waiting → reconciling → completed ou replanning/uncertain. Waiting tem motivo e nextWakeTick; stall guard proposto craft.operatedStallTicks=300 após a próxima oportunidade conhecida força replanning e preserva material. Sem laço ilimitado.

### Economia, cancelamento e ciclo de vida

Readiness/validade e cobertura são da [0157](../0157-operational-readiness/spec.md).
Defaults propostos: targetLevel=3, maxPaybackDays=30, hysteresisFraction=0.20, reviewTicks=1500, enabled=false, creep.enabled=false, creep.managed=false, allowCancel=false.
Entrada econômica com payback<=24 dias (30×(1-0.20)); saída acima de 30; na banda manter preferência. Preferência nunca substitui validade, margem positiva e orçamento vivo antes de cada gasto.

powerPlan é dry-run: GPL atual, déficit, estoque livre/listado/em trânsito/no spawn, IDs candidatos, quantidade liberada, excedente e custos. Power livre primeiro.
Só após gate e allowCancel, cancelar ordens inteiras elegíveis. Objetivo primário: menor número de ordens cuja remoção libera power físico entregável suficiente. Calcular poolAfterCancel(set) removendo compromissos normalizados de um snapshot vivo, preservando owners/pools/transportes protegidos; remainingAmount nominal não é liberação marginal. Sobrecompromisso, lastro/identidade incertos ou fonte sem atribuição dão unknown e zero cancelamentos. Prefixo por quantidade só é válido quando premissas de lastro e liberação linear no mesmo pool forem verificadas. Outros pools exigem busca pura limitada (power.cancelSearchNodeLimit=1000), sem API/scan por nó; sem prova de mínimo e suficiência no limite, retornar unknown. Desempate entre conjuntos comprovados: menor excedente físico, depois IDs. Não afirmar mínimo global de custo de oportunidade. Excedente fica livre em estoque. Submeter uma ordem, reconciliar e recalcular déficit antes da próxima. Sem cobertura total, não iniciar cancelamentos para um lote inviável.
Cancelamento manual não devolve taxa; expiração natural possui outro ramo. Taxa passada e restituição futura potencial renunciada ficam informativas; preço pedido não garante venda. Desaparecimento de ordem sozinho não cria estoque/crédito. Confrontar estoques, remaining, transações e claims antes de liberar compromisso.

Separar power.enabled (alimentação/processamento) de creep.enabled (economia do operador) e creep.managed (gestão de segurança). Adoção de operador é explícita e atribui managed=true; nunca gerir automaticamente instância não adotada.
- power.enabled=false/target alcançado/dados inválidos: parar feed e processPower, inclusive material já no spawn; reconciliar pendências e preservar estoque.
- Operador managed=true e economia off/suspensa: modo safe mantém proteção, retorno e renew, sem novo power econômico. managed=false entrega controle manual e interrompe intents do bot; manutenção deixa de ser garantida.
- Estados: unspawned → spawnPending → active/safe → renewPending → active/safe; morte → respawnWait, usando cooldown/shard reais. Reset reconcilia instância/TTL/intents antes de repetir; criação/upgrade continuam comandos manuais após gate.
- Target editado invalida plano, calcula GPL atual e cancela só logística futura ainda revogável. GPL já processado/cancelamento consumado são irreversíveis.
- Fase 0 depende de orçamento/retorno válidos, sem depender de compatibilidade de labs. Fase 2 exige 48h observadas do regime-base, gargalo marginal completo e compatibilidade; piloto do regime operado exige nova evidência antes de expansão.

## Acceptance criteria

1. Game.gpl atual determina necessidade; processamento para no target inicial; target maior configurado retoma avaliação sem evolução automática e sem duplicar transferências.
2. Payback/histerese testados com E=20/31.6/70 e power +/-30%; dados ausentes/vencidos, margem não positiva ou profundidade insuficiente bloqueiam novo gasto.
3. Storage cheio sem combustível livre/logística não aprova; storage vazio com renda excedente sustentável pode aprovar orçamento limitado; defesa, repair e upgrade útil não perdem energia.
4. Power livre é usado antes de cancelar ordens; somente cancelamentos necessários são reconciliados, sem liberar/vender duas vezes; nenhuma compra/listing nova.
5. Pausa/target/flag off param alimentação E processamento mesmo com energia no spawn; material já adquirido é preservado.
6. Reações de 5 e operadas de quantidade variável respeitam insumos compartilhados, capacidade, quota residual, efeito iniciando/expirando e reset; confirmação/ledger batem com produção/consumo reais.
7. Operador não é habilitado com cobertura insuficiente ou ganho marginal irrealizável; renew e segurança seguem ativos quando CPU econômica é suspensa, respeitando cooldown real e shard.
8. powerStatus informa target, GPL/restante atual, investimento total/restante, energia, quotes/validade, decisão, motivo e cobertura; não declara payback realizado sem vendas confirmadas.

9. Lote operado respeita `reactionAmount`: nível 1–5 do efeito, efeito começando/expirando, cauda residual e mistura com labs sem efeito; confirmação e `craftLedger` batem com o delta real.
10. `powerPlan()` não cancela nada; sem `power.allowCancel` nenhum cancelamento ocorre; com o flag, somente conjunto mínimo demonstrado no pool físico entregável, com teste de sobrecompromisso100/100/100, pools distintos/sem lastro e reconciliação; unknown não cancela.

11. Terminal operado aplica frete/cooldown do pagador correto, arredondamento e expiração; sem efeito preserva comportamento, anúncios passivos não contam como economia própria e relay não duplica desconto.
12. Lab e terminal disputam um saldo único de ops, sem dupla reserva; geração real, pendências, renew e trânsito entram no retorno. Ausência de orçamento ou cobertura impede intent econômico.
13. Pilotos separados e combinado têm retorno útil e comparação de CPU total representativa; aumento sustentado bloqueia expansão. Diagnóstico não introduz scans globais nem persistência sofisticada.

## Constitution check

Diagnóstico incremental T11-A: powerStatus(roomName?) somente sob demanda, sem escrever Memory nem gastar recursos; informa GPL real, poderes/níveis/cooldowns/TTL observados, ops armazenados (não presumidos livres), efeitos e estoque de labs/terminal/powerSpawn e CPU publicada. Cobertura e orçamento não comprovados permanecem unknown. Não adota, cria, renova nem habilita operador. Custo de geração ideal é informativo e não autoriza sustentar ambos os poderes.

Reusar census/roomCache; configuração em Memory.settings; dados derivados no heap limitado;
somente ownership/recuperação persistente necessária, nunca objetos de jogo; guard e stall guard.
Observações e relatórios novos antes de cpuMeter.endTick. Preservar cascata crítico → saudável → ótimo e fallback.
Smoke e invariantes verificam comportamento, não só ausência de exceção.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.

## Implementação T10-A — 17/10/2026

[Pacote de deals/reservas](../../../docs/entrega-0150-terminal-a-2026-10-17.md) implementado localmente; compatibilidade de sends, concorrência de efeitos e operador continuam pendentes. Não confundir suporte a efeito já observado com ativação do poder.

### Contrato incremental de send — T10-B

OK de send cria pendingSend escalar e reserva carga+buffer bruto até conciliação. Transação por descrição/rota/recurso/tick comprova quantidade; fallback requer movimentos compatíveis nos dois terminais. Parcial mantém amount original, sentAmount acumulado, remaining positivo e descarrega a parcela antes de enviar o resto. Não criar receipt concorrente para pending de transferência gerida. Sem efeito observado, só repetir depois de confirmar ausência de movimento; ambiguidade bloqueia novo send com motivo e stall guard. Cancelamento espera conciliação, não solta carga aceita. Usar fator do intent, buffer bruto na pré-carga e débito previsto somente no custo confirmado; legado sem pending mantém tratamento anterior.

## Compatibilidade B — 17/10/2026

[Entrega e gate live](../../../docs/pacote-power-compatibilidade-2026-10-17.md): sends deferidos/parciais, quantidade comum de labs e quota strict, cronologia de efeitos e powerStatus sob demanda. Operador/ops/readiness/piloto continuam pendentes; aguardam fatos e validação em jogo antes de acrescentar controle ativo.
