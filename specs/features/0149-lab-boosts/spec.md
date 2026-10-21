# 0149 — Boosts com retorno realizável e abastecimento

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** done (código) — executor automático de boost de builder (planejar/aplicar/confirmar, compra só quando paga) publicado em 2026-10-21, ligado por padrão em todas as salas (`boost.room = "all"`); piloto live (T7) na ARK-203.
- **Issue:** ARK-136 (filha de ARK-128).
- **Created / revisão documental:** 2026-10-15.
- **Contrato integrado e aceite:** [planejamento vigente](../../../docs/planejamento-integrado-2026-10-16.md); análises anteriores são históricas.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.

## Problem

Preço favorável e duty histórico não garantem benefício: sem energia ou logística o creep boostado pode ficar parado.
O modelo anterior misturava progresso adicional com economia para trabalho fixo, e a logística não incluía energia/retention do lab.

## Desired outcome / In scope

- Piloto: XLH2O próprio em builders das salas com lab, opt-in e boost.enabled false. Sem compras automáticas no piloto.
- `boostPolicy.worth(role, compound, context)` é pura: corpo/partes elegíveis, vida produtiva após preparação/viagem, demanda, energia acessível, renda/concorrência/logística e dados válidos.
- Separar benefício de trabalho fixo (energia/ações evitadas) de capacidade adicional útil; nunca somar sobre o mesmo trabalho. WORK usado em upgrade não recebe benefício de XLH2O.
- Custo inclui composto pelo uso alternativo executável, 20 energia/parte, frete/logística e indisponibilidade do lab. Ler multiplicadores/custos em constantes, suportar quantidade parcial.
- Storage 0 não é veto se houver alimentação sustentável por links/containers/renda; storage cheio não aprova sem entrega. Sem cobertura confiável não assumir duty 1 nem benefício positivo.
- Preparar somente lab livre sem interromper cadeia ou pin manual; reservar composto e energia por owner, quantidade e deadline, respeitando claims e saldo exposto no mercado.
- Spawn normal nunca espera. Decisão preliminar no spawn é revalidada antes de aplicar; se abastecimento/demanda piorarem, liberar e trabalhar sem boost.
- Integrar abastecimento de energia e composto à retenção/drenagem; só liberar reserva após confirmação do corpo ou falha/timeout/morte/reset/flag off. Lab volta ao pool em fronteira segura.
- Helper de aquisição futura: apenas deals existentes, preço executável na quantidade e sem listing; não ativar compras sem revisar o piloto.
- Upgrader/CARRY e novas compras são fases posteriores. Reserva de lab pode reduzir produção; deadline sozinho não demonstra ausência desse custo.

### Reserva, seleção real de partes e encerramento

Armazenamento único: Memory.rooms[room].labBoostReservations[labId], normalizado exclusivamente por labReservations. Não criar labReserve paralelo. Booleanos/manuais legados permanecem externos, sem cleanup automático.
Registro automático: {version,reservationId,ownerRequestId,ownerCreepId,generation,sessionId,compound,selectorVersion,bodyPartsCount,predictedSelectedIndexes,partsRequested,partsConfirmed,requiredMineral,requiredEnergy,createdTick,deadlineTick,state,pending,drainDeadlineTick,reason}. IDs/índices são dados, não objetos de jogo.

A API boostCreep recebe bodyPartsCount, não índices arbitrários. selectBoostParts(body,compound,count,stores,constants) deve reproduzir a seleção do motor da fixture: partes compatíveis não boostadas, inclusive destruídas, ordem invertida para não-TOUGH e prefixo limitado pelo count e pelos recursos. predictedSelectedIndexes é previsão da seleção, nunca argumento da API. Count zero não chama a API.
Benefício usa só capacidade viva selecionada; custo inclui todas as partes selecionáveis, mesmo destruídas. Piloto rejeita prefixo que inclua parte destruída; pode reduzir count somente se o novo prefixo real satisfizer o gate. Não pode saltar uma parte destruída para atingir outra arbitrária. Corpo misto, partes já boostadas e orçamento parcial participam da seleção.
Fonte primária: [boost-creep.js](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/boost-creep.js), consultado16/10; fixar revisão/constants na fixture e confrontar servidor antes da ativação.

requiredMineral/requiredEnergy são totais-alvo da seleção ainda não confirmada, por LAB_BOOST_MINERAL/LAB_BOOST_ENERGY; missing=max(0,required-stockNoLab-entregasPendentesDoOwner). Um commitmentId identifica cada material/localização/trânsito sem duplo desconto.
Admissão é bundle de energia/composto/lab e exclusividade do alvo creep/tick. Se parcela falhar, liberar somente reservas ainda não submetidas. Spawn não espera; preparação acompanha creep em trabalho normal. Deadline boost.deadlineTicks=100 desde vinculação, reduzido pela vida rentável.

Estados: reserved → loading → applying → confirming → draining → released, com terminais transferToManual ou quarantined quando apropriado.
Só adquirir lab livre sem cadeia/pin/hold alheios. Todos os leitores de refining/runtime/modelo/executor/hauler/claims usam o adaptador. Em reserved/loading/applying/confirming, transientStock retém compound e energyTarget=max(craft.labEnergyTarget,requiredEnergy). Antes de aplicar, revalidar owner/geração/pin/corpo/seleção real/readiness/retorno/prazo.
OK cria pending com corpo anterior completo, count previsto e custos. Confirmar diferenças no corpo inteiro e consumo atribuível, não só índices previstos. Parcial recalcula seleção/count/custos no corpo atual antes de nova tentativa. Dano posterior à decisão reduz benefício observado, sem inventar reversão de gasto. Mutação externa não atribuível fica uncertain e não reaplica.

Reset cancela preparação automática após reconciliar corpo/pending. Morte/prazo/off encerram idempotentemente; boost consumado fica contabilizado.
No encerramento, remover somente jobs/holds/claims da geração automática. Em draining, transientStock expõe como obrigação de cleanup o resíduo do owner automático, independentemente de craft.drainIdleLabs e de holds já encerrados desse owner. Não ignorar retenção de outro owner/pin. Drenar somente material não assumido por um owner protegido.
Compatível = mineral vazio ou igual ao produto/reagente do próximo uso autorizado, quantidade física aceita pelo novo owner e ausência de pending. Transferir inventário/claims atomicamente a esse owner pode encerrar cleanup sem mover mineral; não é estoque livre duplicado.
Pin manual posterior transfere explicitamente a custódia ao owner externo (incluindo conteúdo remanescente), encerra a reserva automática com transferToManual e preserva o pin. Lab continua excluído pela autoridade manual; não prometer retorno automático ao pool nesse caso.

drainDeadlineTick=encerramento+boost.drainTimeoutTicks (default300). Sem hauler/destino/capacidade, registrar cleanupBlocked e nextWakeTick; não renovar prazo silenciosamente. No prazo, quarantined encerra o compromisso de boost e libera suas reservas de abastecimento não submetidas, mas preserva bloqueio físico/claim do resíduo sob owner de cleanup limitado a um registro por lab. Reavaliação guardada a cada25ticks ou mudança de logística/pin; recuperação drena/transfere e então released. Não liberar lab incompatível só por timeout nem manter tentativa de boost viva indefinidamente.
Em condições físicas disponíveis, cleanup deve progredir mesmo com drainIdleLabs=false. Released livre somente após disposição segura; intervenção manual/quarentena têm motivo visível, não sucesso fictício.
Readiness/métricas são da [0157](../0157-operational-readiness/spec.md); fallback §9 vale para normal e boostado.

## Acceptance criteria

1. Política distingue economia de energia e capacidade adicional; testa seleção real por bodyPartsCount (ordem inversa, parte destruída, TOUGH, corpo misto/parcial), demanda finita, vida perdida, energia 20/31.6/70 e histerese sem dupla contagem.
2. Boost rentável sem energia acessível nem reposição é rejeitado; storage 0 com alimentação sustentável é avaliado; energia comprometida com defesa/economia é excluída.
3. Espera/logística insuficiente reduz benefício; dados ausentes/vencidos ou deterioração antes da aplicação resultam em creep normal sem bloquear spawn.
4. Lab recebe composto e energia suficientes; transientStock não drena reservas; claims impedem disputa com cadeias, listings e outros creeps; sem lab livre não há boost.
5. Boost OK é conciliado pelo corpo inteiro/seleção real e custos atribuíveis no tick seguinte; falha, parcial, deadline, morte, reset e flag off liberam reservas sem aplicar de novo ou interromper cadeia ativa.
6. Aquisição futura só usa asks executáveis com frete/taxas, createListing=false; profundidade insuficiente não cria ordem nem aprova lote incompleto.
7. Relatório distingue consumo estimado/confirmado e benefício previsto/realizável/observado; não declara ganho só por comparar energia de duas chamadas OK.

8. Reserva de composto/energia sobrevive ao ciclo de drenagem do `transientStock` até confirmação ou expiração; depois, cleanup independente de drainIdleLabs libera lab em condição física adequada; pin/takeover, falta de destino/hauler e quarantined são desfechos explícitos, sem promessa falsa de retorno ao pool.
9. Com a faixa preterida como único trabalho disponível, o creep boostado não fica ocioso (fallback §9).

## Constitution check

Reusar census/roomCache; configuração em Memory.settings; dados derivados no heap limitado;
somente ownership/recuperação persistente necessária, nunca objetos de jogo; guard e stall guard.
Observações e relatórios novos antes de cpuMeter.endTick. Preservar cascata crítico → saudável → ótimo e fallback.
Smoke e invariantes verificam comportamento, não só ausência de exceção.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.

## Entrega parcial 0149-A — 16/10/2026

Seleção pura, `boostPreview` e adaptador/leitores implementados localmente. Ver [escopo, limites e sequência](../../../docs/entrega-0149-a-2026-10-16.md). T1 econômico, bundle de T2, spawn/confirmação de T4 e lifecycle de T5 continuam pendentes. Não há writer, abastecimento de composto nem aplicação automática. Fixtures semânticas não substituem pin do engine ou validação live.

## Entrega parcial 0149-B — 16/10/2026

Política pura de retorno fixed/capacity, checker de entrega por prefixos e preparação controlada de XLH2O próprio implementados localmente. Bundle físico de origem/cargo/lab no registro canônico, confirmação deferida de transporte e recuperação de off/reset/morte/deadline/pin/quarentena. Claims continuam valendo com stockPolicy desligado; coleta normal de energia pode revogar preparação opcional. Defaults desligados, uma sala/builder, sem compras.

Núcleo puro de confirmação do boost testado por corpo inteiro/estoques, ainda não ligado a um intent nativo. Falta coletor/admissão comum de combustível futuro, candidato/approach/executor e confirmação no runtime, pin/servidor e validação live. Não tratar o contexto manual de teste como evidência em produção. [Pacote e limites](../../../docs/pacote-boost-2026-10-16.md).
