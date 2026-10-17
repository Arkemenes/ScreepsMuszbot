# cpuReport com janela isolada — ARK-145

Correção local, sem novo deploy pelo agente. O usuário publicou o pacote anterior aproximadamente18:17 e observou aumento17.3→20.8. Essa regressão permanece sob investigação; corrigir o relatório não demonstra economia de CPU nem absolve a alteração.

## Evidência do defeito

cpuReport(150) armado em83690790 imprimiu em83690867: somente77 ticks depois, usando151 intervalos desde83690716. O relatório misturou os estados de reuseOrderBook. Reprodutor com o trecho real do main.js anterior confirmou o mesmo comportamento; salvo em graphify-out/validation-cpu-report/before.log.

O balanço enviado pelo usuário era20.848 incluindo cold198, warm19.667, residual1.799. A tabela de módulos/roles cobria somente32 ticks recentes. craft.chains1.174→2.028 e swingTrade0.041→0.622 ocorreram entre janelas de cargas diferentes; não provam causalidade. O primeiro anexo,18:16:19, era anterior ao deploy e não continha o cabeçalho completo do balanço. Nenhum ganho L2 foi aprovado.

## Comportamento corrigido

- Comando no tick T fixa os n ticks de origem T+1..T+n. O balanço final chega em T+n+1. O comando imprime os endpoints e as flags de abertura.
- O fechamento recorta somente esses ticks no ring existente de cpuAccounting. Não reseta cpuMeter, a telemetria de stats ou o bucket; não cria histórico em Memory.
- n é limitado à capacidade finita configurada do ring; argumento/capacidade não finitos usam fallback600. Repetir o comando substitui a solicitação anterior.
- Requisição fica no heap e é cancelada por reload global. Auto-report continua disponível, identificado como automatic e iniciado após o boot real. Regressão do relógio cancela a solicitação.
- Bucket saturado, gap, fim ausente ou dados descartados geram incomplete. Não se espera indefinidamente nem se pega dado anterior para preencher n amostras válidas.
- reuseOrderBook/listingPolicy são registrados na abertura e comparados no fechamento. Flags diferentes tornam o aceite incomplete. Alterar e depois restaurar uma flag durante a janela não é detectado: manter configuração fixa durante cada medição.
- A linha cpuBalance é da janela isolada; cpuTop e tabelas de módulos/roles/spans continuam sendo a janela recente própria, identificada. Não somar spans sobrepostos nem tratá-los como atribuição exata de150ticks.
- Espera O(1), sem percorrer o ring nem coletar grupos em duplicidade. due() só chama o hook guardado na abertura automática ou no fechamento; o ring é percorrido uma vez por relatório. Sem novo scan de Game.creeps/room.find. Não há promessa de overhead numérico sem medição live.

## Verificação

20 regressões no smoke: histórico anterior74ticks; janela nova150; rearm; rollover; flags; auto/off/reload; gap; bucket cheio; endTick ausente; relógio; capacidade infinita; máximos/resíduo/pareamento; uma única varredura de fechamento; Memory preservada; ranges frios/ausentes não viram evidência warm completa.

Smoke final: **11737 assertions OK, zero falhas**, vinte novas regressões. node --check nos oito JS tocados/criados, sem erro. Build isolado: **120módulos**; hash do cliente real preservado. Logs/baseline em graphify-out/validation-cpu-report, ignorado. Entrega do reparo é distinta do aceite live da otimizaçãoARK-139/objetivo globalARK-128.

## Como validar após deploy deste reparo

Manter a política econômica desligada e as condições de trabalho comparáveis. O bundle novo inclui as mudanças anteriores já testadas, com somente o reparo de medição acrescentado.

```js
Memory.settings.listingPolicy = Memory.settings.listingPolicy || {};
Memory.settings.listingPolicy.enabled = false;
Memory.settings.terminalOps = Memory.settings.terminalOps || {};
Memory.settings.terminalOps.reuseOrderBook = false;
cpuReport(150);
```

Esperar a linha manual isolated window ... complete e o restante do relatório. Então:

```js
Memory.settings.terminalOps.reuseOrderBook = true;
cpuReport(150);
```

Enviar ambos completos. Conferir150/150, paired150, endpoints novos posteriores ao comando, complete e settingsMatchtrue. Se incompleto, observar a razão antes de repetir. Comparar used/warm, bucket, max e trabalho útil, sem confundir com script parcial.

Se o resultado não mostrar benefício, manter reuseOrderBook=false enquanto se investiga o custo comum ao pacote e o comportamento das cadeias. Não habilitar a política de listagens para tentar compensar CPU.

## Resultado fornecido pelo usuário — 16/10, 18:42–19:03

Ambas as solicitações encerraram complete, settingsMatch true,150/150 e paired150, sem gaps, invalid ou missing end. Política de listagens off nas duas. O reparo do isolamento foi validado em jogo.

| Janela | reuseOrderBook | CPU inferida/warm | Script pareado | Residual | Pico |
|---|---|---:|---:|---:|---:|
| 83691085..83691234 | false | 17.900 | 16.153 | 1.747 | 118 |
| 83691240..83691389 | true | 17.907 | 15.991 | 1.916 | 97 |

Diferença líquida+0.007CPU/tick (~0.04%): nenhum ganho líquido demonstrado nesta comparação. Script-0.162 foi acompanhado de residual+0.169; o residual continua sem atribuição. A variação não reproduziu alta+2–3CPU por efeito isolado da flag, mas não explica retrospectivamente o degrau anterior do dashboard nem prova ausência de regressão comum ao pacote.

Carga mudou: no ON uma cadeiaXLH2O foi encerrada e outro lote aberto com compras. OFF iniciou somente cinco ticks após boot83691080; ON mais tarde. Tabelas de módulos/roles/spans cobriam36 e11ticks, respectivamente, portanto não usar suas diferenças para decompor a média dos150. Picos118/97 ocorreram fora do tick de boot; uma amostra menor não prova redução causal dos picos.

Recomendação temporária: reuseOrderBook=false, política econômicaoff; investigar picoswarm e custo/atividade compartilhados antes de avançar features. Não solicitar mais uma repetição cega de150ticks como substituto da investigação. ARK-145 validado; ARK-139/128 continuam abertos, sem ganhoCPU aprovado.
