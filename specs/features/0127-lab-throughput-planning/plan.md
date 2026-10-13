# Plan — 0127

1. Extrair motor puro de ARK-99 para `utils/labPlanModel.js`, compartilhado com
   harness. Generator permite avaliar candidatos em fatias por tick. Suportar
   estoque/cooldown inicial, buffer e targets por produto, reproduzindo defaults.
2. Gerar `utils/labPolicyData.js` do JSON da pesquisa com script determinístico.
   `utils/labPolicy.js` indexa catálogo, valida geometria, cria referência larga
   real e cacheia avaliações no heap com limites de trabalho e candidatos.
3. `utils/labPolicyRuntime.js` mantém cursores/saldos/atribuições, confirma
   intents e observa logística, publicando `labReactions`/`labLoad`.
   `craftChain` usa item lab com targets individuais, sem alterar compras/vendas.
   Filas antigas migram em barreiras, preservando onda em execução.
4. `labReactions` centraliza reservas e execução; `structures/lab` delega.
   `hauler` respeita limites de entrada e proteção de dupla função.
5. Config controla modo, logística, candidatos, orçamento, stall e reavaliação.
   `craftPlanner` usa estimativa cacheada; enquanto avaliação não termina, mantém
   estimativa conservadora explicitamente identificada.
6. Smoke de execução, reprodução da pesquisa, check, grunt, docs/grafo/Linear.

Memory guarda dados operacionais pequenos; catálogo, geometria, generators e
cache são derivados no heap. Nada varre Game.creeps ou room.find diretamente.
Nenhuma configuração do servidor será escrita; build segue fluxo existente.
