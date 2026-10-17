# 0156 — CPU: redundância comprovada, caches e orçamento

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0156-A e L2-book concluídos localmente; ganho live e demais itens pendentes.
- **Issue:** ARK-139 (filha de ARK-128).
- **Created / revisão documental:** 2026-10-15.
- **Contrato integrado e aceite:** [planejamento vigente](../../../docs/planejamento-integrado-2026-10-16.md); análises anteriores são históricas.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.

## Problem

Probes de 92–99% omitem entradas e são limites superiores. O oráculo original podia ignorar efeitos; o reparo 0156-A está implementado localmente, com aceite global registrado no plano de execução.
Uma assinatura pode custar tanto quanto recalcular; callbacks de segurança e observações por tick não são decisões puras cacheáveis.

## Desired outcome / In scope

- Pré-requisito: reparar oráculo/isolamento e comparar retorno, estado, intents, erros e efeitos em sequências com caches aquecidos.
- Priorizar dados estruturais e redundâncias dentro da decisão. Medir assinatura+invalidação+efeitos reproduzidos; não criar decisionCache genérico antes de justificar.
- L2: separar cálculo puro de manutenção viva; preservar confirmação, extensão, deals, fees, créditos, claims, estoque e transições temporais. Aplicar política 0153 revisada antes de congelar referência.
- L3: separar geometria/seleção de mutações em desired/refilling/switching, observações, logística, fase e confirmação. Coleta 0155 continua uma vez por tick mesmo em cache hit.
- Assinaturas incluem entradas efetivamente lidas, identidade/provedor onde relevante, mudanças intratick, efeitos/pins/reservas e fronteiras de prazo/cooldown. Não usar só hash parcial como prova de igualdade.
- L4: dedupe por sala/tick já existe em transitSafety; preservar eventos, snapshots de vítimas do tick anterior, hostis, controller e expiração sem atraso. Só otimizar trabalho comprovadamente redundante.
- Histórico de preço e cache de candidatos não congelam autorização de gasto/readiness; revalidar no ponto do intent.
- L6: fatiar scan muda momento da decisão; somente após contrato específico de latência máxima, frescor, orçamento, urgência e justiça, revisado separadamente. Não afirmar equivalência exata por resultado final parecido.
- L7: hidratação lazy com recuperação de estado e orçamento de segmentos, sem atrasar defesa/essenciais; reportar cold e custo amortizado pela frequência real de resets.
- O3: retirar spans/migrações apenas após comprovar ausência de dependências e recuperação pendente; manter restauração legada de abTest até encerramento seguro.
- Flags opt-in por item, caches limitados no heap, sem TTL novo de saldo/preço/estoque e sem indexar ordens próprias entre chamadas; capacidade de reverter sem deploy.

### Oráculo isolado e dependências por item

Pacote 0156-A (oráculo) é isolável depois de autorização futura. O pedido atual autoriza apenas documentação.
Factory cria mundos/stubs independentes; um mundo e um conjunto de módulos por variante durante toda a sequência. Purga e restauração de globais/providers entre variantes/cenários em finally; não purgar caches entre passos.
Projetar clone executado em cada passo; capturar retorno, Memory/claims, trace ordenado de intents/taxas e estado parcial pós-exceção. Comparar tipo/mensagem de erro e mundo pós-erro. Arrays conservam ordem. Snapshot não serializável deve falhar explicitamente, sem sumir da projeção.

Autotestes: claims 10/999, intent distinto, ordem distinta, só estado, só erro, mesmo erro com estado parcial distinto, par equivalente, cache entre passos e isolamento de globais. Fixture define completude de observáveis; o oráculo não prova entrada que não recebeu.

0156-B/L2 depende do oráculo e política 0153 revisada para congelar referência.
0156-B/L3 depende do oráculo, contrato de observação 0155 e adaptador canônico de reservas 0149; não exige piloto de boost concluído.
L4/L7/O3 seguem seus contratos locais. L6 continua condicionado a revisão específica de latência. Não afirmar que só o oráculo bloqueia toda a feature.

Cache puro nunca contém saldo/readiness entre decisões. Guardas, reconciliação, limpeza de owners e observação final continuam em cache hit e com flags off. Testar off entre intent e confirmação, reset, provider/config/pin/reserva intratick e colisão de assinatura. Descartar cache não descarta operação pendente.

## Acceptance criteria

1. Oráculo detecta claims 10 vs 999 com retorno igual; compara mundos pós-execução, intents/erros e sequências; stubs/globais não vazam entre variantes.
2. Cada entrada lida invalida no tick e intratick; fronteiras de prazo disparam no instante correto; reset/flag off/provedor alterado e colisões de hash não congelam resultado.
3. L2 preserva decisão, preço, quantidade, fees, extensão, confirmação, deals e claims; L3 preserva reactions/holds/desired/reasons e efeitos/observação por tick.
4. L4 preserva detecção imediata de hostis/eventos, vítima morta no tick anterior, propriedade e vencimentos; não alega ganho por adicionar dedupe já existente.
5. Assinatura e cache completos reduzem spans em carga comparável sem mudança de produção útil/ordens/contabilidade; probe ou benchmark Node não demonstra ganho de CPU Screeps.
6. Scans fatiados não são ativados sem contrato de latência aprovado; cold/lazy preserva recuperação/segmentos/defesa e limpeza não remove rollback legado ainda necessário.

7. Autoteste do oráculo: todos os pares divergentes declarados são detectados, inclusive mesmo erro com estado parcial diferente; um par equivalente não gera falso positivo; a reprodução do relatório (`claims 10×999`, retorno igual) deixa de reportar `equal: true`.

## Constitution check

Reusar census/roomCache; configuração em Memory.settings; dados derivados no heap limitado;
somente ownership/recuperação persistente necessária, nunca objetos de jogo; guard e stall guard.
Observações e relatórios novos antes de cpuMeter.endTick. Preservar cascata crítico → saudável → ótimo e fallback.
Smoke e invariantes verificam comportamento, não só ausência de exceção.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.

## Entrega L2-book — 16/10/2026

[Pacote local](../../../docs/pacote-local-listagens-2026-10-16.md): reutilização por tick/lado/recurso no orderBook existente, sem cache de decisões ou saldos. Ramo de consultas diretas versus ramo compartilhado iguais no oráculo em 3/5/10 salas, com manutenção/off/reidratação/recarga do módulo/provedor/manual/estoques vivos. Consultas nativas41/67/132→13/13/13, sem inferir CPU Screeps. Flag terminalOps.reuseOrderBook default true, desligável para comparação. L2 geral/T3/T7 permanecem parciais; pixel automático e demais caches não entram neste aceite.
