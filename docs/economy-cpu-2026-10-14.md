# Investigação de CPU econômica — ARK-128

## Evidência live

83652067:464operações/27ativas/2cadeias,Memory555553chars,limite20.
Janela59ticks após reset:27,86CPU/tick; craft6,622/phasePlan4,073.
Janela aquecida58ticks:20,91; craft4,273/terminal2,860/creeps9,398.
Spans:chains4,192/startItem1,368/poll1,031/partialSales0,737.
Spans são inclusivos: não somar pais e filhos. Bucket cai continuamente.

## Causas e correções

- `policyActive` promovia toda manutenção/cadeias a execução por tick.
  `policyOnly` mantém confirmação/produção fina; `maintenance` preserva
  cadência configurada para outras cadeias, recuperação e strandedSweep.
- Claims/commitments repetiam enumeração de todo histórico por consumidor.
  `terminalIndex` compartilha membership no heap por tick/fonte/nextId;
  quantidades, estado, dono e intents são lidos ao vivo. `create()` é a única
  inserção em produção e incrementa nextId. Fixtures de inserção direta
  modelam essa revisão. GC calcula vínculos protegidos uma vez por execução.
- Busca de labs repetia estados e topologias iguais de químicos diferentes.
  Memo só de falhas exaustivas por estado/budget; nenhum fracasso interrompido
  pelo guard é cacheado. Aliases canônicos preservam identidade repetida e
  reconstituem nomes nas cópias. Ordenação de slots calculada fora da recursão;
  troca equivalente de duas folhas eliminada. Mantidos guard30000, estratégias,
  configurações e cálculo de tempo com cooldown/quantidade atuais.
- `poll` filtrava generators a cada passo; filtra uma vez por chamada e remove
  concluídos localmente. Cursor e orçamento1CPU mantidos: continua disponível
  para aperfeiçoar políticas durante produção, sem desativar a feature.
- Vendas parciais retornam antes de consultar reservas quando não há mínimo
  físico em storage/terminal. saleAvailable pula commitments se protegido=0.

## E1N47

83652193:sem cadeia; último scan83652009/sell-warming69. Backoff até83653271
afeta somente utrium_bar/XUH2O. Isso não demonstra inviabilidade das demais.
Scan inicial pode avaliar amostras provisórias durante hidratação de segmentos
e depois esperar300ticks mesmo com histórico pronto. Transição historyReady
agora invalida uma vez esse resultado. Diagnóstico marketHistory no JSON de
craftStatus inclui prontidão, mínimo, contagem por recurso e status de segmentos.
Não reduzir minSamples nem afirmar retomada sem evidência live. Se amostras
continuarem insuficientes, dados novos distinguem essa condição; margem,
profundidade e energia continuam sendo verificadas.

## Antes/depois offline

Mesmo Node/ambiente; `node test/economyCpuBenchmark.js`. Parâmetro opcional
seleciona módulo baseline (HEAD76da945); arquivo temporário foi removido.

| Cenário | Antes | Depois |
| --- | --- | --- |
| 10produtos×3topologias,frias,mediana3runs |1044,576ms|292,296ms|
| XLH2O6labs,frio |83,026ms,3moves|12,164ms,3moves/3520nós|
| XGH2O3labs,frio |82,382ms,guard sem plano|2,477ms,plano válido20moves|
| XGH2O6/10labs,frio |83,654/110,728ms|71,154/76,444ms|
| 200consultas de reserva/464operações |300enumerações*|1enumeração|
| Manutenção em11ticks com política/intervalo10 |11|2|
| Filtro de candidatos de poll |1porpasso|1porchamada|

*100consumerAvailable +100commitments sem cadeias: commitments antes
enumerava duas vezes. Depois é1até tick ou revisão de membership. Nenhuma
cache de saldos/preços. Criações reconstroem. Node não mede CPU do servidor;
não extrapolar72% da geometria para72% do total. Hits têm pequeno custo de
aliases/cópias; ganho principal é evitar buscas frias repetidas.

Smoke verifica quantidades mutáveis, conclusão, remoção, criação no mesmo
tick, substituição/reset, intents do próprio dono, química sem vazamento,
cache limitado, cadência e hidratação; preserva testes de lotes/transporte/custos.
Asserts usam trabalho determinístico, sem thresholds de milissegundos.

## Publicação e retorno live

Check de todos os JS tocados e bundle limpos; smoke6723 verde; grunt109
módulos copiado ao cliente habitual. SHA256 idêntico:
95FF5F58372B663CC1022D72B3A3704EF00662302A5C38FA9AA7BAA1057C1FF9.
Diff check limpo e graphify atualizado4466nós/9202arestas; sem commit automático.

Retorno23h00/83653067:49ticks aquecidos,total16,16/guarded15,61/unguarded0,55.
craft0,764;terminal2,131;creep8,857(32calls contra36,9antes);swing1,327.
Total caiu22,7% nesta janela e ficou abaixo do limite20. Não atribuir toda
diferença ao código: população/carga e fim de avaliação da política mudaram.
Tendência longa do bucket não veio naquele retorno. O usuário depois mostrou
bucket quase estável~3353 e gauge17,5, com picos42: ARK-128 foi reaberta.
16,16era leitura parcial do script numa janela49ticks, não comprovação de
CPU efetivamente debitada. Demais otimizações de roles permanecem no backlog.

## Discrepância de medição:0140

cpuMeter.endTick roda dentro de profiler.wrap/memory.wrap. O driver público
https://github.com/screeps/driver/blob/master/lib/runtime/runtime.js executa
game.run, serializa rawMemory._parsed e só depois calcula usedTime com ceil e
intents.cpu. O comentário local que alegava serialização gratuita foi corrigido.
O gráfico usa screeps_cpu_used, amostra de um tick via exporter; seu Mean não
é média de todos os ticks nem necessariamente a mesma janela do cpuTop.

cpuAccounting infere débito por limiteAnterior+bucketAnterior-bucketAtual,
em intervalos consecutivos válidos, e pareia com leitura anterior do script.
Janela600configurável, ring/somas reversíveis no heap, custoO(1). Timeout sem
end conserva débito e marca par ausente; gap/fronteiras/limite alterado ficam
inválidos. Residual não prova sozinho serialização: inclui wrappers, GC,
console, finalização e arredondamento, além de possíveis intervenções externas.
Teste reproduz script16/bucketestável/limite20 => débito20/residual4.

cpuTop agora distingue script observado e cpuBalance; Memory.stats.cpu.accounting
é exportado pelo coletor genérico existente. grafana.json preparado com consultas
cpu.accounting.used/scriptUsed; não foi aplicado no Grafana externo.
Medir após300–600ticks sem reset e comparar cobertura/débito/folga/bucket antes
de declarar estabilidade ou escolher outra otimização. Sem profiler pesado
nem JSON.stringify extra por tick. ARK-128 continua em andamento.

Histórico está pronto,5páginas,sem erro,107/108amostras para mínimo30; scanReady
true. E1N47 abriu XLH2O2040 em83652301, produziu energy1000 e chegou qi1/H2500.
Preempção consumiu energia para a sala; bloqueio agora é reposição, não warming.
ARK-127 permanece em andamento até produção dos labs; ARK-129/0139 trata
BUY manual terminal-11804/200000 e transferência automática incompatíveis.
# Medições seguintes e sincronização sem alterações (0142)

Live23h36: balanço227/227 intervalos83653369..83653595, cobrança19,537,
script pareado15,732/residual3,806, folga0,463. Janela curta script14,35
não substitui média pareada. Probe único posterior: getUsed14,2945208 →
17,8345781 ao serializar638174caracteres: custo3,5400573. Medição inclui
o próprio stringify e é uma amostra, não atribuição exclusiva do residual.
Probe anterior em comandos separados deu diferença negativa e foi descartado.

terminalOps.operations385584chars, 496operações finais e19ativas. Maior
campo agregado é accounting19521; noCandidate17913. Volume distribuído,
sem justificativa para apagar custos/IDs/taxas/vínculos ou mudar retenção.

Reprodução adicional:100syncs sem alteração reescreviam300campos financeiros
e substituíam100snapshots. Regressão falhou antes/passou após comparações e
deltas:zero de ambos. Smoke6756 também valida taxas/preço justo intratick,
preenchimento parcial, confiança, transferência incremental, venda e reset.
Sem extrapolar esse contador para redução de CPU total. ARK-128 permanece
In Progress até nova medição live depois do aquecimento.
