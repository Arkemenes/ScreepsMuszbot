# Retomada de otimização de CPU — 2026-10-13

Usuário encerrou a sessão para desligar o PC e retomar em outra sessão.
Objetivo mais recente: CPU sustentada abaixo de15, preferencialmente abaixo
de10, preservando produção, defesa e progresso das missões. ARK-116 continua
aberta. Nenhum trabalho de runtime deve continuar durante este encerramento.

## Documentos de entrada

- [Revisão completa](cpu-review-2026-10-13.md): diagnóstico atual, reproduções,
  prioridades, riscos e critérios para cada candidato do próximo pacote.
- [Investigação cronológica](cpu-regression-2026-10-13.md): contexto anterior.
- specs/constitution.md, specs/ARCHITECTURE.md, specs/ROADMAP.md e AGENTS.md.
- Linear ARK-116, projeto ScreepsMuszbot, time Arkemenes:
  https://linear.app/arkemenes/issue/ARK-116/investigar-regressao-de-cpu-de-7-8-para-16-18-e-recuperar-media-abaixo

## Estado confirmado no encerramento

Último pacote sincronizado: API routing.travelToRoom comum, trânsito
incremental para pioneer/raider/scout/remotes/reserver comum e squad fora
de combate; claim conserva realRoute:true/Keepers. Máquina moveToRoom única,
API legada compatível. Cache do grafo incremental valida sequência escolhida;
TTL do caminho nativo central1500ticks; fadiga retorna antes do trabalho.
Stall, bloqueios, recuo e formação tática preservados.

node --check dos10JS tocados, smoke completo e grunt passaram antes dessa
sincronização. graphify update executado. Após ela houve apenas revisão e
documentação. Os três cortes recomendados ainda NÃO estão implementados.

SHA256 conferido de dist/main.js e cliente local, idênticos:
AC2C2AE214B12956B67A0D4F7C53B549E6BAD742245FDE1A7B7339E929F758ED

Cliente: C:/Users/Arkemenes/AppData/Local/Screeps/scripts/screeps.com/ScreepsMuszbot/main.js
Checkout: C:/Users/Arkemenes/Documents/code/screeps/world/ScreepsMuszbot
HEAD observado: d0a4880 (Enhance lab policy tests and market history handling).
O agente não criou commit nesta etapa. Inspecionar git status ao retomar,
preservando alterações feitas por usuário/outra sessão.

## Última medição estável

Probe83632060: bucket489; meterat83632050, window60/ticks60, used16,670.
entry0,052. Janela anterior20,169 incluiu cold start/entry0,906/max50,719.

- creep9,585; plan2,077; terminalOps1,069; intel0,888; structure0,860;
  craftPlanner0,641; spawn0,434; market0,224.
- hauler3,493/6calls; pioneer2,470/8; builder1,365/3,283;
  miner1,354/8,167; upgrader0,532/3.
- pioneer.travel1,864/5calls; graphRoute0,308/3; graphSearch0,071/0,083;
  moveFallback1,162/3; move.native1,079/3. realSearch não apareceu.
- hauler.pickMineralJob0,941 contém stockPolicy0,754, que contém
  terminalFuel0,690. Não somar esses spans.
- builder.opportunistic0,444; pickPile0,135; repairList0,006.

Comparação histórica antes do pacote: at83631501 total23,497,
travel5,476/6,517calls, graphRoute1,156, realSearch1,740. Houve ganho de
movimento, mas população/atividade mudaram: não atribuir toda queda ao código.
Os dados acima são de13/10 e não representam o estado da próxima sessão.

Leitura adicional do usuário:
planner.visualizeEnabled=true, visualizeForceInterval=1.
Salas E1N45/RCL6, E1N47/RCL7, E5N41/RCL2, E6N41/RCL1, W7N49/RCL8;
todas planned=true/planStep13. O floodFill fica depois do retorno de sala
pronta em planCity e está fora do alvo recorrente.

## Evidências offline novas, sem deploy

Probes carregaram o smoke completo com sucesso e executaram módulos atuais:

1. Visualização:200entradas estáveis/60ticks, intervalo1=12000desenhos;
   intervalo50=400. Não são unidades de CPU do servidor.
2. Fuel.plan:1000completed+100transferências elegíveis →1000leituras de
   estados encerrados e100calcTransactionCost para selecionar2transações;
   reserve480 com frete200por transação e margem20%.
3. Builder com site ao alcance e estado Build → solicitação de construção
   no trabalho oportunista e no estado principal no mesmo tick.

Script temporário de probes foi removido; resultados e condições estão na
revisão. Recriar regressões no harness existente durante implementação.

## Próximo pacote recomendado

1. Camada visual no heap com export/import e invalidação por plano/topologia/
   opções/RCL. Reapresentar continuamente; preservar outros desenhos e tratar
   substituição de estrutura com mesma contagem. Separar reconstrução de
   apresentação, pois intervalo1 atual pode ser intencional para visual contínuo.
2. Fuel.plan usar índice de operações ativas e avaliação lazy por prioridade/
   tick até preencher transactions. Carga/taxas financiadas contam todos os
   compromissos. Estoque, criação/cancelamento/reabertura e quotes permanecem
   vivos entre decisões; nenhum forecast global stale.
3. Builder resolver build/repair efetivo sem solicitação duplicada e manter
   reparo crítico/trabalho durante deslocamento; ledger deve contar trabalho
   efetivo. Não desativar opportunisticWork inteiro para ganhar CPU.

Passo direto de caminho multi-room cacheado é candidato posterior, com
testes de shove/stall/TTL/bans/bordas/clearance/reset. Proposta no spec0064
não é implementação. Regressões legadas e claim devem permanecer.

Para perseguir10: estudar coordenação global de resgate por destino/ETA/
WORK. pioneering.js hoje aceita mães até30hops, limite2por par mãe-target,
autoscaleMaxCount6por mãe. Não há orçamento global por destino. Preferir
ajuda próxima com fallback, preservando reforço necessário e produção.
Não matar creeps existentes nem reduzir população arbitrariamente.

## Restrições e decisões do usuário

- Agrupar várias melhorias validadas em um pacote/sincronização: cada deploy
  zera o heap e custa CPU que o bucket baixo não pode desperdiçar.
- Não exigir15min de espera com bucket crítico; janela completa de60ticks
  já identifica regressão. Comparação mais longa vem após estabilização.
- Priorizar trabalho recorrente com evidência. FloodFill foi explicitamente
  retirado do pacote; spec0001 foi corrigido para registrar a retirada.
- Preservar a centralização multi-room para não ajustar cada role à parte.
- Não prometer CPU futura a partir de contagens offline; medir ganho live,
  trabalho concluído e segurança, com população/atividade comparáveis.
- cpuTop(50) é limite de linhas, não janela50ticks. Meter publica a cada60ticks.
  Spans são inclusivos; maxima de módulos não são soma de um pico real.

## Como retomar

1. Ler documentos/issue e conferir checkout/bundle. Não reconstruir/sincronizar
   apenas para reabrir a investigação.
2. Solicitar leitura atual, sem profiler pesado com bucket baixo:

```js
JSON.stringify([Game.time,Game.cpu.bucket,Game.cpu.limit,Memory.stats.cpu.meter])
```

3. Atualizar spec/plan/tasks dos cortes aprovados; teste vermelho/reprodução,
   implementação isolada e invariantes. Conferir core.constitution/census/
   roomCache/Memory/headroom antes de cachear dados vivos.
4. node --check nos arquivos tocados, smoke completo, grunt, diff --check,
   documentação e graphify update. Combinar cortes validados numa sincronização.
5. Conferir SHA256 de dist e cliente, coletar janela pós-inicialização e a
   seguinte estável; ARK-116 só fecha quando a meta sustentada for atingida.

Ferramentas: prefixar shells com rtk (C:/Users/Arkemenes/.codex/RTK.md).
PowerShell/Windows. grunt compila mas cópia automática pode dar EPERM;
Copy-Item -LiteralPath direto para cliente com escalada já foi autorizado
durante o trabalho. Nenhuma escalada nova é necessária para apenas ler/revisar.
Logs redirecionados de PowerShell podem ser UTF16. rtk git diff --check pode
ocultar detalhes; inspeção via subprocess pode ser necessária se exit não-zero.
Não spawnar agentes sem autorização explícita/instrução aplicável.

## Prompt para a próxima sessão

Continue a otimização de CPU do ScreepsMuszbot na issue ARK-116.
Leia AGENTS.md, specs/constitution.md, specs/ARCHITECTURE.md,
specs/ROADMAP.md, docs/cpu-handoff-2026-10-13.md e
docs/cpu-review-2026-10-13.md. Confirme o checkout e obtenha a medição atual
antes de atribuir custos. A última janela estável foi16,67CPU/tick, bucket489.
Meta: abaixo de15, preferencialmente abaixo de10, sem prejudicar produção,
defesa ou missões. A navegação multi-room já foi centralizada e sincronizada.
Prepare um pacote com cache da visualização contínua do planner, previsão de
combustível proporcional a operações/candidatos ativos e remoção de solicitações
duplicadas de build/repair dos builders. Confirme cada hipótese com regressões,
preserve estado vivo e só sincronize o pacote depois de validar tudo, para
evitar vários resets de heap. Flood fill ficou fora da prioridade. As propostas
de passos diretos de movimento e coordenação de pioneers ainda não foram
implementadas. Mantenha ARK-116 aberta até confirmar ganho sustentado em jogo.
