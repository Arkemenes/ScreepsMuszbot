# Tasks

- [x] Reproduzir bloqueio por custo legado inteiro e pool sem lastro.
- [x] Reconciliar quantidades/custos e adoção idempotente com proveniência.
- [x] Compartilhar custo atribuído entre seleção/abertura e manter confiança.
- [x] Smoke/check/build/diff/graphify/docs e publicação autorizada.
- [ ] Confirmar retomada live de E1N47.

Reprodução: quatro assertions falharam antes do fix, incluindo abertura real
de cadeia de labs. Smoke6604 verde após18 regressões: pool físico/listing/ativo,
adoção parcial/reset, custo conhecido alto, oportunidade desconhecida, seleção
já ajustada sem dupla cobrança, base no recurso certo e confiança propagada à
produção/abort por recurso. Nenhum gasto histórico foi promovido a comprovado.

Entrega: check5JS+dist e diff limpos; grunt108 módulos copiou ao cliente com
hash igual ao dist; graphify4432nodes/9167edges atualizado. Sem commit.
Falta snapshot live confirmando abertura/avanço da cadeia de E1N47.
