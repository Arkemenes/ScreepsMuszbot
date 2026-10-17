# Pacote local — política de listagens e reutilização do livro

**Autorização:** usuário pediu desenvolvimento autônomo durante sua ausência e fechamento/teste do pacote ao retornar. Alterações locais, sem deploy. Linear: ARK-138 e ARK-139 continuam In Progress; as features inteiras não estão concluídas.

## Entregas e limites

| Etapa | Implementado | Ainda aberto |
|---|---|---|
| 3 / 0153-A1 | Política para vendas automáticas de recursos físicos, taxas incrementais, idade real, cancelamento confirmado, limpeza protegida e auditoria | Executor automático de pixel; aceite live de taxas/listagens |
| 4 / 0156-L2-book | terminalOps compartilha consultas filtradas no orderBook existente, com cálculos econômicos e reconciliação vivos | Ganho líquido de CPU em jogo; cache geral de decisões de listing não foi implementado |

A etapa 4 foi limitada à fonte de dados compartilhada: não antecipa um cache da política completa ainda pendente. O ramo `terminalOps.reuseOrderBook=false` conserva consultas diretas e é a referência exercitada contra o ramo de reutilização, ambos com a mesma política física revisada. O snapshot anterior em graphify-out é apenas evidência auxiliar local; os testes versionados não dependem dele.

O cálculo puro `pixelPlan` está testado, mas não tem executor automático conectado. Ele distingue saldo livre, listado e pendente, prioriza bids e só propõe extensão de ordem única competitiva com margem. A integração precisará provar ownership e reconciliação da ordem protegida; esta entrega não adota ordem manual nem cria outra ordem de pixel.

## Política física

- `listingPolicy.enabled=false` por padrão. Ativar é uma decisão operacional posterior, com revisão das ordens existentes. O desligamento preserva a reconciliação das operações que já entraram na política nova; operações legadas não adotadas continuam no comportamento anterior.
- Criação automática usa ask concorrente executável menos o passo, respeitando o piso líquido. Se o piso estiver acima do mercado, não força um preço maior. Ordens próprias, inativas e sem volume executável não justificam taxa.
- Livro indisponível é unknown; livro vazio conhecido também não autoriza listagem sem ask válido. O limite econômico vem da política existente/procedência declarada; não se presume custo zero por ser um mineral.
- Swing/fixedListing verifica competitividade antes de criar operação de staging. Demais operações que primeiro tentam deal podem existir sem uma listagem viável; a publicação posterior revalida tudo.
- Antes de criar uma ordem gerida, todo o lote precisa estar entregue no terminal e livre para o owner. Extensão revalida competitividade, lastro e orçamento. Taxa de criação/extensão/alta é somente a incremental, arredondada em milésimos de crédito conforme a fonte pública; queda de preço cobra zero.
- Descida fica off. Se habilitada, precisa de piso por recurso e cadência; só diminui preço, conserva ID e não alcança pixel.
- Prazo padrão: sete dias reais, usando createdTimestamp do servidor ou a primeira observação persistida como limite inferior conservador. Extender não renova a idade. Não se converte idade por média móvel da duração de tick.
- Cancelamento por prazo só atinge operações automáticas geridas, com idade conhecida, sem pendências e sem edição externa. Ordem manual e pixel ficam protegidos. **Cancelamento gerido não restitui taxa**, nem se desfaz ao desligar a feature.
- Limpeza exige remainingAmount exatamente zero, saldo da operação reconciliado e ausência de recibos/pendências protegidos. amount=0 ou inactive com saldo restante não basta.
- Create, extensão, alteração e cancelamento aceitos aguardam evidência posterior. Off e reidratação preservam pendências; o teste também recarrega o módulo terminalOps entre submissão e conciliação. Timeout põe em quarentena, sem repetir taxa cegamente.
- Mudança de dono, ID, preço, quantidade total ou identidade da ordem revoga a geração automática. Desaparecimento inexplicado não vira venda ou refund confirmado; conserva a pendência/claim para investigação. Não há comando novo de retomada automática de uma geração em quarentena.

Os metadados de recuperação ficam na própria operação de terminalOps. Não há segundo ledger/reserva, histórico persistente por tick, Memory.coverage, scan de Game.creeps ou room.find novo. A descoberta de operações geridas após reidratação ocorre uma vez por identidade do dicionário; o acompanhamento normal usa IDs no heap e o índice ativo existente.

`ordersAudit()` continua somente leitura. Agora mostra idade real ou unknown, taxas históricas quando disponíveis, estimativa no preço atual, pendência/quarentena e restituição potencial de expiração natural. Potencial não é crédito atual; cancelamento tem restituição zero. Dados por ordem aparecem também na saída lifecycle, limitada por top.

## Reutilização e CPU

`terminalOps.reuseOrderBook=true` por padrão. Reutiliza o livro por `(tick, market, getAllOrders, lado, recurso)`, aproveitando snapshot completo válido quando já disponível. Nenhum resultado de saldo, claim, frete, limite, orçamento, alvo ou decisão fica cacheado.

Falha de consulta não é cacheada como livro válido: uma nova chamada pode recuperar no mesmo tick. Troca de função/objeto market, tick ou reset invalida os dados. Views filtradas seguem o resultado bruto correspondente. Agrupamento por recurso também invalida quando o provedor reutiliza a identidade do array no tick seguinte. Mutation intratick de campos dos objetos continua visível; mudança da composição de um provedor sintético sob a mesma função/tick exige `orderBook.reset()` — o contrato é um snapshot de livro por tick.

No oráculo, a comparação com consultas diretas executa terminalOps real para 3/5/10 salas, com create, bind, extensão, cancelamento, off, reidratação, recarga do módulo, troca de provedor, edição manual e alterações de estoque/crédito. São comparados intents, ordens, operações/claims, taxas, eventos, saldos e pendências; não apenas retorno da função.

Consultas nativas nas sequências completas: **41/67/132 → 13/13/13**. Isso comprova menos consultas nas fixtures, não economia de CPU Screeps. A antiga probe de repetição não demonstra por si só que outro cache seria vantajoso; nenhum cache de assinatura/hash ou novo framework foi acrescentado.

## Verificação local

- Smoke: **11717 assertions OK, zero falhas**; 57 assertions novas nesta entrega, frente a 11660 da etapa anterior.
- node --check: 12 JS alterados/criados, sem erros.
- Build isolado: **119 módulos**; dist/main.js gerado. LOCALAPPDATA alterado somente no processo-filho, destino conferido dentro de graphify-out/validation-0153/build.
- Hash do bundle no diretório real do cliente permaneceu igual ao baseline desta entrega. Nenhuma publicação feita pelo agente.
- graphify update AST concluído: 5246 nós, 10523 arestas; sem extração semântica/LLM. diff check limpo e dez documentos verificados sem links locais quebrados ou corrupção UTF-8.
- Logs e baseline: graphify-out/validation-0153, ignorado pelo Git. Alterações preexistentes do dashboard/exporter e demais arquivos fora do escopo preservadas.
- Revisão desta implementação foi feita pelo próprio agente; a revisão independente anterior era do planejamento, não deste código.

## Validação com o usuário ao retornar

1. Primeiro, revisar o diff e testar somente a reutilização: deixar `listingPolicy.enabled=false`. Fazer uma janela de 150 ticks com consultas diretas e outra com reutilização no mesmo bundle, após aquecimento, sob carga comparável.
2. Alternar apenas `Memory.settings.terminalOps.reuseOrderBook = false` / `true`. Comparar warm CPU inferida pelo bucket, script, picos, saldo do bucket, salas/creeps/produção e os spans de terminalOps. O switch altera somente a consulta compartilhada; não reabre o antigo abTest.
3. Revisar `ordersAudit()` e as operações automáticas antes de habilitar a política econômica. O prazo pode atingir imediatamente ordens automáticas com timestamp confiável e mais de sete dias. Ordens legadas sem timestamp começam observação conservadora.
4. Se ativada posteriormente, testar um conjunto controlado de ordens, acompanhando taxas efetivas, IDs, lastro, tempo e reconciliação. Não misturar esse aceite com a medição da otimização.

O usuário informou deploy da etapa 2 por volta de **17:06**. Seu relatório em 17:16:42 trouxe 151 intervalos, média inferida 19.053 incluindo reset, warm 17.96, tick frio 183 e energyLedger 0.030 CPU/tick no span de finalização. Captura distribuída nas roles não está integralmente nesse span. O gráfico sugeriu 19.5→18.9, com redução concomitante de miners: evidência favorável, sem atribuição causal. A confirmação funcional da contabilidade em atividade ainda fica separada da medição de CPU.

## Fontes mecânicas

Fonte pública pinada: screeps/engine **80977824199a596d174d392fd0cf8c458c21fcbd**, [processor/global-intents/market.js](https://github.com/screeps/engine/blob/80977824199a596d174d392fd0cf8c458c21fcbd/src/processor/global-intents/market.js). Criação/extensão/alta cobram taxa; cancelamento remove sem refund; expiração natural pode restituir taxa sobre o restante. Fixtures simulam efeitos deferidos derivados dessa fonte; não executam o engine completo nem comprovam a revisão instalada no servidor.

Próximos itens: integração de pixel com ownership/recibos (0153-A2), disponibilidade conservadora 0157-core e relatórios. Investimentos, população, boosts, power e histórico persistente sofisticado continuam fora deste pacote.
