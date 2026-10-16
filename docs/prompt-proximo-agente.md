# Prompt para o próximo agente

Cole o bloco abaixo como primeira mensagem do agente.

---

Você vai continuar o trabalho de **CPU, economia e capacidades** do projeto ScreepsMuszbot (repositório local
`c:\Users\Arkemenes\Documents\code\screeps\world\ScreepsMuszbot`, branch `main`, já commitado). O dono conversa em **português**;
comentários de código em **inglês**. O servidor é o `shard3` do Screeps; `npx grunt` **publica no servidor** (copia o bundle ao cliente).

## 1. Leia antes de qualquer coisa, nesta ordem

1. `CLAUDE.md`, `specs/constitution.md`, `specs/README.md`, `specs/ARCHITECTURE.md`, `specs/ROADMAP.md`
2. **`docs/handoff-agente-2026-10-15.md`** (estado medido, o que está no bundle, ordem dos passos, regras, pontos em aberto e a seção 8 com os
   comandos de console)
3. `docs/roadmap-otimizacao-e-capacidades-2026-10-15.md` (avaliação com números, **regra de mercado §3b**, decisões dinâmicas por preço)
4. As specs que você vai executar, cada uma com `spec.md`, `plan.md`, `tasks.md` em `specs/features/`

## 2. O que fazer, nesta ordem (uma feature por vez)

| # | Spec | Issue (Linear) | Resumo |
|--:|---|---|---|
| 1 | **0153** listagens (P1 listar só se competitiva, P2 cancelar esgotadas, P3 prazo em tempo real, P4 descida grátis desligada por padrão, P5 pixel) | ARK-138 | maior taxa em risco já medida (3,88 M); 997 pixels listados +12% acima do mercado |
| 2 | **0154** `energyReport` + framework de experimentos | ARK-133 | duty real por ação e `E*/duty`; destrava 0148 e 0149 |
| 3 | **0155** `labReport` | ARK-134 | decide se `OPERATE_LAB` (0150) tem retorno; mostra os motivos de lab ocioso |
| 4 | **0148** builder sob demanda (experimento com rollback automático) e upgrader por excedente | ARK-135 | maior ganho de CPU restante (0,6–1,2) |
| 5 | **0150 fase 0** processar power até GPL 3, decisão dinâmica por payback | ARK-137 | decisão do dono: processar até GPL 3 e reavaliar; só excedente de energia |
| 6 | **0156** lógica de CPU restante (L4, L2, L3, picos, partida a frio, limpeza) | ARK-139 | caches só por assinatura, com oráculo/fuzz |
| 7 | **0149** boosts (XLH2O nos builders primeiro) | ARK-136 | decisão dinâmica por preço; depende de 0154 |
| 8 | **0150 fase 2** power creep | ARK-137 | só se 0155 e o gate econômico (inclui profundidade de bid de XLH2O) fecharem |

Siga o fluxo de `specs/README.md` para cada uma: o `spec.md` já está revisado; **leia o plan e o tasks**, implemente tarefa por tarefa, atualize os
checkboxes, e só então marque a feature como done no `ROADMAP.md`.

## 3. Regras que não podem ser violadas

- **Mercado (§3b):** compras **só em ordens existentes** (`deal`, `createListing=false`), nunca criar ordem de compra; preço de decisão = **preço executável
  na quantidade** + frete em energia + **todas as taxas**; vendas preferem bids; listar custa 5% **não reembolsável**; **não cancelar listagem ativa**
  (perde a taxa); baixar preço é grátis, aumentar paga 5% x aumento x restante. Nada fica "indefinidamente vendendo".
- **Preços flutuam:** nenhuma conclusão econômica é fixa. Toda decisão é função do preço do momento (preço de referência suavizado, bid/ask
  executáveis), com histerese, cadência e **guarda de confiança** (sem preço confiável, mantém o estado). Grava os preços que usou. Nunca cancela trabalho em andamento.
- **Nunca cachear estado quente por tempo.** Só por assinatura das entradas, com invalidação por mudança. Referência intocada em `test/` + oráculo
  (`test/equivalence/compare.js`) e fuzz quando mexer em decisão.
- **O boost nunca custa energia extra** (confirmado no código do motor); o `energyLedger` já segue a fórmula do motor.
- **Constituição:** `guard()` em todo subsistema, nada de objeto de jogo em Memory, estado derivado no heap, stall guard em todo laço, configuração em
  `Memory.settings` (não em literais). Cada mudança nova **atrás de flag desligável sem deploy**.
- **Validação em produção, sem A/B** (o `abTest` foi removido por decisão do dono): uma mudança por deploy; compare o `cpuReport` automático
  (spans-alvo e `warm`) com o anterior; a carga varia ±0,4 no total, o sinal confiável são os spans. Reverter pela flag se piorar.
- **Cada deploy reinicia o global** (tick frio ~190 CPU): um deploy por passo; não publique no meio de uma medição.

## 4. Como trabalhar

- Antes de começar uma issue no Linear (projeto `ScreepsMuszbot`, time `Arkemenes`), mova-a para **In Progress**; ao concluir, para **Done**. Issues novas vão
  para o **Backlog** para revisão do dono. ARK-128 é a issue pai e segue In Progress.
- Verificação de cada mudança: `node --check` nos arquivos tocados; `node test/smoke.js "$(pwd)"` (**caminho absoluto**) verde, com asserts novos para cada
  critério de aceitação; `graphify update .`; `npx grunt` ao concluir a tarefa autorizada (publica); `ROADMAP.md`/`ARCHITECTURE.md` em dia.
- **Commite por feature** (um commit por spec, mensagem em português, trailer `Co-Authored-By`). Não deixe arquivos sem commit.
- Windows: heredocs longos no Bash falham; escreva arquivos com a ferramenta de escrita e rode scripts a partir deles.
- Não grave segredos em issues, notas, grafo ou commits. Contexto e decisões vão para o vault Obsidian (`90-AI/<agente>/projetos/`) conforme `CLAUDE.md`.

## 5. Decisões do dono (já tomadas) e o que NÃO esperar dele

- Camada de lógica primeiro, unidades depois. Processar power até GPL 3 e reavaliar (dinâmico, pausa se energia/power encarecer).
- Builder sob demanda por experimento automático com rollback. Os três ajustes da 0152 (`hauler.idleRecheckTicks`, `builder.idleRecheckTicks`,
  `hauler.deliverRepickTicks`, todos 5) estão **ligados e aprovados**.
- Listagens e pixel: **use os padrões propostos na spec 0153** (relativos ao mercado). O dono não tem números e **não quer ser consultado** por isso; ele ajusta
  depois sem deploy. Os ~1.000 pixels da Steam já estão na conta: vender por `deal` em bid, **nunca criar uma segunda ordem de pixel**, nunca cancelar a listagem existente.
- Pergunte ao dono **somente** o que bloqueia de verdade (credenciais, risco de perda de dados). Na dúvida de política econômica, escolha o padrão conservador
  da spec, registre a decisão e avise no resumo final para ele reavaliar.

## 6. Como reportar

Ao terminar cada feature, responda em português com: o que mudou (arquivos e comportamento), os critérios de aceitação cobertos e como foram testados,
o commit, o que precisa de medição em produção (qual span/contador olhar no `cpuReport`) e **qualquer decisão que você tomou sozinho**, para o dono reavaliar.
Não declare ganho de CPU sem medir nos spans; não declare feature concluída com smoke vermelho.

## 7. Primeiro passo

Confirme que leu os documentos da seção 1, rode `node test/smoke.js "$(pwd)"` para a linha de base, mova a ARK-138 para In Progress e comece pela **0153, tarefa 2 (P1)**.

---
