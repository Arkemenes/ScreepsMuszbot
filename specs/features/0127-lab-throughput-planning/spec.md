# 0127 — Planejamento de labs por vazão efetiva

- **Status:** done
- **Owner:** Arkemenes
- **Created:** 2026-10-11
- **Linear:** investigação ARK-97/ARK-99; implementação ARK-98

## Problem

### Correção de CPU — ARK-116 (2026-10-13)

Perfil live: `craft.chains` 5,679 CPU/tick; `hauler.pickMineralJob` 2,570;
`hauler.chainFeed` 1,204. Sem scout/claimer nessa janela. O fallback
`wide-live` refaz alternativas geométricas e ordenação a cada tick; as
alternativas dependem de produto/receita/slots, não de estoque ou progresso.
Manter planos e fases estáticas em caches limitados no heap, invalidando
ao trocar receitas, slots ou produtos/quantidade relevante. A produção,
confirmação de intents e abastecimento continuam decididos a cada tick.
Não acrescentar planos na Memory. Testes devem comprovar reutilização,
troca de receita/geometria/targets e resultados idênticos de produção.
A meta <9 CPU permanece dependente de medição live antes/depois.


Ondas mantêm uma saída por intermediário; largo já existe (0116), mas filas
antigas/configuração manual podem continuar usando uma saída. A estimativa
considera reação e um desconto fixo de 20%, sem transporte, trocas ou cooldown
remanescente. Maximizar participação visual não maximiza produto final por tick.

Pesquisa e simulações: `docs/lab-production-analysis.md` e
`docs/lab-production-simulation.cjs`. A implementação foi autorizada pelo usuário nesta sessão.

## Desired outcome

Escolher o plano com menor tempo efetivo até o lote final, nos labs efetivamente
construídos/ativos do layout fixo, mantendo todos os elegíveis úteis quando há
demanda. Comparar largo, ondas, pipelines e reutilização adaptativa de labs,
incluindo entradas durante cooldown. ARK-99 mostrou ganhos com troca de papel
em RCL6/7; em RCL8, largo é uma referência forte quando o transporte acompanha.
Resultados e limitações: `docs/lab-search-report.md`. Nenhum plano é declarado
ótimo global pela heurística.

## In scope

- Estratégia e razão de espera persistidas/observáveis, sem objetos de jogo.
- Melhor par por topologia real, cacheado no heap; reaproveitar 1/2 quando ótimos.
- Reação manual com múltiplas saídas compatíveis, respeitando reservas para boost.
- Tempo de reação, transporte, troca e cooldown restante no mesmo modelo.
- Carga/consumo limitado ao saldo e reserva compartilhada entre saídas.
- Migração segura de etapas pendentes sem depender de ordenação da fila antiga.
- Candidatos híbridos/pipeline condicionados a ganho demonstrável e buffers.

## Out of scope

Alterar stamp, transformar toda produção em pipeline obrigatório ou prometer
100% de chamadas de reação por tick. Publicação e rollout não fazem parte
da investigação. Plan/tasks serão escritos após revisão desta spec.

## Acceptance criteria

1. Nos conjuntos 1–3/1–6/1–10, largo seleciona 1/2 e 1/4/8 saídas. Subconjuntos
   sem esses centrais selecionam o melhor par válido ou informam inviabilidade.
   Labs inativos, ausentes e reservados não recebem intents de produção.
2. Uma cadeia nova de 3.000 XLH2O compara candidatos com valores oficiais de
   `REACTION_TIME` e logística explícita. A seleção inclui rotação de saídas e
   entrada durante cooldown em RCL6/7; largo continua candidato em RCL8.
   O executor não impõe largo quando outro plano tem menor tempo estimado.
3. O console mostra estratégia, par, saídas, saldo e razões de espera distintas:
   cooldown, insumo, capacidade, troca, reserva e indisponibilidade.
4. Estimativa e executor compartilham catálogo e motor. Preflight assume compras
   dos insumos faltantes; execução reavalia estado após compra. Estimativa
   provisória usa referência conservadora e é identificada. Custos são
   explícitos, configuráveis ou medidos; nenhum ganho alegado deriva só de
   diminuir o limiar `wideMinGain`.
5. Migração em barreira preserva produção/estoque/reservas e etapas em execução,
   mesmo quando o plano novo ordena etapas independentes de outra forma.
6. Saídas concorrentes não reservam mais reagente que o disponível e não
   excedem o saldo do lote; `OK` não é contabilizado como produção confirmada.
7. Pipeline respeita alcance, mineral único, capacidade e saldo; um intermediário
   pode ser entrada durante cooldown, mas produção no tick atual não é requisito
   para validar uma reação downstream no mesmo tick. Consumo compartilhado
   possui reserva e stall guard.
8. A escolha entre largo/ondas/híbrido/pipeline informa sua estimativa e valida
   que reduz tempo até o produto final sob as premissas do cenário. Medição
   real de logística é pré-requisito para habilitar pipeline automático.
9. Smoke cobre regressões de modo manual, filas antigas, RCL parcial, saldo
   pequeno e buffers; `node --check`, smoke e `npx grunt` passam.

## Constitution

Usar census/roomCache, topologia derivada no heap, IDs na Memory, guard nos
subsistemas, tunables em config e busca limitada por número de labs/candidatos.

## Runtime policy — revisão autorizada em 2026-10-11

Esta revisão substitui o escopo anterior de proposta sem mudança de runtime.

Entrega: `docs/lab-policy.md`, catálogo gerado, motor compartilhado e executor
integrado a craft/reactions/hauler. Smoke, self-test e replays preservam os
resultados ARK-99; `node --check` e grunt verdes. Não houve deploy no servidor.

- Catálogo versionado da matriz ARK-99 no heap; planos e alternativas não vão
  para Memory. Melhor política conhecida não é declarada ótimo global.
- Avaliar candidatos pré-computados e referência larga válida na topologia real
  no motor puro compartilhado: estoque, cooldown e targets individuais reais.
  Generator, orçamento por tick, limites de candidatos/iterações e fallback.
- Logística configurada conservadora até medir interfaces, descontando reações
  confirmadas. Pipelines exigem amostras reais ou override explícito. Medir
  atraso de troca; não equiparar modelo agregado a trajetórias dos haulers.
- Memory contém apenas plano/cursores/saldos, papéis/IDs e intents pendentes.
  Confirmar produção no próximo tick pelo cooldown observado: `OK` não avança
  saldo. Powers suspendem execução otimizada. Cooldown nunca é resetado.
- Reservas/snapshot por tick para consumo compartilhado, também no manual;
  produção nova não alimenta downstream no mesmo tick. Carga limitada ao saldo,
  dreno de conflito e proteção dos buffers que serão consumidos localmente.
- Reavaliar em barreiras de janela ou entre ticks com intents confirmados, quando
  avaliação/logística/topologia mudar, com stall
  guard. Migrar filas antigas só no sufixo não iniciado, após onda em curso.
  Legado permanece disponível se política desativada.
- Abastecimento em blocos com buffer baixo/alto, compartilhado com o avaliador;
  medições contam jobs realizáveis ou em trânsito, não espera por cooldown.
- `craftStatus()` expõe escolha, estimativa, origem/limites da avaliação, saldos
  e espera por cooldown/insumo/capacidade/troca/reserva/indisponibilidade.
- Smoke cobre catálogo, estoques intermediários, topologia parcial, vários labs
  em dupla função, falha após `OK`, reset de heap, troca durante cooldown,
  migração e transporte do hauler.
