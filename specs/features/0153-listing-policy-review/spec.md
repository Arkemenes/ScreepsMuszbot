# 0153 — Listagens competitivas, prazo real e pixel

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — 0153-A1 físico implementado localmente; pixel automático e aceite live pendentes.
- **Issue:** ARK-138 (filha de ARK-128).
- **Created / revisão documental:** 2026-10-15.
- **Contrato integrado e aceite:** [planejamento vigente](../../../docs/planejamento-integrado-2026-10-16.md); análises anteriores são históricas.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.

## Entrega local 0153-A1 — 16/10/2026

[Pacote e validação](../../../docs/pacote-local-listagens-2026-10-16.md): política física e recuperação implementadas; flag listingPolicy.enabled off por padrão. Cálculo puro de pixel testado, sem executor conectado. Não concluir a feature inteira. Metadados na operação canônica de terminalOps; desaparecimento/edição externa põem a geração em quarentena, sem refund/venda inventados.

## Problem

Listagens podem pagar taxas acima do mercado; prazo em ticks não corresponde a dias reais.
A fórmula anterior de extensão de pixel podia aprovar preço alto sem chance de venda. Auditoria histórica estima taxas, não valores recuperáveis.

## Desired outcome / In scope

- Criação automática de venda só se preço <= melhor ask concorrente - passo e >= piso econômico, com orçamento e quantidade lastreada. Excluir ordens próprias e volume não executável.
- Na integração A1, fixedListing declara finalidade de listagem e exige quote antes da operação/staging. Operação genérica que tenta deal antes de fallback pode existir sem quote de listing; sua publicação posterior é bloqueada sem competitividade/lastro. Isso preserva a venda imediata existente, em vez de condicioná-la à viabilidade de publicar um ask. O claim dessa operação pertence à tentativa de deal, não a uma listagem já autorizada.
- Competitividade também vale para extensão; livro indisponível/sem cobertura não é ausência comprovada de concorrência. Sem quote válida, manter estoque sem pagar taxa.
- Piso deve usar procedência/custo conhecido ou referência conforme política de estoque existente; não inferir origem minerada por resourceType. Custo desconhecido não vira zero.
- Taxa futura: criar 5% de preço x quantidade, estender 5% de preço x acrescentado, aumentar 5% de alta x restante; diminuir não cobra. Taxas históricas continuam no ledger sem reaplicá-las ao bid de deal.
- cancelFinished apenas remainingAmount confirmado 0 e após reconciliação de operações/taxas/pendências/recibos; inactive ou amount 0 não basta. Proteção de IDs até a reconciliação.
- Prazo de 7 dias reais por timestamp persistente/createdTimestamp; nunca reconverter idade inteira com média móvel de tick-rate.
- Cancelar por prazo somente ordens automáticas geridas com prazo conhecido; legadas sem timestamp entram em observação sem cancelamento imediato. Ordens manuais e listagem de pixel protegida não expiram automaticamente.
- Descida off por padrão, intervalo e piso por recurso; não sobe preço sob pretexto de descer, mantém ID e não repaga taxa. Piso proposto limit para taxa já afundada, validando procedência/contabilidade.
- Pixel novo/livre: deal em bids >= minBid com quantidade executável, sem frete/listing fee; restante só estende a única ordem existente se competitiva E 0.95 x preço >= bid x (1 + listMargin), piso, crédito e orçamento válidos.
- Nunca segunda ordem de pixel neste fluxo; sem ordem existente elegível, manter estoque. Separar saldo livre de pixel já listado e tentativas pendentes; não contar como livre a quantidade exposta.
- Defaults relativos propostos: minBid=R x 0.95 com referência confiável; listMargin=0.03; listOnlyCompetitive true após ativação autorizada; cancelFinished true após reconciliação; descent false.
- Orçamento diário de taxa é etapa condicional posterior à medição; não presumir nova receita por existir ask competitivo.

### Ownership, prazo e reconciliação

Esta feature usa testes diretos e independe de oráculo/ledger corrigidos. A referência L2 da 0156 será congelada somente depois desta política revisada.

Estados: proposed → staging → submitPending → listed → amendPending/cancelPending → settled. Owner automático, orderId, originalCreatedAt, observedAt, generation, pendingIntent e lastReconciledTick persistem; não guardar objetos de ordem. A reconciliação pertence a terminalOps, sem contador paralelo da auditoria.
Prazo é sete dias reais desde createdTimestamp confiável (ou observação persistida conservadora do legado); extensão não reinicia idade. No legado desconhecido, começar prazo na primeira observação, identificado como limite inferior, sem cancelamento imediato.

Distinguir cancelamento gerido aos sete dias de expiração natural do servidor. No handler público, cancelamento manual remove sem restituição; expiração natural tem restituição sobre restante. Audit expõe taxa histórica paga/estimada, taxa incremental, restituição potencial renunciada e alternativa de esperar; não altera a decisão de sete dias. Restituição futura é potencial, não crédito atual. Preço pedido não é venda garantida.
Fonte: [market.js](https://github.com/screeps/engine/blob/master/src/processor/global-intents/market.js), consultado em 2026-10-16; fixtures futuras devem fixar revisão e confrontar servidor.

Flag off bloqueia decisões novas (staging/create/extend/reprice/cancel). Continuar liquidação/reconciliação de intents já aceitos, taxas/claims/recibos; não reenviar cegamente após reset. Desaparecimento de ordem requer confrontar transações/saldos; origem desconhecida não vira refund confirmado. Rollback não recria ID nem restitui taxa.
IDs manuais/pixel protegido e pendências têm prioridade sobre limpeza. Alteração manual invalida geração/plano automático antes de nova alteração.

## Acceptance criteria

1. Listing acima do ask concorrente não cria operação de staging/claim/taxa nova; criação competitiva mantém preço, quantidade e fee esperados.
2. Extensão não competitiva, livro indisponível, custo/procedência desconhecidos sem fallback conservador, crédito ou lastro insuficiente não pagam taxa.
3. Redução conserva ID e cobra zero; aumento/extensão contabilizam somente a taxa incremental; reconciliação não cobra duas vezes.
4. Limpeza só cancela esgotadas reconciliadas; ordens inativas com restante, manuais e IDs pendentes protegidos não são confundidos com esgotadas.
5. Prazo real funciona após reset, mudança de velocidade do tick e extensão; não renova idade para evitar prazo; legado sem timestamp recebe observação conservadora.
6. Descida respeita piso/config/cadência e nunca cancela pixel ativo; cancelamento por prazo só alcança ordens geridas elegíveis.
7. Pixels novos vão aos bids elegíveis, depois só à única extensão competitiva e rentável, senão estoque; não há dupla exposição, segunda ordem ou cancelamento da listagem protegida.
8. ordersAudit distingue cancelamento gerido e expiração natural, taxa estimada/histórica, incremento, restituição potencial renunciada e idade desconhecida; medir taxas de novas ordens sem afirmar recuperar os 3.88 M do snapshot antigo.

9. `0153 off pending` preserva reconciliação após off/reset entre create/extend/cancel e confirmação, sem nova decisão, taxa duplicada ou restauração fictícia de ordem.

## Constitution check

Reusar census/roomCache; configuração em Memory.settings; dados derivados no heap limitado;
somente ownership/recuperação persistente necessária, nunca objetos de jogo; guard e stall guard.
Observações e relatórios novos antes de cpuMeter.endTick. Preservar cascata crítico → saudável → ótimo e fallback.
Smoke e invariantes verificam comportamento, não só ausência de exceção.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.
