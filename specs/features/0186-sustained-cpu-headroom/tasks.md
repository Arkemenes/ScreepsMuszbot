# 0186 — Headroom de CPU com o conjunto completo de funcionalidades — Tasks

Ordenadas; cada tarefa termina num check. O aceite live segue aberto até AC7.

- [x] 1. Adicionar regressões para a prioridade/empate de salvage e para segurança, quantidade, configuração e destino vivos depois de um cache hit. (AC1–AC2)
  - verify: smoke reproduz as assertions `0186: salvage candidate cache preserves decay priority` e `0186: salvage candidate cache refreshes dynamic safety and stock checks` antes da implementação.
- [x] 2. Cachear a lista de candidatos ordenada em `derived(room)` e medir `hauler.battlefieldLoot`. (AC1–AC3)
  - verify: `node --check src/roles/hauler.js` e `node test/smoke.js` verdes; asserts confirmam reuso e invalidação.
- [x] 3. Atualizar `ARCHITECTURE.md`; atualizar graphify; executar as validações e um único `npx grunt` para publicar o pacote.
  - verify: arquivos JS tocados passam `node --check`; `node test/smoke.js` verde; `graphify update .`; `npx grunt` conclui.
- [x] 4. Cachear em `derived(room)` os energy drops descobertos por `roomCache` e testar a prioridade e os filtros de `pickLoadNow()`. (AC3–AC4)
  - verify: `node --check src/roles/hauler.js`, smoke mantém os asserts de bigDrop, drop comum, container, threshold, reservas e danger.
- [x] 5. Classificar targets de distribuição do miner em uma passagem e indexar drops adjacentes por sala/tick, com teste de equivalência e reutilização. (AC4–AC5)
  - verify: `node --check src/roles/miner.js`; smoke cobre prioridade de container/tower/link, desempate de links e seleção/cache do primeiro drop adjacente.
- [x] 6. Reutilizar os checks de quantidade/range, reserva e segurança do mesmo drop apenas dentro da decisão `pickLoadNow()`, cobrindo o fall-through de `bigDrop` para drop comum. (AC3)
  - verify: a regressão `0186: drop range estimate is reused across priority checks within a decision` falha antes da implementação e passa depois; outra chamada recalcula os dados dinâmicos.
- [x] 7. Preservar a ordem estável de produção, mas testar primeiro alvos adjacentes com reserva disponível antes de verificar reservas de candidatos distantes. (AC3)
  - verify: `0186: adjacent production target avoids checks on farther reservations` falha com o filtro integral antigo e passa com o fast path; testes de spawn adjacente e spawn distante permanecem verdes.
- [x] 8. Encerrar a filtragem da zona perigosa de battlefield loot assim que o primeiro pile elegível e seguro for encontrado, sem mudar a ordem de prioridade. (AC2)
  - verify: regressões first-safe cobrem retorno antecipado e salto de um candidato perigoso; checks existentes preservam hostile rampart, amount e destination em cada decisão.
- [x] 9. Substituir os filtros e sorts de reparo crítico e obra oportunística do builder por seleção em uma passagem, preservando razão máxima, alcance e empate estável. (AC8)
  - verify: smoke cobre dois reparos críticos, empate estável, site mais completo e presença de ambos os candidatos no fixture.
- [x] 10. Memoizar checks de reserva por ID apenas durante `pickDeliverNow()`, compartilhando fast path adjacente e fallback completo e repassando o callback à cascata opcional. (AC9)
  - verify: smoke confirma um check para alvo adjacente bloqueado no fallback distante e reavalia o mesmo alvo em uma nova decisão com disponibilidade alterada.
- [x] 11. Memoizar `reservations.available` por ID durante `pickLoadNow()` para compartilhar os checks repetidos entre tiers de energia. (AC10)
  - verify: smoke confirma um único check do receiving link nas prioridades de link repetidas e nova leitura na chamada seguinte, com alvo atualizado.
- [x] 12. Adicionar subspans temporários em `pickLoadNow()` para localizar os ramos de CPU mais caros sem mudar a seleção. (AC11)
  - verify: `node --check` e smoke passam; cada subspan apenas envolve a busca/verificação existente.
- [x] 13. Trocar a busca do alvo essencial mais próximo por presença nas listas cacheadas quando `pickLoadNow()` só precisa da condição booleana. (AC12)
  - verify: smoke confirma que a presença do spawn urgente é detectada sem busca de distância e a cascata continua sem alvo de retirada elegível.
- [x] 14. Instrumentar os ramos de produção, torres críticas, consumidores opcionais e fallback de `pickDeliverNow()` sem alterar a cascata. (AC13)
  - verify: `node --check` e smoke passam; cada subspan apenas envolve a seleção existente.
- [x] 15. Instrumentar carregamento, jobs ativos de loot, bootstrap, espera por energia, idle e ação final de entrega fora da cascata de seleção. (AC14)
  - verify: `node --check` e smoke passam; spans envolvem os helpers e intents atuais sem mudar alvos.
- [x] 16. Reutilizar a lista de jogadores hostis aprendidos dentro de um tick, invalidando-a quando o módulo grava/remove evidência ou a memória é substituída. (AC15)
  - verify: smoke cobre gravação e limpeza visíveis na mesma tick; expirados ainda são removidos no primeiro acesso da tick.
- [ ] 17. Aguardar um meter window após o próximo deploy e comparar os subspans/roles; só então consultar o balanço de 600 ticks quando a janela estiver válida. (AC6, AC11, AC13, AC14, AC15)
  - verify: comentário em ARK-235 registra ticks, CPU, bucket, tier e limitações da amostra.
- [ ] 18. Prosseguir, por hipótese medida e mudança reversível, até chegar a ≥9.250 e sustentar o bucket por 600 ticks com todas as funcionalidades ativas. (AC7)
  - verify: `stats.cpu.accounting` válido no shard com limite20 e sem reset/saturação/intervenção; issue e roadmap só fecham com essa evidência.

## Notes

- Baseline live 2026-10-22: bucket2.617/10.000; script16,341 CPU/tick/60; balanço inferido19,447 CPU/tick/600; `intentCpu`3,973.
- Live após primeiro deploy: `pickLoad`0,753 CPU/tick (2,917 chamadas); bucket2.440 no segundo meter window pós-deploy. Próxima hipótese: compartilhar candidatos-base de energia, sem compartilhar decisões de caminho.
- Live após segundo deploy: `miner.distribute`0,584 CPU/tick (14,433 chamadas); bucket2.200. Hipótese: eliminar coleções/sort repetidos e varreduras redundantes de drops adjacentes.
- Live após terceiro deploy (miner): `miner.nearbyTargets`0,073 + `miner.distribute`0,299 = 0,372 CPU/tick; bucket1.930. Janela contaminada por reset global; próximo ajuste mede `pickLoadNow` fall-through.
- Live após quarto deploy (`pickLoadNow`): bucket1.886; `pickLoad`0,258/0,883 chamadas vs0,756/2,517; chamadas caíram junto, então ganho causal não isolado. Saldo inferido22,97 e janela inclui reset. `pickDeliver`0,560/5,617 chamadas; teste com produção adjacente e extension distante encontrou 2 checks desnecessários antes do fast path.
- Live após quinto deploy (fast path de entrega): bucket1.601; script23,373, warm22,708 e saldo25,091; reset global. `pickDeliver`0,557/3,933 chamadas, sem ganho CPU/tick confirmado. Próxima hipótese reduz checks de segurança após achar o primeiro pile seguro.
- Live após sexto deploy (first-safe): bucket1.465; script20,454, warm19,439 e saldo22,075; houve reset global. `battlefieldLoot`0,361/3,25 chamadas, contra0,626/4,783 antes; custo estimado por chamada caiu ~15%, com frequência diferente. Último `builder.opportunistic` era0,343/3,533; hipótese atual substitui filtro+sort por passagem estável; confirmação live pendente.
- Live após sétimo deploy (builder): ticks83807374–83807433, bucket1.340; script24,035, máximo188,828 (reset), `warm`22,676 + residual2 =25,014 CPU/tick inferidos em72 ticks. `builder.opportunistic`0,255/3,3 vs0,343/3,533 (~20% menos por chamada, frequência também variou). `pickDeliver`0,999/8,383 é agora o maior span; hipótese: reutilizar checks de reserva repetidos dentro da mesma decisão. Alvo ≥9250 segue distante.
- Live após oitavo deploy (`pickDeliverNow`): ticks83807517–83807576, bucket1.221; script21,254 e CPU inferida22,829 em70 ticks. `pickDeliver`0,493/6,85 vs0,999/8,383; queda compatível com o helper, mas também houve menos chamadas. Próxima hipótese: o caminho de carga repete reserva do link entre tiers de fluxo bloqueado/normal.
- Live após nono deploy (memo de reserva em `pickLoadNow`): ticks83807662–83807721, bucket1.031; script22,433 e CPU inferida23,913 em69 ticks. `pickLoad`0,300/0,95 vs0,359/1,117, com ~0,316 vs~0,321 CPU/decisão; não há ganho claro. Próximo deploy adiciona subspans para decidir se drop, terminal, link, essential consumer ou container domina.
- Live após décimo deploy (subspans de `pickLoadNow`): bucket960; `essentialCheck`0,172 e `containerPath`0,113 CPU/tick. Próximo ajuste verifica o efeito do corte de busca de distância por presença essencial.
- Live após décimo primeiro deploy (presença essencial): ticks83807950–83808009, bucket863; script21,625, saldo inferido23 CPU/tick. `pickLoad`0,220/0,633 decisões; `essentialCheck`0,110/0,617. A frequência também caiu, então não há atribuição causal isolada. `pickDeliver`0,495/7,1 decisões passa a ser o maior span; dividir os ramos de seleção.
- Live após décimo segundo deploy (subspans de entrega): ticks83808165–83808224, bucket906 (+43); script19,501, balanço inferido20,363 CPU/tick em80 ticks (inconclusivo frente ao delta positivo do bucket). `hauler`5,717/tick; `pickDeliver`0,541, com produção0,174, torres críticas0,140, opcionais0,119 e fallback0,015. Próximo passo: medir jobs e ações fora da seleção de alvo.
- Live após décimo terceiro deploy (execução do hauler): ticks83808305–83808364, bucket770 (−136); script22,294, balanço inferido23,831 CPU/tick em83 ticks. `hauler`3,820/tick, menor por queda de frequência de carga/loot; `deliverAction`0,436, `pickLoad`0,434, `loadEnergy`0,354, `waitForEnergy`0,270. O span independente mais alto foi `market.bookAll`0,526; próximo ajuste reaproveita por tick a lista de incidentes em `intel.transitSafety` (0,214/tick) sem mudar bloqueios.
- Cada execução de `npx grunt` publica. A medição live vem depois da janela fria indicada pelo projeto.
