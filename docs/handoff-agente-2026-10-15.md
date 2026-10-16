# Passagem para o próximo agente — CPU, economia e capacidades (2026-10-15)

**Escrito para:** o agente que vai implementar o plano. O dono conversa em português; comentários de código em
inglês. Linear: projeto `ScreepsMuszbot` (time `Arkemenes`, chave `ARK`); ARK-128 segue **In Progress**.

## 1. Leia nesta ordem

1. `CLAUDE.md`, `specs/constitution.md`, `specs/README.md`, `specs/ARCHITECTURE.md`
2. `docs/roadmap-otimizacao-e-capacidades-2026-10-15.md` (avaliação com números, regra de mercado §3b, ordem dos passos)
3. As specs de `specs/features/`: **0145–0147, 0152** (feitas), **0148, 0149, 0150, 0153, 0154, 0155, 0156** (a fazer; cada uma com spec, plan e tasks)

## 2. Onde estamos (medido)

- `warm` (CPU pelo bucket sem o tick frio do deploy): **15,97** na última janela longa (583 intervalos), contra ~16,94
  antes. Janelas de 150 intervalos variam ±0,4 por carga. Resíduo do motor 2,33 -> ~1,7–1,9.
- Tick frio de cada deploy: 167–197 CPU. O Grafana tem uma série "CPU aquecida (warmUsed)" (reimportar `grafana.json`).
- Meta do dono: **< 15** (ideal < 10, inalcançável sem perder funcionalidade; teto realista 11,3–13,3).

## 3. O que já está no bundle

| Peça | Para quê |
|---|---|
| `cpuReport(n)` e **relatório automático** 150 intervalos após cada deploy (`stats.autoReportIntervals`) | `warm`, resíduo, spans, linha `[probe]` |
| `cpuAuditMemory()`, `cpuAuditRoomFields()`, `claimsSpans(true/false)` | diagnóstico de Memory e spans |
| `test/equivalence/compare.js`, `shadowBudget.js` | oráculo offline e sombra live opcional |
| `probe.js` | taxa de repetição de decisões (`terminalOps.listResidual` ~97–99%, `labPolicy.assignments` ~92%) |
| `energyLedger` **corrigido** | segue o motor: energia base (boost não soma energia); repair = hits x 0,01 |

**Publicado e já usado:** `ordersAudit()` (auditoria de ordens/taxas; dados na spec 0153). O `abTest` foi **removido**; o `memoryCleanup` restaura qualquer configuração que um teste em andamento tenha deixado.

## 4. Defaults ligados da 0152 (validados pelo dono; teste direto em produção)

`hauler.idleRecheckTicks` 5, `builder.idleRecheckTicks` 5, `hauler.deliverRepickTicks` 5. O **A/B intercalado (`abTest`) foi
abandonado e removido** (2026-10-15): lento e frágil. Os três ajustes são tratados como validados e acompanhados direto em
produção pelo `cpuReport` automático (contadores `hauler.idleSkip`, `builder.idleSkip`, `hauler.deliverKept`). Reverter sem deploy:
`1` na config correspondente. **Como validar daqui em diante:** uma mudança por deploy, atrás de flag; comparar o `cpuReport` automático
(spans-alvo e `warm`) com o anterior; o ganho real aparece nos spans, a carga varia ±0,4 no total.

## 5. Ordem de execução recomendada

| # | Passo | Spec | Por quê agora |
|---:|---|---|---|
| 1 | ~~Publicar `ordersAudit` e rodar~~ **feito** (dados na spec 0153); começar pela 0153/P1 | 0153 | maior taxa em risco já medida |
| 2 | `energyReport` + framework de experimento | **0154** | destrava 0148 e 0149 |
| 3 | Utilização dos labs | **0155** | decide o power creep |
| 4 | Builder sob demanda (experimento com rollback) | **0148** | maior ganho de CPU (0,6–1,2) |
| 5 | Revisão das listagens (listar só se competitiva) | **0153** | taxas e ordens paradas; libera estoque |
| 6 | Power: processar até GPL 3 (dinâmico) | **0150** fase 0 | decisão do dono; só excedente de energia |
| 7 | Lógica de CPU restante (L4, L2, L3, picos, frio) | **0156** | ~0,7–1,0 CPU, exige oráculo/fuzz |
| 8 | Boosts (XLH2O nos builders primeiro) | **0149** | depende de 0154 e de preços; decisão dinâmica |
| 9 | Power creep | **0150** fase 2 | só se 0155 e o payback fecharem |

## 6. Regras que valem para tudo

- **Mercado (roadmap §3b):** compras **só em ordens existentes** (`deal`, `createListing=false`), nunca criar ordem de
  compra; preço de decisão = **preço executável na quantidade** + frete em energia + **todas as taxas**; vendas
  preferem bids existentes; listar custa 5% não reembolsável, então só com prazo e teto. Nada fica "indefinidamente vendendo".
- **Preços flutuam:** nenhuma conclusão econômica é fixa; toda decisão é `f(preço do momento)`, com histerese,
  cadência e guarda de confiança; grava os preços que usou; nunca cancela trabalho em andamento. A energia custou 31,6
  em 2026-10-15 (o dono citou 20–70).
- **Nunca cachear estado quente por tempo**; só por assinatura das entradas, com invalidação por mudança.
- Referência intocada em `test/` + oráculo/fuzz sempre que mexer em decisão.
- **Cada deploy reinicia o global** (cold tick ~190 CPU, mata medições em andamento): um deploy por passo, e não
  publique enquanto um `cpuReport` está para sair se quiser comparar janelas limpas. `npx grunt` **publica no servidor**.
- Windows: heredocs longos no Bash falham; escreva arquivos com a ferramenta de escrita.
- `node --check`, `node test/smoke.js "$(pwd)"` (caminho absoluto), `graphify update .`, ROADMAP/ARCHITECTURE em dia.

## 6b. Estado das decisões do dono

| Decisão | Estado |
|---|---|
| Camada de lógica primeiro; camada de unidades depois | decidido |
| Processar power até GPL 3 e reavaliar | decidido, **dinâmico** (payback em dias; pausa se a energia/o power encarecer) |
| Builder sob demanda por experimento com rollback | decidido |
| Boosts | decisão dinâmica por `E >= E*`; build robusto, repair/upgrade sensíveis ao preço |
| Regra de mercado (compras só em ordens existentes; todas as taxas) | **obrigatória** |
| Revisão das listagens (0153) | aprovada em princípio |

## 7. Pontos em aberto (nenhum bloqueia os passos 1–5)

1. ~~Resultado dos `abTest` do 0152~~ **encerrado**: o dono abandonou o A/B e deu os ajustes como validados (seção 4).
2. Sala do primeiro experimento do builder (sugestão: E5N41 ou E6N41, RCL3).
3. `power.maxPaybackDays` (sugestão 30) e destino dos 3.597 power que sobram.
4. `REACTION_TIME.XLH2O` real, power atualmente no storage/power spawn, produção de XLH2O por dia por sala.
5. Duty real de build/repair/upgrade (sai do `energyReport`, spec 0154).
6. Limiares de segurança do experimento do builder (container 40%, estrada 30%, ticks em tier `critical`).
7. Linear: issues criadas no **Backlog**, filhas de ARK-128, para revisão do dono: **ARK-133** (0154), **ARK-134** (0155), **ARK-135** (0148), **ARK-136** (0149), **ARK-137** (0150), **ARK-138** (0153), **ARK-139** (0156). Mover para *In Progress* ao começar cada uma e para *Done* ao concluir.
8. `memoryCleanup` e spans temporários (O3): remover depois de um deploy confirmando `removed = 0`.
9. Reimportar `grafana.json` para a série `warmUsed`.
10a. **Git:** tudo commitado em 2026-10-15 (`da543a0` código e testes; `f989c46` specs, plano e passagem); árvore limpa. Um commit por pacote daqui em diante.
10. **Listagens (0153), especificada com o dono em 2026-10-15** (spec completa: mecânica de taxas, 5 itens P1–P5 e seção de pixel).
    Dados de `ordersAudit()` 23:06: 19 de 30 listagens ativas acima do mercado (taxa 3,88 M, valor travado 74,6 M); a listagem de
    **997 pixels a 62.947 (+12,4%)** tem 81% da taxa. Regras do dono: **não perder a taxa paga** (não cancelar; baixar preço é
    grátis; aumentar paga 5% x aumento x restante); o dono trará **~1.000 pixels da Steam** para vender (via `deal` em bids, sem
    taxa; o restante por `extendOrder` na ordem existente só se compensar; nunca uma segunda ordem de pixel). Decisões do dono: **padrões propostos na spec** (relativos ao mercado, ajustáveis sem deploy); não esperar resposta. Ordem: P1 listar só se competitiva, P2 limpar
    esgotadas, P3 prazo em tempo real, P4 descida grátis (desligada por padrão), P5 pixel.

## 8. Como conferir e ajustar (console do Screeps; cada linha cabe no limite de 1024 caracteres)

**Dados de jogo** (colar uma linha por vez):

```
REACTION_TIME.XLH2O
JSON.stringify(Game.gpl)
Object.values(Game.rooms).filter(r=>r.controller&&r.controller.my).map(r=>r.name+': storage '+((r.storage&&r.storage.store.power)||0)+', terminal '+((r.terminal&&r.terminal.store.power)||0)).join(' | ')
Object.values(Game.structures).filter(s=>s.structureType==='powerSpawn').map(s=>s.room.name+': power '+s.store.power+', energy '+s.store.energy).join(' | ')
Game.rooms.W7N49.find(FIND_MY_STRUCTURES,{filter:s=>s.structureType==='lab'}).map(l=>[l.id.slice(-4),l.cooldown,l.mineralType||'-',l.store[l.mineralType]||0].join(':')).join(' ')
```
A última mostra cada lab de W7N49 como `id:cooldown:mineral:quantidade`; `cooldown > 0` = reagindo agora. Uma amostra isolada não prova nada; o `labReport` (0155) mede por dia.

**Duty hoje, sem esperar o `energyReport`:** o Grafana já tem `screeps_room_energy_spent{room,category}` (soma dos últimos 60 ticks). Por tick =
valor / 60. `duty_build ~ (build/60) / (WORK dos builders x 5)`; `duty_upgrade ~ (upgrade/60) / WORK dos upgraders`;
`duty_repair ~ (repair/60) / WORK dos builders`. Os valores de **repair anteriores a 2026-10-15 estavam inflados** (corrigido no `energyLedger`).

**Limpeza (`memoryCleanup`):** cada global imprime uma linha `[memoryCleanup] removed N legacy field(s)` ~5 ticks depois do boot. `removed 0` em
dois resets seguidos = o módulo pode ser removido (spec 0156/O3). Spans temporários: `claimsSpans(false)` (já é o padrão) desliga os de claims; os
`swing.scan.*` são baratos e saem junto com o módulo.

**Reverter ou ajustar um ajuste de CPU sem deploy** (nunca `Memory.settings = {...}`, que apaga as outras configurações):

```
Memory.settings.hauler = Object.assign(Memory.settings.hauler||{}, {idleRecheckTicks:1})
Memory.settings.hauler = Object.assign(Memory.settings.hauler||{}, {deliverRepickTicks:1})
Memory.settings.builder = Object.assign(Memory.settings.builder||{}, {idleRecheckTicks:1})
delete Memory.settings.hauler.idleRecheckTicks
```
`1` = comportamento antigo (busca todo tick); `delete` volta ao padrão (5).
