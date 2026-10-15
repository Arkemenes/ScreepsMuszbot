# Retomada: CPU econômica e escala — 15/10/2026

## Pedido atual

Usuário vai desligar PC. Hoje3salas processam, algumas com3ou7labs;
mais2salas em preparação, alvo potencial10salas/maislabs/maisordens.
Meta é CPU cobrada<20, ideal<15, preservando features. Não pedir que espere
online pela janela de medição nem criar novos deploys só para obter amostras.

## O que está comprovado

- Não há evidência de aumento exponencial de transações. Contagem de
  operações inclui recibos, compras/vendas/envios e finais, não equivale à
  contagem de negócios. Retenção10000ticks acumulou496finais/19ativas.
- Consultas por consumidor varriam histórico repetidamente; índice vivo
  passou200consultas de300enumerações para1. Manutenção foi indevidamente
  promovida a todo tick por policyActive; isso já foi separado.
- Busca de geometria repetia estados/químicas equivalentes; memo/aliases
  reduziram benchmark frio30planos de1044→292ms (não extrapolar para total).
- Ledger refazia300escritas/100snapshots em100leituras sem alteração;
  comparações/deltas agora fazemzero, preservando alterações intratick.
- Serializar638174chars custou3,540CPU em probe único. Limpeza0143 levou
  Memory290415chars e34operações/19ativas;15finais ainda ligadas a cadeias.
  Não apagar essas dependências nem seenIncoming para buscar novo ganho.

## Última evidência live antes deste pacote

00h09:cpuTop janela parcial18ticks script13,81. Balanço197/197intervalos
83653857..83654053:18,107cobrados, scriptpareado15,82, residual2,286,
folga1,893. Usuário observa13–14em ticks recentes. Meta sustentada<15 não
comprovada. Não comparar13,81de18ticks diretamente com18,107de197intervalos.
Nem converter tempo de parede em Game.time assumindo1s por tick.

## Pacote desta retomada

0141follow-up/ARK-130: terminalNetworkStats publica zeros explícitos de
rotas conhecidas quando eventos expiram, preservando rótulos após reset.
stats atualiza a Gauge leve entre publicações completas. Cache por eventos,
quantidade, prazo, configuração e identidade do snapshot evita agregar todo
tick. Funciona também com exporter antigo que ignora labels ausentes.
Sem histórico por transação extra; zeros são estado de rota. Não corrige
retroativamente pontos já gravados no Prometheus. Grafana/exporter locais
continuam disponíveis; alterações externas dependem de aplicação externa.

0144/ARK-128: cpuTop explicita janela parcial/fechada, tamanho-alvo,
intervaloGame.time e ticks medidos desde reset do medidor; publicação60ticks
reinicia só a janela parcial. Contagem total é heap/O(1), sem novas amostras.

## Investigação para amanhã, antes de novas mudanças

1. Obter amostra aquecida de CPU cobrada e Memory sem novo build; analisar
   delta de bucket com cobertura e população/cadeias/ordens da mesma janela.
2. Separar taxa de negócios confirmados, operações/recibos criados e volume
   de chamadas às rotinas. Não inferir uma coisa pela contagem da outra.
3. Reproduzir offline cargas3/5/10salas, labs3/7/10, ordens ativas variadas;
   variar histórico independente do trabalho ativo. Contar scans, avaliações,
   recomputações e acessos ao livro. Medir warm/cold e reset separadamente.
4. Inspecionar craft.startItem, labPolicy.assignments, partialSales, claims,
   terminal listed polling, hauler mineralJob/stockPolicy/chainFeed e livro
   compartilhado. Localizar recomputação por lab/hauler/recurso que poderia
   usar uma avaliação por sala/versão de estado e invalidação explícita.
5. Planejamento incremental com orçamento por tick deve preservar execução,
   cooldown, prioridades, equidade, estoque/custos e confirmação de intents.
   Evitar cache temporal de saldo e saltar manutenção vital por bucket.
6. Corrigir somente causas reproduzidas; smoke precisa medir escalabilidade
   por contadores além de resultado. Benchmark Node não prova CPU Screeps.

ARK-128 continua In Progress; ARK-127/129 ainda dependem da evolução dos labs
de E1N47. ARK-131concluída com limpeza confirmada live. Preservar staging do
usuário: grafana.json MM contém versão atualizada no worktree. Sem commits.
