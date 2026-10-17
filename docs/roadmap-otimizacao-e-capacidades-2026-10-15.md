# Avaliação e roadmap: CPU, população, boosts e power creeps (2026-10-15)

> **Histórico superado pela consolidação documental de 16/10.** Contratos, DAG, limites de autorização e aceite vigentes: [planejamento integrado](planejamento-integrado-2026-10-16.md). O corpo abaixo preserva hipóteses e medições antigas, não instruções atuais.
> A sequência e as decisões atuais estão no [relatório da revisão](revisao-planos-2026-10-15.md) e no [handoff revisado](handoff-agente-2026-10-15.md).
> Specs 0148–0150 e 0153–0156 aguardam revisão independente e revisão do usuário; não implementar/deployar a partir deste documento.
> GPL 3 é somente target inicial configurável. Rentabilidade exige demanda, vida produtiva e abastecimento real; storage 0 não é veto isolado.
> Tabelas de E*, duty, payback, taxas e ganhos abaixo não incorporam todos os ajustes: ver R01–R12. Taxa passada não é recuperada;
> bid de deal não paga nova taxa de 5%; optionalConsumer não prova excedente; OPERATE_LAB ainda não é compatível com o runtime.
> Os limites de CPU abaixo são estimativas históricas sobrepostas, não teto demonstrado ou prova de impossibilidade de <10.
> Cancelamentos de power passam a seguir liberação mínima necessária e reconciliação; não executar as antigas ordens de cancelamento em bloco.


**Escrito para:** o dono do projeto (decisões) e o agente que vai implementar
(execução). Nada aqui foi implementado além do que a seção 1 lista como feito.
Números marcados **[M]** são medidos (cpuTop/cpuBalance/console), **[D]** derivados
por conta, **[E]** estimativas com premissa explícita. Onde falta preço ou dado,
o comando para obter está na seção 6.

> **Atualização 18:30 (preços de mercado e decisões do dono).** Preços lidos:
> power **2.332**, XLH2O **1.644**, XGH2O **911**, KH2O **154**, ops **22,8** créditos
> (fairPrice, confiança "warming"). Efeitos: **boosts T3 a preço de mercado ficam caros** (revisão da seção 2.3:
> o boost também economiza energia; decisão por break-even) e o **power creep com `OPERATE_LAB` passa a ser o item de maior retorno
> econômico** do plano (seção 2.4), condicionado à medição O4. O dono decidiu
> **processar até GPL 3 e reavaliar**. `commitments` (L1) foi otimizado e publicado;
> falta medir (seção 1).

---

## 1. Onde estamos

Última janela longa (`cpuReport`, 583 intervalos aquecidos, boot 83668647) **[M]**:
`warm` **15,97**, resíduo **1,78**, script pareado 14,50, tick frio 197.
Baseline antiga sem o tick frio: ~16,94. **Ganho medido: ≈ −1,0 CPU/tick.**

| Pacote (feito e publicado) | Efeito medido |
|---|---|
| 0145 régua: `warmUsed`, tick frio, `cpuReport`, oráculo de equivalência | habilita medir; descobriu que o baseline antigo incluía o tick frio (~+0,26) |
| 0146 Memory 288 KB -> 204 KB, `exits`/defaults de intel fora da Memory | resíduo 2,33 -> ~1,7–1,9 (**−0,5**) |
| 0147 `resolve` sem alocação; índice do livro de ordens por recurso | `resolve` −0,03; pico do `swingTrade` 25–33 -> 18; média −~0,1 |
| 0147 **L1** `warehouseMany`: um scan de estruturas por cadeia em vez de um por recurso (`commitments`) | **publicado, a medir**: esperado `fuel.plan.commit` 0,37 -> ~0,1 (oráculo: valores idênticos a N chamadas de `warehouse`) |
| `cpuReport` automático | o bot imprime o relatório sozinho 150 intervalos aquecidos após cada deploy (`stats.autoReportIntervals`, 0 desliga) |

Meta do dono: **< 15** (ideal < 10). Faltam ≈ **1,0 CPU** para 15. Para 10, a seção
2 mostra que não há caminho sem reduzir funcionalidade.

### Unidades de referência

- Tick ≈ **4,11 s** [M]: 876 ticks/h, 21.000 ticks/dia.
- Fonte rende 10 energia/tick; 5 salas x 2 fontes ≈ **100 energia/tick** no império, no máximo [D, assume 2 fontes por sala].
- Intent (ação do jogo) ≈ **0,2 CPU** [M, profile]; 34 creeps ≈ **8,7 CPU/tick** [M].

---

## 2. Avaliação por item

Esforço: **S** ≈ 1 sessão curta, **M** ≈ 1–2 sessões com spec/oráculo, **L** ≈ várias
sessões. Risco = chance de mudar comportamento de jogo se mal feito.

### 2.1 CPU: lógica (camada 1)

| # | Item | Evidência [M] | Ganho CPU/tick [E] | Esforço | Risco | Depende de |
|---|---|---|---:|---|---|---|
| L1 | `terminalFuel.plan` / `resourcePolicy.commitments` | `fuel.plan.commit` **0,37** de `terminalFuel` 0,43 (1,1 chamadas/tick, 0,34 cada); `claims.reserve.*` 0,20 | **0,3–0,5** | M | médio | — |
| L2 | Listings `sell:listed` sem evento | `op sell:listed` **0,51** (2,7 chamadas); probe: **99,1%** das chamadas repetem as entradas | **0,3–0,4** | M–L | médio-alto | oráculo (0145) |
| L3 | `labPolicy` (assignments 0,36, confirm 0,15, resolve 0,12) | probe `assignments`: **91,8%** de repetição | **0,2–0,3** | M–L | médio | oráculo |
| L4 | `intel` (0,86; `transitSafety` 0,24, pico 1,76) | 6,1 chamadas/tick | **0,2–0,3** | S–M | baixo-médio | — |
| L5 | `hauler.pickDeliver` (0,86, 8,1 chamadas) e `pickLoad` (0,59) | busca de alvo por hauler ocioso | **0,3–0,5** | M | médio | — |
| L6 | Picos: `miner.distribute` max **5,59**, `intel` max 1,9, `craft.chains` max 4,6 | só afetam o bucket, não a média | ~0 (segurança) | S | baixo | — |
| L7 | Partida a frio: 197 CPU por deploy | hidratação preguiçosa de segmentos/caches | 0 na média | M | médio | — |

Soma L1–L5: **1,3–2,0** CPU/tick. Já cobre os ~1,0 que faltam para 15.

### 2.2 CPU: unidades (camada 2)

| # | Item | Evidência [M] | Ganho CPU/tick [E] | Esforço | Risco | Depende de |
|---|---|---|---:|---|---|---|
| U1 | **Builder sob demanda** | builders 1,65 CPU (5 creeps, **0,33 cada**) + `builder.opportunistic` 0,70 | **0,6–1,2** | M | médio (reparo) | experimento + `experimentReport` (O2) |
| U2 | Upgrader por excedente (RCL<8) | upgraders 1,46 (5 creeps, 0,29 cada) | **0,3–0,7** | M | médio (velocidade de RCL) | `energyReport` (O1) |
| U3 | Haulers: menos viagens (CARRY boost) | 12 haulers, 3,9 CPU | **0,3–0,6** | L | médio | boosts (B3) |
| U4 | Fundir builder+upgrader onde cabe | por sala | **0,2–0,3** | M | médio | U1, U2 |

Teto realista da camada de unidades: **1–2,5**. A população já é quase mínima
(`needs.js`: miner 1/fonte, builder ≤ 1, upgrader 0–4, hauler 1 + fontes sem link).

### 2.3 Boosts (economia de energia + CPU indireto) — modelo revisado

**Correção (dono, 2026-10-15):** a versão anterior tratava o boost só como
velocidade. A documentação oficial descreve LH/GH (e seus tiers) como "+X% **sem
custo extra de energia**": o creep boostado faz mais trabalho **com a mesma
energia**. Isso é economia de recurso, não só de tempo. **Verificar no jogo antes de
implementar** (ver "Verificação" abaixo): o `energyLedger` do bot hoje assume que o
boost multiplica a energia gasta, o que contradiz a documentação.

Só em salas **com lab**: E1N45 (RCL6), E1N47 (RCL7), W7N49 (RCL8). As salas RCL3
(E5N41, E6N41) não têm lab e não podem boostar creeps. Custo por parte do corpo:
**30 composto + 20 energia**, dura a vida do creep (1500 ticks).

**Ações e energia por parte por tick** (docs.screeps.com): build 5 de progresso por 5
energia; repair 100 hits por 1 energia; upgrade 1 de progresso por 1 energia.

**Multiplicadores** (docs): upgrade GH +50% / GH2O +80% / **XGH2O +100%**;
build/repair LH +50% / LH2O +80% / **XLH2O +100%**; dismantle ZH/ZH2O/XZH2O +100/200/300%;
CARRY KH/KH2O/XKH2O +50/+100/+150 de capacidade por parte; harvest UO/UHO2/XUHO2
+200/400/600%.

**Valor de uma unidade de composto (energia constante, sala limitada por energia)
[D]:** uma parte boostada com multiplicador `m` rende `(m-1)` a mais de trabalho por
tick, sem gastar mais energia. Em 1500 ticks, por 30 unidades de composto:

| Ação | Energia/parte/tick | Progresso extra por parte-vida | Por unidade de composto (T1 / T2 / T3) |
|---|---:|---:|---|
| Upgrade | 1 | 1.500 x (m-1) | 25 / 40 / **50** progresso |
| Repair (hits = 100 por progresso) | 1 | 1.500 x (m-1) | 25 / 40 / **50** (x100 hits) |
| **Build** | **5** | 7.500 x (m-1) | **125 / 200 / 250** progresso |

(m = 1,5 / 1,8 / 2,0.) **Build vale 5x mais por unidade de composto**, porque cada
parte de build processa 5 por tick; mas só se beneficia quando há obra (duty baixo).

**Regra de break-even (dinâmica, seção 7):** boostar compensa quando
`preço líquido do composto <= progresso extra por unidade x valor de 1 de progresso`.
Valor de 1 de progresso = **preço da energia**: o que custaria produzir esse progresso
sem boost (a energia compra-se no mercado). **Preço lido: energia fairPrice 31,6 créditos**
(compra 29,3 / venda 33,5) [M], e não 1–5 como eu havia suposto.

**Pesquisa (2026-10-15, código do motor `screeps/engine`, `processor/intents/creeps/`):
confirmado.** Em `repair.js`, `repairCost = min(energia, ceil(repairEffect x REPAIR_COST))`
usa o efeito **sem boost**; em `build.js` e `upgrade-controller.js`,
`store.energy -= buildEffect` (base) enquanto `target.progress += boostedEffect`. O boost
soma progresso/hits, **nunca energia**. O `energyLedger` do bot estava errado (corrigido).

**Os preços flutuam (dono): a energia pode custar 20 ou 70, e os compostos também. Por
isso a conclusão correta não é "este boost compensa", e sim a regra abaixo, avaliada com os
preços do momento.**

Regra: boostar compensa quando **`E >= E*`**, onde `E` é o preço da energia agora e
`E* = custo líquido do composto por unidade / progresso extra por unidade`. `E*` é o
**preço mínimo da energia para o boost se pagar**; quanto menor, mais robusto.

Tabela de `E*` aos preços lidos em 21:52 (fair; `E` hoje = 31,6) e o que acontece se a
energia custar 20 ou 70 [D]:

| Composto | Uso | Progresso extra/unid. | `E*` (fair) | passa com E=20 | E=31,6 | E=70 |
|---|---|---:|---:|:---:|:---:|:---:|
| GH (T1) | upgrade | 25 | 43,1 | não | não | sim |
| GH2O (T2) | upgrade | 40 | 39,6 | não | não | sim |
| **XGH2O (T3)** | upgrade | 50 | **18,2** | sim | sim | sim |
| LH (T1) | repair | 25 | 23,0 | não | sim | sim |
| LH2O (T2) | repair | 40 | 22,2 | não | sim | sim |
| XLH2O (T3) | repair | 50 | 32,9 | não | não | sim |
| **LH (T1)** | **build** | 125 | **4,6** | sim | sim | sim |
| **LH2O (T2)** | **build** | 200 | **4,4** | sim | sim | sim |
| **XLH2O (T3)** | **build** | 250 | **6,6** | sim | sim | sim |

Leitura da sensibilidade: **build passa em qualquer cenário plausível de energia** (E* de 4–7
contra 20–70), por isso é o uso robusto; **repair/hardening e upgrade ficam sensíveis ao
preço** (E* de 18–43) e devem ser decididos dinamicamente, mudando de sim para não conforme a
energia e o composto flutuam. `E*` também sobe e desce com o preço do composto (se o XLH2O
cair a 1.000, o E* do repair cai de 32,9 para 20).

Leitura:

- **Build é o uso mais robusto** (5 energia por parte por tick): `E*` entre 4 e 7 em qualquer
  tier, **desde que haja obra** (duty). O produto que o bot já faz (XLH2O) serve.
- **Repair/hardening** está **na fronteira** (`E*` ~22–33): depende de a energia estar acima
  disso naquele momento; use o custo de oportunidade real (bid líquido de taxa).
- **Upgrade:** XGH2O tem o menor `E*` (18), GH/GH2O só passam com energia alta. O bot não
  produz XGH2O.
- **Custo de oportunidade correto:** quem usa o próprio estoque deixa de **vender ao preço
  de compra (bid)**, líquido de taxa: XLH2O ~1.200 x 0,95 = **~1.140**, não 1.644. Recalcule
  `E*` com isso (XLH2O: repair ~23, build ~4,6).
- **Mercado raso:** GH, GH2O e LH têm spread enorme (compra 346 / venda 1.995). Comprar custa
  o ask, não o fair; só vale com **produção própria**. Para estoque que **já temos**, vale o bid.
- O **duty cycle** multiplica o benefício: boost só rende nos ticks em que a parte age. Medir
  com o `energyReport` (energia por categoria por sala).

**Onde o ganho de energia é grande:** hardening de ramparts/paredes no RCL8 (repair
consome toda a sobra de energia: `energyLedger` já separa `repairRampart` e
`repairWall` por sala), upgrade nas salas com lab abaixo do RCL8, e obra pesada.
A medição que falta é **quanta energia cada sala gasta por categoria** (`energyReport`,
passo 1): `economia potencial = energia da categoria x (1 - 1/m)`.

**Verificação:** feita por pesquisa no código do motor (acima), sem precisar de teste em
jogo. Consequência para o código: `utils/energyLedger.js` passou a seguir a fórmula do
motor (energia base; repair = hits x 0,01); os valores de reparo no Grafana eram
superestimados (contavam 100 hits por parte como se fossem energia).

| Boost | Estado |
|---|---|
| B1 upgrade (GH/GH2O/XGH2O) | `E*` 18 (XGH2O) a 43 (GH): **depende do preço da energia no momento**; XGH2O não é produzido hoje |
| B2 build/repair com **XLH2O próprio** | **build `E*` 6,6 (robusto)**; repair `E*` 23–33 (decide dinamicamente): o boost mais promissor (produto já fabricado) |
| B3 CARRY (KH/KH2O) | por viagens |
| B4 harvest | sem ganho de CPU; ganho de energia só de spawn |

Lidos (21:52): energia 31,6; GH 1.078; GH2O 1.584; LH 576; LH2O 888; X 265; G 425; H 200,5;
L 158,7; O 33,3. Falta só o **duty** real de
build/repair/upgrade (`energyReport`).

### 2.4 Power e power creeps

Estado **[M]**: `Game.gpl` = nível **1**, progresso 400/3000; `marketPrice("power")`
fairPrice **2.332** créditos/un, venda corrente 2.430, **11.197 power à venda** (E1N45
8.692, E1N47 2.505).

Conta de GPL (custo cumulativo `1000 x N²`, confirmado por 400/3000) **[D]**:

| Meta | Power total | Falta | Energia (50/un) | Créditos que deixam de entrar (a 2.332) |
|---|---:|---:|---:|---:|
| GPL 2 | 4.000 | 2.600 | 130 mil | 6,1 M |
| **GPL 3** | 9.000 | **7.600** | **380 mil** | **17,7 M** |
| GPL 4 | 16.000 | 14.600 | 730 mil | 34,1 M |
| tudo (11.197) | 12.597 | 11.197 | 560 mil | **26,1 M** (sobra 3.597 = 8,4 M) |

Ritmo: o power spawn processa **1 power/tick**: 7.600 power = 7.600 ticks ≈ 8,7 h,
mas exige **50 energia/tick** = **metade da renda máxima do império** (~100/tick).
O bot só alimenta o power spawn com o excedente (`optionalConsumer`), que hoje é
pequeno (storages: E1N45 24 mil, W7N49 38 mil). A 10 energia/tick de excedente,
GPL 3 leva **~38 mil ticks ≈ 1,8 dia**.

O que cada GPL compra (1 GPL cria um creep nível 0 **ou** sobe 1 nível):

| GPL | Creep | O que ele pode ter |
|---|---|---|
| 1 (hoje) | já pode criar 1 power creep nível 0 | nenhum poder |
| 2 | nível 1 | 1 poder T1 |
| **3** | nível 2 | **2 poderes T1** (ex.: `GENERATE_OPS` + `OPERATE_LAB`) |
| 4 | nível 3 | + subir 1 poder a T2 (exige creep nível 2) |
| 11+ | nível 10 | `REGEN_SOURCE`, `OPERATE_POWER` (121 mil power: inviável sem power banks) |

Valor dos poderes úteis, com o **orçamento de ops** que T1 de `GENERATE_OPS` permite
(1 ops a cada 50 ticks = **20 ops por 1000 ticks**) **[D]**:

| Poder (T1) | Efeito | Ops | O que 20 ops/1000 ticks sustenta | Ganho [E] |
|---|---|---:|---|---|
| `OPERATE_LAB` | +2 de reação (base 5) em 1 lab, 1000 ticks | 10 | **2 labs** acelerados | ~ +40% em 2 labs ≈ **+10% de uma cadeia** de 10 labs |
| `OPERATE_EXTENSION` | enche 20% das extensions | 2 | ~10 usos por 1000 ticks | poupa viagens de spawn; ganho de CPU **pequeno** |
| `OPERATE_TERMINAL` | −10% energia/cooldown do terminal | 100 | **0,2 uso**: ops insuficientes | inviável no T1 |
| `OPERATE_FACTORY` | define o nível da fábrica | 100 | 0,2 uso: insuficiente | abre commodities nível 1+, que pedem depósitos que o bot não minera |

**Leitura (primeira versão, antes de ver os preços de produto):** com 1 power creep
em GPL 3, o ganho é **~+10% de uma cadeia de lab** e alguma economia de viagens,
contra **17,7 M de créditos** (ou 26 M) que deixam de entrar, **380 mil de energia** e
**+0,2–0,5 CPU** do próprio creep. Os poderes realmente fortes (`REGEN_SOURCE`,
`OPERATE_POWER`, `OPERATE_CONTROLLER`) exigem nível 10+ (100 mil+ de power).
**Não há ganho de CPU.** A reavaliação abaixo, com os preços de XLH2O, **muda o
valor econômico** (não o de CPU).

**Reavaliação com preços e tempo de reação [D, premissas marcadas]:**
`OPERATE_LAB` T1 dá **+2 unidades por reação** (base `LAB_REACTION_AMOUNT` = 5, **+40%**)
no lab operado, por 1000 ticks, a 10 ops. XLH2O tem tempo de reação ~**60 ticks**
(conferir `REACTION_TIME.XLH2O`), ou seja, 5/60 = 0,083 unid./tick por lab.

| Conta | Valor |
|---|---:|
| Produção extra por lab operado | 2/60 = 0,033 unid./tick = **~700 unid./dia** |
| Labs sustentados por `GENERATE_OPS` T1 (20 ops por 1000 ticks / 10 ops) | **2** |
| Produção extra | **~1.400 unid./dia** de XLH2O |
| Receita bruta a 1.644 | **~2,3 M créditos/dia** |
| Margem (descontar X + LH2O consumidos; preços ainda não lidos) | assumindo 40–60% de margem: **~0,9–1,4 M/dia** |
| Custo de GPL 3: créditos que deixam de entrar | **17,7 M** |
| Custo de GPL 3: energia consumida (380 mil x 31,6) | **12,0 M** (se for energia que se compraria; menos se for excedente) |
| **Custo total de GPL 3** | **~29,7 M** |
| **Retorno** | **~21–33 dias** (29,7 M / 0,9–1,4 M por dia), se a produção for limitada pela taxa de reação e o mercado absorver o extra; ~13–20 dias se a energia for excedente sem valor |

**Sensibilidade ao preço da energia (`E`) e à flutuação do power/XLH2O [D]:** o custo de GPL 3 é
`7.600 x preço do power` (créditos que deixam de entrar) + `380.000 x E` (energia):

| `E` | Energia (380 mil x E) | + power (7.600 x 2.332 = 17,7 M) | Retorno com 0,9–1,4 M/dia |
|---:|---:|---:|---|
| 20 | 7,6 M | **25,3 M** | ~18–28 dias |
| 31,6 | 12,0 M | **29,7 M** | ~21–33 dias |
| 70 | 26,6 M | **44,3 M** | ~32–49 dias |

O ganho diário também flutua (preço do XLH2O, margem sobre X e LH2O, demanda). **Decisão
dinâmica**: `power.reviewTicks` (ex. 1500) reavalia `payback_dias = custo restante / ganho
diário`; processa enquanto `payback_dias <= power.maxPaybackDays` (config do dono, ex. 30) e
**pausa** acima disso (energia disparou, power valorizou, XLH2O caiu), com histerese de 20%
para não oscilar. O custo restante usa só o power que **ainda falta** processar.

Duas condições decidem se isso vale: (a) a produção atual **ser limitada pela taxa
de reação**, e não pelo fornecimento de reagentes ou pelo transporte do hauler
(`state.wait` do `labPolicy` já separa `cooldown`/`input`/`ready`; falta uma
medição de utilização, **O4**); (b) a **demanda** (buy 20.859 un. a 1.200 hoje).
**Se (a) for falso, o ganho é ~0** e o retorno não existe.

Ops: `GENERATE_OPS` T1 gera 20 ops/1000 ticks = 456 créditos/1000 ticks a 22,8: o
valor do ops em si é desprezível; ele só importa como combustível.

**Decisão do dono: processar até GPL 3 (7.600 power) e reavaliar.** Manter os
3.597 power restantes (8,4 M) à venda ou guardados até a reavaliação. Ver P1.

### 2.5 Observabilidade e infraestrutura (habilitam o resto)

| # | Item | Para quê | Esforço |
|---|---|---|---|
| O1 | `energyReport` automático (renda, gasto por categoria, ritmo de RCL, por sala; `energyLedger` já existe) | decidir U2 e B1 com dado | S–M |
| O2 | `experimentReport` + **rollback automático** (builder sob demanda) | testar U1 sem o dono olhando a tela | M |
| O4 | **Utilização dos labs**: fração de ticks em que cada lab reage x espera por `cooldown`/`input`/transporte, por sala e por dia | decide se `OPERATE_LAB` tem retorno (condição (a) acima) | S–M |
| O5 | **Auditoria de taxas e listagens paradas** (regra 6 da seção 3b) | custo real das listagens; prazo/cancelamento automático | S–M |
| O3 | Remover spans temporários (`claims.reserve.*`, `fuel.plan.*`, `swing.scan.*`) quando L1/L2 fecharem | −0,05 CPU | S |

---

## 3. Roadmap ordenado (esforço x ganho x dependências)

Ordem de execução. Cada passo: spec em `specs/features/NNNN-nome/`, oráculo de
equivalência quando mexe em decisão, **um deploy por passo**, `cpuReport` depois.

| Passo | Item | Ganho | Esforço | Por que nesta posição |
|---:|---|---|---|---|
| 1 | **O1 `energyReport`** | habilita U2/B1 | S–M | barato, sem risco, destrava duas decisões |
| 2 | **O2 experimento do builder + rollback** (0148) e **U1** ligando 1 sala | **0,6–1,2 CPU** | M | maior ganho de CPU/esforço; o experimento limita o risco |
| 3 | **P1 decisão e preparo do power**: cancelar a listagem de power que vai ser processado, mover para o power spawn, política `power.sellOrProcess` | GPL | S | já é quase todo configuração; processa em segundo plano |
| 4 | **L1 `commitments`/`fuel.plan`** | **0,3–0,5** | M | número medido, causa isolada pelos spans |
| 5 | **L4 `intel`** | 0,2–0,3 | S–M | baixo risco, independente |
| 6 | **U2 upgrader por excedente** (com dado do passo 1) | 0,3–0,7 | M | depende de O1 |
| 7 | **L2 listings ociosas** (99% de repetição) | 0,3–0,4 | M–L | depende do oráculo; mexe em estado de ordens |
| 8 | **L5 hauler pickDeliver/pickLoad** | 0,3–0,5 | M | medir antes se é busca de caminho ou varredura |
| 9 | **L3 `labPolicy`** | 0,2–0,3 | M–L | estado complexo; fuzz do oráculo |
| 10 | **O4 utilização dos labs** | decide PC1 | S–M | barato; precisa de 1–2 dias de dados antes de PC1 |
| 11 | **PC1 power creep (GENERATE_OPS + OPERATE_LAB T1)** (0150) | **~0,9–1,4 M créditos/dia** [E, condicionado a O4]; +0,2–0,5 CPU | L | GPL 3 (P1) + O4 positivo |
| 12 | **B3 CARRY nos haulers** (KH2O) | 0,3–0,6 CPU | L | só se medir que viagens dominam; preço 154 |
| 13 | **B1/B2 boosts (upgrade, repair/build)** | **economia de energia, condicional** ao break-even da seção 2.3 (decisão dinâmica por `E >= E*`: build robusto, repair e upgrade sensíveis ao preço da energia) | L | depende de O1 (`energyReport`), da verificação do custo de energia e do preço da energia |
| 14 | O5 auditoria de taxas/listagens paradas; O3, L6, L7 limpezas e picos | segurança | S–M | no fim, junto do fechamento da 0147 |

**Teto acumulado de CPU** (passos 2, 4–9, 12): **~2,7–4,7** CPU/tick sobre os
15,97 de hoje, ou seja **~11,3–13,3**. Passar de 15 já nos passos 2 + 4 + 5.
**< 10 não é alcançável sem reduzir funcionalidade.**

### Dependências

```
O1 energyReport ──> U2 upgrader
O2 experimento ──> U1 builder
P1 power ──> (GPL 3) ──┐
O4 utilização dos labs ─┴──> PC1 power creep (OPERATE_LAB)
B3 CARRY ──> (infra de boost) ; B1/B2 só com preço baixo
L1, L4, L2, L3, L5: independentes entre si; L2/L3 exigem o oráculo (0145)
```

---

## 3b. Regra de mercado (dono, obrigatória em todos os passos)

**Toda decisão de compra considera comprar de ordens já existentes. Todas as taxas são
sempre consideradas.** O risco de pagar a taxa de uma ordem e deixá-la parada indefinidamente
é maior que o de qualquer ganho marginal.

**Compras**

1. **Só `deal` em ordens existentes.** Nunca criar ordem de compra (nem como "resto" quando o
   livro acaba). Usar `terminalOps.buy(..., createListing=false, ...)`; é o padrão desde
   2026-09-29 (`terminalBuy` / `terminalSell`), e `marketOnly`/`createListing` já existem em
   `terminalOps.js`. Sem liquidez ao preço aceitável: **não comprar** (manter o estado, p. ex.
   não boostar, não iniciar a cadeia).
2. **Preço de decisão = preço executável**, não o `fairPrice`: o ask real do livro **na quantidade
   necessária** (profundidade), já somado ao frete. O `fairPrice` serve de referência/suavização,
   não de preço de compra (GH: ask 1.995 contra fair 1.078).
3. **Custo total de aquisição** = `preço x quantidade + calcTransactionCost(qtd, sala, sala da
   ordem) x preço da energia` (+ taxas já gastas que não se recuperam). Já implementado em
   `utils/purchaseCost.js` (`evaluate`: frete, `sunk`, `maxBuyFreightShare`); reutilizar, não
   reescrever.
4. Compra parcial é aceitável só se o resto **não vira ordem**: aborta ou ajusta a quantidade.

**Vendas** (quando necessárias)

5. Preferir **`deal` em ordens de compra existentes** (bid, sem taxa de listagem; paga só o
   frete). **Listar só se** o valor esperado superar o risco: taxa de listagem **5% do valor da
   ordem, não reembolsável** (nem ao cancelar) + custo de a ordem ficar parada. Exemplo, power:
   listar 3.597 unidades a ~2.430 custa **~437 mil de taxa** na criação, enquanto o bid de hoje
   absorve 1.750 unidades sem taxa.
6. Nova ordem de venda precisa de **prazo e teto**: idade máxima, preço revisto e cancelamento
   automático; nada fica "indefinidamente vendendo".

**Exemplo vivo de preço executável (log de 2026-10-15 22:45):** ordens de **energia** em W14N53 a 9,5 créditos
(`fairPrice` 31,6), mas o frete come 30–100% do lote: `efetivo` 16–62 contra `máximo` 16–42, e várias compras foram
recusadas por `effective-price-limit`. O preço da energia que entra nas contas de break-even é o **efetivo executável**,
não o fair nem o ask nu.

**Checklist de taxas e custos (sempre na conta)**

| Item | Valor | Observação |
|---|---|---|
| Taxa de criar ordem | 5% de `preço x quantidade` | perdida ao cancelar |
| Extensão de ordem | 5% da quantidade acrescentada | |
| Mudança de preço | 5% de `(alta de preço) x restante` | queda não paga |
| Frete do `deal`/`send` | `calcTransactionCost` em **energia** x preço da energia | depende da distância |
| Processar power | **50 energia por power** | |
| Boost | **20 energia + 30 composto por parte** | |
| Taxas afundadas | `cancelledListingFees`, `orderFeesRemaining` | contabilizadas em `marketAccounting` |

**Como aplicar a cada frente:** boost (comprar composto só em ordens existentes, usando o ask na
quantidade necessária; sem liquidez, o creep sai sem boost), power (excedente vendido em bids
existentes ou mantido; **cancelar a listagem de power** que vai ser processado já é o passo P1),
power creep (sem compras previstas), população/CPU (sem mercado). **Decisões dinâmicas usam preço
executável + todas as taxas, e gravam o que usaram.**

**Proposta de revisão das listagens existentes: spec 0153** (listar só se competitiva, prazo em tempo real, limpeza, orçamento de taxa). `ordersAudit()` já existe no código (O5) e dá os dados para priorizar.

**Novo passo O5: auditoria de taxas e listagens paradas.** Relatório automático das ordens
próprias: taxa paga (afundada) por recurso, idade, quantidade restante e preço contra o mercado.
Hoje há ~83 ordens próprias para 14 listagens ativas (cpuAuditOrders), muitas esgotadas
(`remaining 0`). Serve para medir o custo real das listagens existentes e decidir um prazo/cancelamento
automático (item 6).

---

### Mapa de passos para specs (todas com spec, plan e tasks)

| Passo(s) | Spec |
|---|---|
| O1 `energyReport`, O2 experimentos | `0154-energy-report-experiments` |
| O4 utilização dos labs | `0155-lab-utilization` |
| U1, U2, U4 população sob demanda | `0148-on-demand-population` |
| P1 power até GPL 3 (dinâmico), PC1 power creep | `0150-power-creeps` |
| B1–B3 boosts (decisão dinâmica) | `0149-lab-boosts` |
| O5 auditoria e revisão das listagens | `0153-listing-policy-review` |
| L2, L3, L4, L6, L7, O3 | `0156-cpu-logic-remaining` |
| L1, L5, L8 e a régua (feitos) | `0145`, `0146`, `0147`, `0152` |

**Passagem completa (estado, defaults a validar, ordem, regras, pontos em aberto):**
`docs/handoff-agente-2026-10-15.md`.

## 4. Para o agente implementador

Leia, nesta ordem: `CLAUDE.md`, `specs/constitution.md`, `specs/README.md`,
`specs/ARCHITECTURE.md`, as specs 0145–0150 e **este documento**. Linear: projeto
`ScreepsMuszbot` (ARK-128 segue In Progress). Conversa com o dono em português.

**Régua de medição (já no bundle):**

- `cpuReport(n=150)` arma um relatório único; imprime sozinho com `warm` (sem o tick frio), resíduo, spans e a linha `[probe]`. **Cada deploy reinicia o global**: não publique enquanto uma medição está armada.
- Compare janelas pelo **`warm` e pelos spans**, não por uma janela isolada: a carga varia ±0,4 entre janelas de 150 intervalos.
- `cpuAuditMemory()`, `cpuAuditRoomFields()`, `claimsSpans(false)`.
- **Validação de ganhos pequenos:** sem A/B (removido em 2026-10-15). Uma mudança por deploy, atrás de flag desligável sem deploy; comparar o `cpuReport` automático (spans-alvo e `warm`) com o anterior; a carga varia ±0,4 no total, o sinal confiável são os spans.
- L8 (feito, publicado, validado pelo dono): hauler ocioso busca ao ficar ocioso e depois a cada 5 ticks, builder idem, entrega em trânsito mantém o alvo (0152); spans-alvo caíram ~1,9 CPU.
- Oráculo: `test/equivalence/compare.js`; `src/utils/shadowBudget.js` (sombra live opcional, com teto de CPU).

**Regras que valem para todo passo:**

- **Mercado (seção 3b): compras só em ordens existentes, nunca criar ordem de compra; todas as taxas e fretes na conta; preço de decisão = preço executável na quantidade.**
- **Nunca cachear estado quente por tempo.** Cache só por assinatura das entradas, com invalidação por mudança; teste com mutação entre ticks.
- Sempre que mexer em decisão: referência intocada em `test/` + mundos com 3/5/10 salas e 3/6/10 labs.
- `npx grunt` **publica no servidor** (copia para o cliente). Um deploy por passo.
- `node test/smoke.js "$(pwd)"` com caminho absoluto; `graphify update .` ao fim.
- **Windows:** heredocs longos no Bash falham; escreva arquivos com a ferramenta de escrita.
- Spans/diagnósticos temporários devem sair quando o passo fechar (O3).

**Armadilhas conhecidas:**

- `Game.market.orders` é mutado no mesmo tick pelos testes (cancelOrder): não indexar ordens próprias entre chamadas.
- `craftLedger.migrateOwners`, `reconcileLegacy`, `terminalOrderRetry` ficam: também são recuperação pós-reset.
- Operações finais (`buy:completed`) são retidas por cadeias ativas por contabilidade; não são lixo.
- `terminalFuel.plan` é chamado várias vezes por tick; o hauler muda `loadedAmount` no meio do tick, então memo por tick é inseguro sem versão das operações.

---

## 5. Decisões do dono (estado)

| Decisão | Estado |
|---|---|
| Camada de lógica e de unidades, nessa ordem | **decidido** |
| Processar power para GPL | **dono é a favor**; proposta: até GPL 3 e reavaliar (custo: 17,7 M de créditos e 380 mil de energia) |
| Builder sob demanda via experimento com rollback | **dono concorda** |
| Upgraders extras em RCL<8 | decidir **depois** do `energyReport` (energia limita, não o nº de creeps) |
| Boosts | **reavaliados**: o boost economiza energia ("sem custo extra" nos docs), o que muda a conta; decisão pelo **break-even dinâmico** (seção 2.3/7) e pela verificação em jogo; T3 a preço de mercado não compensa, T1/T2 e produção própria podem |
| Power creep | prioridade **alta se O4 confirmar** que a taxa de reação limita a produção |

## 6. Comandos para completar os números

Já lidos (18:26): `XGH2O` 911, `XLH2O` 1.644, `KH2O` 154, `ops` 22,8, `power` 2.332,
`Game.gpl` = nível 1, 400/3000. Faltam:

```
marketPrice("X")   marketPrice("LH2O")   marketPrice("GH")   marketPrice("GH2O")
marketPrice("LH")  marketPrice("KH")
REACTION_TIME.XLH2O      // tempo de reação real
```
E: power atualmente no storage/power spawn (para a conta de "falta"); produção
de XLH2O por dia por sala (Grafana) para comparar com a conta do `OPERATE_LAB`.

## 7. Pré-calculado x dinâmico (CPU baixo)

Princípio: **tudo que depende só de constantes ou de estrutura vira tabela
estática (heap, calculada uma vez por global); só o que depende de preço de
mercado é recalculado, e raramente**, usando o `market.snapshot()` que já existe
em cache (sem nova chamada ao mercado).

| Cálculo | Depende de | Onde | Quando recalcular | Custo |
|---|---|---|---|---|
| Custo de GPL por nível, power por nível | constantes (`1000 x N²`) | tabela estática | nunca | 0 |
| Poderes, ops, requisitos de nível | `POWER_INFO` (constante) | lido ao vivo, em cache no heap | 1x por global | 0 |
| Tempo de reação, produção/dia por lab | `REACTION_TIME`, `LAB_REACTION_AMOUNT` | tabela no heap | 1x por global | 0 |
| Partes por corpo, custo de composto por vida | corpo do creep (já conhecido no spawn) | no spawn | 1x por creep (a cada ~1500 ticks) | ~0 |
| **Vale boostar? / vale processar power? / vale operar este lab?** | **fairPrice** de compostos, power, reagentes | função `worth(...)` com `market.snapshot()` | **no spawn** (boost) ou **a cada N ticks** (power: `power.reviewTicks`, ex. 1500) | O(1), < 0,01 CPU/avaliação |
| Margem de XLH2O (preço - X - LH2O) | fairPrice de 3 recursos | idem | a cada `power.reviewTicks` | O(1) |

Regras: nunca ler `getAllOrders` para isso (o snapshot já tem o fairPrice); limiares
em `Memory.settings` (`boost.minMarginRatio`, `power.sellOrProcess`,
`power.reviewTicks`); decisão gravada com o preço usado, para auditoria; uma
reavaliação **nunca cancela um trabalho em andamento** (só vale para o próximo).

**Volatilidade de preços (regra geral do plano):** nenhuma decisão econômica é gravada
como conclusão; todas são funções do preço do momento.

- **Referência** = `fairPrice` suavizado do `market.snapshot()` (janela e confiança). **Para comprar,**
  o preço de decisão é o **preço executável** (ask do livro na quantidade necessária, mais todas as
  taxas e fretes, seção 3b); o fair nunca é preço de compra num mercado raso (GH: compra 346 / venda 1.995).
- **Custo de oportunidade do estoque próprio = bid líquido de taxa**; custo de **compra** = ask.
- **Histerese e cadência:** mudar de estado só se a razão cruzar o limiar por mais de ~20% e
  reavaliar a cada `N` ticks (boost: no spawn; power: `power.reviewTicks`); evita oscilar com ruído.
- **Guarda de dados:** com `confidence` insuficiente ou preço ausente, **manter o estado anterior**
  (não boostar, não iniciar processamento novo) em vez de decidir às cegas.
- Toda decisão grava os preços que usou (auditoria) e **nunca cancela trabalho em andamento**.
- Custo de CPU: O(1) por avaliação, a partir do snapshot em cache (sem nova leitura de mercado).

## 8. Premissas assumidas (sem resposta do dono) e perguntas abertas

Premissas que usei para seguir sozinho:

1. Cada sala tem 2 fontes (renda máxima ~100 energia/tick no império). A energia vale **31,6** créditos no mercado (lido); em salas com excedente o valor-sombra é menor.
2. XLH2O leva ~60 ticks por reação (conferir `REACTION_TIME`).
3. `OPERATE_LAB` consome também mais reagente na mesma proporção; o ganho líquido é a margem, não a receita bruta.
4. O mercado absorve ~1.400 unid./dia de XLH2O extra (buy 20.859 às 18:26). **Às 22:56 o bot registrou "nenhuma ordem no mercado" para XLH2O** (905 unidades prontas, piso 870): a demanda é volátil e virou gate do power creep (spec 0150).
5. Os 11.197 power à venda continuam sendo do bot e podem ser movidos para o power spawn de W7N49.

Perguntas abertas para o dono (não bloqueiam os passos 1–9):

- Qual sala do experimento do builder (sugestão: a de menor risco, E5N41 ou E6N41, RCL3)?
- Criar issues no Linear (Backlog) para os 14 passos?
