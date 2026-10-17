> Atualização posterior — 16/10/2026: usuário pediu desenvolvimento autônomo, sem novo deploy até retorno. [Pacote físico0153-A1/L2-book](pacote-local-listagens-2026-10-16.md) local, smoke11717/build119; features138/139 In Progress. Política econômica off; reutilização de livro default true. Pixel executor/readiness e CPU live continuam pendentes. Usuário já havia publicado etapa2 aproximadamente17:06.

# Handoff — planejamento integrado 0148–0157

> **Atualização 16/10/2026:** execução local incremental autorizada; histórico persistente sofisticado adiado. Siga [plano vigente](plano-execucao-incremental-2026-10-16.md). 0156-A/ARK-142 concluído offline: smoke11616 verde, build isolado, cliente preservado. Etapa 2/T1–T2 (ARK-143) implementada localmente: contabilidade WORK, qualidade no heap, sem deploy; [entrega](entrega-0154-a-2026-10-16.md). Próxima etapa: 0153-A/ARK-138, política de listagens. O material anterior abaixo é histórico quando divergir deste plano.

Atualizado em 2026-10-16. [Fonte vigente: planejamento integrado](planejamento-integrado-2026-10-16.md).
Acompanhamento documental: [ARK-141](https://linear.app/arkemenes/issue/ARK-141/fechar-contratos-e-rastreabilidade-do-planejamento-integrado-0148-0157). ARK-128 acompanha o trabalho maior de CPU.

## Autorização e estado

O usuário autorizou prosseguir autonomamente com planejamento/propostas e delegar revisão independente antes de fechar a documentação. **Não implementar, ativar, publicar, cancelar ordens ou criar/alterar operador.**
Specs/plans/tasks de0148,0149,0150,0153,0154,0155,0156,0157 foram consolidados e revisados independentemente, com status planned documental. R1–R6 foram corrigidos e reavaliados favoravelmente. Implementação e evidência live continuam pendentes. Issues de features ficam no Backlog; conclusão da ARK-141 é somente documental.
0152 permanece aprovada com backoffs de cinco ticks; não reabrir a decisão.

## Contratos que o próximo agente deve preservar (v1.0 documental, r2 revisada)

- 0157: orçamento por consumidor e prazos, renda líquida e transporte compartilhado, admissão viva por owner; quote não reserva saldo.
- 0154: slots corrigem estimativa, não produzem confirmação geral de consumo; movimentos desconhecidos ficam unknown.
- Utilização por ação, ocupação única por trabalhador/tick e produção/gasto são métricas diferentes.
- Coverage preserva agregados confirmados e desconta gaps/reset/cauda; gate do operador exige48h observadas no regime atual, com estatísticas suficientes por população/qualidade e publicação/replay/ack duráveis, não duas datas/buckets.
- 0149: chave canônica labBoostReservations, todos os leitores pelo adaptador; seleção real por bodyPartsCount/corpo inteiro; reset concilia e cancela preparação. Cleanup independe de idle drain; takeover manual/quarentena encerram boost sem fingir lab livre.
- 0150: primitive comum modelo/runtime/executor; quota strict default e boundedSurplus opt-in orçado; fase/cadeia só termina confirmada e entregue. Cauda impossível replaneja, não espera indefinidamente.
- 0148: piso emergencial independente de off/override; defesa/essenciais antes do builder de emergência e opcionais depois.
- Experimento usa overlay removível sem escrever configuração-base. Off/reset não desliga reconciliação/segurança gerida.
- Sete dias é cancelamento gerido, diferente de expiração natural; dry-run/allowCancel e power livre primeiro. GPL3 é marco inicial configurável.

## Dependências

Usar o DAG do planejamento integrado, não a antiga fila universal:
0156-A/oráculo,0154-A/eventos e0153-A/política são isoláveis.
0154-A →0157-A →0154-B/relatórios/experimentos;0155 usa coverage.
L2 exige referência0153 revisada;L3 exige observação0155 e adaptador0149, sem exigir piloto de boost.
Pilotos0148/0149/fase0 seguem gates próprios; fase0 não depende das reações operadas.
Compatibilidade completa+baseline48h+gargalo/ops/logística/venda → avaliação do operador; novo regime exige nova evidência antes de expansão.

## Evidência e testes

Números de15/10 (warm15.97,cold167–197,preços/estoques/GPL/taxa3.88M) são históricos. Não houve coleta atual de Grafana/jogo.
Os novos comandos energyReport/labReport/boostStatus/powerPlan são interfaces planejadas, não APIs já disponíveis.
As strings de assertions nos tasks são propostas de testes futuros; checkboxes abertos. Smoke simulado não gera48h reais nem comprova CPU/payback.
Não rodar Grunt nesta etapa: o script copia ao cliente. Futuro build isolado pode usar processo-filho com LOCALAPPDATA em pasta temporária da workspace validada; nunca confundir com publicação.
Grafo de15/10 pode estar desatualizado; consultar antes de varrer e confirmar no arquivo. Sem mudança de código, não atualizar AST por obrigação de implementação.

## Revisão e encerramento

[Prompt de revisão independente](prompt-validacao-final-2026-10-16.md).
[Parecer e reavaliação](revisao-final-planejamento-2026-10-16.md) e [resposta do autor](resposta-revisao-final-planejamento-2026-10-16.md) registram o fechamento documental da ARK-141. Veredito favorável; nenhuma implementação ou validação live concluída.
Próxima etapa, após fechamento documental: apresentar ao usuário o planejamento revisado e aguardar autorização futura para qualquer pacote de código. Nenhum agente deve tratar a revisão favorável como essa autorização.
