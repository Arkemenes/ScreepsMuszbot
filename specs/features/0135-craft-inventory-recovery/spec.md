# Craft: estoque por lote, custos duráveis e recuperação (ARK-125)

Status: done — proposta autorizada e implementação local concluída em 2026-10-14; validação live após publicação.

## Evidências e causas

Snapshots de shard3 nos ticks 83647035/83647091:
- W7N49 possui utrium_bar300 no terminal, mas cinco registros stranded
  reservam2700. `abort()` registra buys.qty, chain.qty e targets de todas as
  etapas, inclusive produtos não fabricados. `commitments()` soma esses
  registros por até retentionTicks259200 e `saleAvailable()` retorna zero.
- E1N47 tem reductant1000 na factory, configuração H/energy400, cooldown0
  e nenhuma energia em storage/terminal/factory. A ausência de energia explica
  a paralisação. A causa live da reposição não ocorrer ainda não foi observada.
- `craftChain.advance()` verifica preenchimento com dealtAmount bruto;
  `terminalOps` já registra netBought. Energia consumida no frete pode ser
  considerada componente entregue pela cadeia.
- Energia comprada não assegura lastro até sua utilização: consumidores usam
  `terminalClaims.physicalFree`, que protege carga de operações, mas não faz
  alocação física dos insumos de cadeias. Factory continua como consumidor
  opcional sujeito à reserva operacional. O planner desconta reserva ao
  planejar estoque próprio, mas isso não garante disponibilidade futura.
- `saleFloor()`/`realized()` leem Memory.terminalOps.events, descartado por
  recentEvents após statsWindowTicks60. buyCost pode fixar custo zero.
- `abort()` libera a cadeia antes de confirmar cancelamentos/recovery e
  registra est.spend como gasto; garbage collection pode remover operações
  concluídas após10000ticks enquanto a cadeia ainda depende de seus custos.

## Resultado desejado

Uma cadeia possui um lote identificável, com saldo real, compras futuras,
consumo, produção e custos separados. Só saldo real reserva estoque físico.
Uma espera preserva o lote e informa o bloqueador; cancelamento/expiração não
cria material nem perde custo. A ausência de energia não provoca ciclos de
abort/recompra nem consome a reserva operacional da sala.

## Proposta

### 1. Inventory ledger por proprietário/lote

- Separar demanda futura (`queue`, targets, pending buys) de saldo adquirido
  ou atribuído fisicamente ao lote. Cada operação, transporte e etapa publica
  confirmação idempotente de entradas/saídas, com identificadores persistentes.
- Confirmar produção/consumo dos labs/factory; retirar insumos consumidos e
  acrescentar somente produto efetivamente produzido. Retentativa/reset não
  aplica a mesma confirmação duas vezes. Intents ainda pendentes mantêm claims.
- Compartilhar a alocação de estoque entre venda, consumidores, staging,
  haulers, chains e listings. Não somar cadeia/operação/receipt sobre a mesma
  quantidade. Compras de terceiros não financiam o lote.
- Dar identidade distinta a cadeias da mesma sala abertas no mesmo tick,
  incluindo factory/labs, preservando vínculos dos IDs antigos.
- Ao cancelar, passar por recuperação: aguardar intents, cancelamentos de
  listings e retorno de carga antes de fechar o lote. stranded recebe apenas
  saldo real e custo atribuído restante. Não reservar produtos/intermediários
  que nunca existiram, nem considerar produto vendido como sobra.
- Permitir reaproveitar saldo recuperado por outra cadeia mediante transferência
  explícita de propriedade/custo. Não reter insumos fictícios por dias.

### 2. Contabilidade durável

- Acumular créditos pagos/recebidos, frete e taxas de criação/extensão/repricing/
  cancelamento por operação/lote, apenas após confirmação. A janela de stats é
  uma projeção, nunca a fonte dos custos ou lucro.
- Copiar/reconciliar acumuladores na cadeia e conservar histórico necessário
  antes de GC de operações. Não duplicar fees ao cancelar ou preencher listing.
- Distribuir custo entre insumos restantes, produto produzido e vendido;
  vendas parciais e cadeia reduzida não apagam gasto já ocorrido.
- Para compra de energia, usar unidades líquidas e distribuir seu custo sobre
  elas; frete descontado do ganho não é cobrado novamente como custo externo.
- `saleFloor` não armazena zero por ausência de eventos. Custo desconhecido
  permanece explícito; usar piso conservador da estimativa existente enquanto
  houver reconstrução, sem declarar lucro realizado preciso sem evidência.

### 3. Energia e retomada

- O terminalBuy manual mantém quantidade bruta. O craft declara necessidade
  líquida; suas compras são dimensionadas por quotes reais para suprir o saldo
  líquido, mantendo limite econômico e orçamento total já aprovados.
- Verificar componentes e energia operacional antes de iniciar cada etapa;
  reservar só energia acima do piso da sala e de claims anteriores. Energia
  atribuída a outro dono ou prometida por compra não é disponibilidade atual.
- O hauler pode alimentar uma etapa já financiada com sua energia atribuída,
  preservando prioridades essenciais e o piso operacional. Não elevar todo
  craft a crítico nem introduzir options.urgency.
- Falta de energia entra em espera explícita com déficit, origem candidata e
  motivo: orçamento/preço/frete, transferência pendente, reserva operacional,
  transporte ou ausência de oferta. Uma compra de reposição por déficit líquido,
  deduplicada com compras/intents/recebimentos do lote.
- Repor por fontes executáveis e autorizadas: estoque próprio, transferência
  interna ou compra dentro do limite. Considerar batteries com custo de
  conversão/energia inicial e ocupação da factory; sem reconfigurar uma etapa
  em andamento ou criar dependência circular. Se não houver bootstrap viável,
  aguardar produção/transferência local com diagnóstico.
- Reavaliar margem antes de reposição: não gastar acima do orçamento para
  salvar a cadeia. Espera tem prazo/cadência configuráveis e mede progresso de
  reposição. Sem avanço, suspender nova abertura equivalente e recuperar o
  lote; liberar apenas o crédito futuro e preservar saldo/custo já adquiridos.

### 4. Migração e diagnóstico

- Executar migração versionada/idempotente, preservando IDs, operações,
  listings, saldos vendidos e jobs em andamento. Preferir evidência confirmada
  de operações/counters e proteger integralmente estoque publicado.
- Legacy stranded não prova posse: reconciliar com saldo físico depois de
  claims válidos de terceiros, sem atribuir o mesmo material a dois lotes. Não
  apagar todos os registros nem transferir estoque de uma cadeia ativa.
- Recuperar custos por buyCredits/netBought/transactionCost/marketFees e
  evidências ainda disponíveis. Dados insuficientes recebem confidence/reason,
  sem inventar preço histórico exato.
- Diagnóstico diferencia produto ainda em factory/labs, saldo reservado por
  outro proprietário, energia ausente, custo desconhecido e intent pendente;
  informa quem bloqueia, quantidade e idade do último progresso.
- Logs repetem somente quando motivo muda. Não cancelar/recomprar para gerar
  atividade aparente. Validação live compara progresso e custos entre snapshots.

## Critérios de aceitação / smoke

1. Abort antes de produzir não reserva produto final nem intermediários.
2. Abort com compra parcial, produção parcial e venda parcial preserva somente
   saldo correspondente; gastos anteriores permanecem contabilizados.
3. Utrium_bar300 no terminal pode ser vendido por sua cadeia apesar de legacy
   stranded2700 fictício, sem liberar estoque de swing/listing/terceiros.
4. Cancelamento com pending deal/extension/carrier protege material até
   confirmação; reset não duplica entradas, recuperação ou custos.
5. Mais de60ticks e GC/reset não mudam custo acumulado, piso ou lucro do lote.
6. Energia800 bruta com frete positivo não prova disponibilidade líquida800;
   reposição cobre apenas déficit, não duplica pedidos e respeita o teto efetivo.
7. Factory sem energia espera explicitamente e retoma quando sua energia
   chega; outras operações não gastam a energia reservada da etapa.
8. Reserva operacional e prioridades de sobrevivência permanecem protegidas;
   sem rota economicamente viável, recuperar/suspender sem loop de recompra.
9. Factory e labs na mesma sala/tick têm donos distintos; preenchimentos,
   transportes, produção e taxas não são atribuídos ao dono errado.
10. Migração com dados insuficientes mostra custo estimado/desconhecido e
    preserva o piso conservador, sem lucro realizado falsamente preciso.

## Entrega após revisão

Seguir plan.md → tasks.md → implementação. Node check, smoke, grunt sem cópia
live, diff e graphify update; ARCHITECTURE/ROADMAP atualizados. Após publicação,
validar venda W7N49, energia/produção E1N47 e piso/custo E1N45 em dois momentos.
