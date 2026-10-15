# Reposição interna de energia do craft (ARK-129)

## Problema e evidência

83653067:E1N47 XLH2O2040, qi1/H2500, energia necessária1000, reserva10000,
pool0. Conversão anterior1000 foi preemptada para consumo da sala, com base
contabilizada. Histórico pronto/107+amostras. E1N45storage40701 e W7N4947784.
CPU16,16 abaixo do limite20. O bloqueio genérico do terminal trata BUY no
destinatário como conflito de uma transferência automática, embora sejam
recebimentos independentes. Reposição então cai na compra mais cara.
Escolha do primeiro doador por quantidade também ignora doadores posteriores
mais baratos. Cooldown de reavaliação sobrescreve motivo econômico com déficit,
causando alternância de logs sem mudança material.

Confirmação live posterior: apenas terminal-11804 BUY manual energy200000
em E1N47/waiting estava ativo no recurso. Testes reproduziram três falhas
antes do fix. Publicado pelo grunt habitual; confirmação da transferência
e avanço de H/labs continuam pendentes, sem presumir sucesso pelo build.

## Resultado e critérios

- Transferência automática pode entrar no destinatário que tem BUY pendente
  do mesmo recurso. Material continua vindo exclusivamente do estoque atual
  do remetente; compra futura do destinatário não financia envio nem cadeia.
- Preservar exclusão de transferências conflitantes, claims de terceiros,
  reservas operacionais/frete, créditos e saldos do pedido manual.
- Entre doadores físicos e economicamente elegíveis, tentar menor custo
  completo (material+frete), com desempate determinístico; falha de criação
  tenta próxima alternativa viável antes da compra de mercado.
- Não forçar negócio acima do orçamento. Expor orçamento, custo conhecido,
  reserva a recompor, necessidade total e quote que causou recusa.
- Entre verificações econômicas manter último motivo/checkedTick, atualizando
  medidas físicas; chegada suficiente/inbound pendente substitui diagnóstico.
- Testes primeiro reproduzem bloqueio, doador caro primeiro e logs oscilantes;
  testar preservação do manual, intents e limites. Check/smoke/grunt/diff/graphify.

## Review

Escopo revisado: BUY é entrada independente; nenhum recurso futuro é prometido
ao remetente. Não baixar reserva, relaxar margem, cancelar manual nem impedir
preempção para sobrevivência. Baterias e plano atual não são recriados.
Ganhos de CPU da0138 ficam separados; retomada live desta cadeia permanece pendente.
