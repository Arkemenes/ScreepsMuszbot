# 0156 — Oráculo e otimizações por item — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0156-A e L2-book concluídos localmente; ganho live e demais itens pendentes.
- **Issue:** ARK-139; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

### API implementada no pacote 0156-A

`compareImplementations(reference, candidate, worlds, project?)` conserva a chamada existente. O default compara retorno e mundo executado; uma projeção customizada recebe `(result, executedWorld, error)` e deve ser pura e completa para os observáveis declarados. Erros incluem tipo/mensagem e não impedem projetar o estado parcial. Falha da projeção ou snapshot é erro do harness, nunca equivalência silenciosa.

`compareSequences(referenceFactory, candidateFactory, scenarios, project?)` recebe cenários `{ createWorld, steps }`. Cada factory síncrona recebe mundo novo, carrega seus módulos/providers e devolve `(step, world)`. Um conjunto de módulos/heap vive durante todos os passos; depois os bindings de globais/console e o require.cache original são restaurados em finally. Fixtures substituem Game/Memory/providers por instâncias próprias; não podem capturar módulos de produção/estado mutável compartilhado fora da factory nem mutar objetos internos dos providers do host. A restauração é de bindings, não uma cópia profunda arbitrária do processo Node.

Snapshots aceitam dados simples, undefined e arrays, preservando aliases de entrada e ordem dos arrays. Funções/métodos são reconstruídos pela factory e excluídos da projeção de dados; protótipos não suportados, ciclos, accessors, símbolos, bigint e números não finitos falham explicitamente. A projeção decide quais intents, taxas, claims, estoques e Memory entram na fixture; o helper não emula o motor nem descobre observáveis omitidos.

0156-A repara test/equivalence/compare e adaptadores de fixtures, com snapshots pós-execução e sequências. Não toca produção.
0156-B/L2 separa política pura e manutenção de terminalOps; referência usa 0153 revisada.
L3 separa geometria/seleção de desired/refilling/switching, logística, confirmação e observação final 0155; reserva canônica 0149 participa da assinatura.
L4 mede intel/transitSafety preservando dedupe existente; L7 lazy/segmentos e O3 limpeza têm pacotes próprios. L6 exige spec de latência adicional antes de mudança.

## Data flow e falhas

Criar fixture/módulos/globais de cada variante → executar sequência inteira com caches preservados → projetar retorno, Memory, estado e trace por passo → comparar também depois de exceção → restaurar globais em finally.
Divergência deliberada deve falhar; par equivalente não pode falhar. Métodos são reconstruídos; dados não serializáveis são rejeitados, não perdidos pelo clone JSON.
Para cada cache: inventariar entradas lidas/provedores/versões/prazos → separar pureza → comparar assinatura completa → executar efeitos/manutenção/observação viva em todo tick. Claim/readiness/preço/estoque não são congelados entre decisões. Flag off descarta cache, não pending/owner.
Reset hidrata operação pendente antes de decisão otimizada. Colisão de hash exige comparação de entradas reais. Fatiamento não é equivalência temporal por resultado final parecido.

## Validation / Rollout

Autoteste do oráculo conforme AC1/7, incluindo mesmo erro com estado distinto e cache no segundo passo.
Por item: cenários com mudança intratick de claims/config/reserva/provider, limites de cooldown/prazo, off/reset entre intent e confirmação. Escala3/5/10 salas e labs3/6/10 serve à contagem de scans/limites onde pertinente; não substitui fixtures de semântica.
Live futuro: custo total assinatura+invalidação+efeitos, carga/regime comparáveis, warm/cold e custo amortizado de resets. Probe/Node não comprova CPU Screeps. Rollout por flag/item autorizado, comparando produção/ordens/contabilidade.
L2 bloqueado por política0153; L3 por observação0155 e contrato/adaptador0149. Oráculo isolado independe desses pilotos.

## Risks & mitigations

Projeção incompleta: declarar observáveis por adapter. Cache custar mais: medir custo completo. Off interromper recuperação: reconciliador independente. Fronteira de assinatura: testar instante exato. Remover migração necessária: inventário de owners pendentes antes de O3. Não retirar rollback legado antes de encerramento seguro.

## Entrega L2-book — 16/10/2026

[Pacote local](../../../docs/pacote-local-listagens-2026-10-16.md): reutilização por tick/lado/recurso no orderBook existente, sem cache de decisões ou saldos. Ramo de consultas diretas versus ramo compartilhado iguais no oráculo em 3/5/10 salas, com manutenção/off/reidratação/recarga do módulo/provedor/manual/estoques vivos. Consultas nativas41/67/132→13/13/13, sem inferir CPU Screeps. Flag terminalOps.reuseOrderBook default true, desligável para comparação. L2 geral/T3/T7 permanecem parciais; pixel automático e demais caches não entram neste aceite.
