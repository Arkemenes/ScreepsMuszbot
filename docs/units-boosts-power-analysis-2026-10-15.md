# Camada de unidades, boosts e power creeps — levantamento (2026-10-15)

> **Superado em parte por** [roadmap-otimizacao-e-capacidades-2026-10-15.md](roadmap-otimizacao-e-capacidades-2026-10-15.md), que traz a avaliação com números e a ordem de execução. As mecânicas (seção 7) continuam valendo.

Escrito para: o dono do projeto, decidir o que vale fazer. Nada aqui foi
implementado. Números de jogo (multiplicadores, custos) vêm de memória das
constantes do Screeps e **devem ser conferidos em `BOOSTS`/`POWER_INFO` antes
de qualquer plano** — o bot já lê `BOOSTS` ao vivo em `combat.js` e
`energyLedger.js`, então a conferência é barata.

## 1. De onde vem o CPU dos creeps hoje

`cpuTop` (janelas de 150 intervalos, 2026-10-15), 34 creeps, ~8,7–9,9 CPU/tick:

| Role | CPU/tick | Chamadas/tick | Por creep |
|---|---:|---:|---:|
| hauler | 3,1–4,5 | 12 | 0,26–0,38 |
| miner | 1,7–2,5 | 10–14 | ~0,2 |
| builder | 1,7–1,9 | 5 | **~0,35** |
| upgrader | 1,1–1,4 | 5 | ~0,25 |

Cada ação do jogo custa ~0,2 CPU (move, harvest, upgrade, transfer, build,
repair). A lógica própria é pequena perto disso. Reduzir CPU de creep = reduzir
ações por tick ou o número de creeps ativos.

## 2. A população já é quase mínima

`rooms/needs.js` e `utils/population.js`:

- **miner:** 1 por fonte (piso físico), 3 na sala com mineral.
- **hauler:** `1 + fontes sem link` com rede de links; sem link, até 5; piso de 2
  com operação de mineral.
- **upgrader:** 0 no RCL8 (1 só se o timer de downgrade cair a 50%), 1 a 4 conforme
  energia em storage.
- **builder:** `min(backlog, energia, 1)` = **no máximo 1 por sala, sempre 1** quando
  há energia (“keep one around for repairs”).
- **Corpos:** `scaledBody` já repete a unidade até a capacidade da sala ou 50 partes.

Conclusão: “corpos maiores” já existe; “menos creeps” tem pouca folga por
política atual: ~30 creeps em 5 salas ≈ 6 por sala. O que sobra:

| Alavanca | Onde | CPU esperado | Natureza |
|---|---|---:|---|
| Builder **sob demanda** (não manter 1 vivo por reparo) | 5 builders | ~0,6–1,4 | política; tower/repair cobre? |
| Upgrader só com excedente, nas salas RCL3 | até 4 upgraders | ~0,3–0,8 | política de crescimento |
| Menos moves/ações do hauler (rotas e paradas) | 12 haulers | ~0,3–0,6 | lógica + trajeto |
| Fundir builder+upgrader onde cabe | por sala | ~0,3 | política |

Estimativa total desta camada: **1–2,5 CPU**, não 7. Com a camada de lógica
restante (0,5–1,0), o alcançável fica em **~13,5–15,5 CPU/tick**. A meta
“< 15” é plausível; “< 10” não é realista sem reduzir salas ou funcionalidade.

## 3. Boosts de lab

Mecânica: cada parte do corpo boostada custa `30 mineral + 20 energy` (um boost
dura a vida do creep, 1500 ticks). Multiplicadores (conferir em `BOOSTS`):

| Parte | Ação | T1 / T2 / T3 |
|---|---|---|
| WORK | harvest | UO / UHO2 / XUHO2 |
| WORK | build/repair | LH / LH2O / **XLH2O** (+50/80/100%) |
| WORK | dismantle | ZH / ZH2O / XZH2O |
| WORK | upgradeController | GH / GH2O / XGH2O (+50/80/100%) |
| CARRY | capacidade | KH / KH2O / XKH2O (×2/×3/×4?) |
| MOVE | fadiga | ZO / ZHO2 / XZHO2 |

Estado do bot: tem `boostCreep()` manual no console e `labBoostReservations`
(os labs reservados saem da política de produção), mas **nenhum fluxo
automático**. As cadeias de XLH2O já produzem o composto de boost de
build/repair, hoje **vendido**.

**O que boost faz pelo CPU (corrigido após revisão do dono):** indiretamente,
sim. Um creep mais eficiente permite **menos creeps** ou **menos ações por unidade
de trabalho**, e cada ação custa ~0,2 CPU. Duas ressalvas específicas deste bot:
(1) boost só se aplica em salas **com lab** (E1N45, E1N47, W7N49); as salas
RCL3 (E5N41, E6N41) não têm lab, então não há como boostar creeps lá;
(2) a população já está perto do piso (1 builder, 1–4 upgraders, haulers por
fonte/link), então o ganho de CPU vem de **crescer mais rápido sem criar mais
creeps** (um upgrader com XGH2O vale ~2 sem boost) e de **menos viagens do hauler**
(CARRY dobra/triplica a carga por viagem), não de cortar a população.

**Valor real:** economia e velocidade de crescimento, não CPU. Candidatos por
custo/benefício:

1. **XLH2O nos builders** (o composto já é produzido): obra e reparo 2× mais
   rápidos; custo 20 partes WORK × 30 = 600 minerais por vida.
2. **Upgrader com GH/XGH2O** nas salas abaixo do RCL8: GCL mais rápido.
3. **CARRY nos haulers**: só depois de medir se as viagens dominam as ações.

Custo de implementação: fluxo de reserva de labs, abastecimento do composto,
boost no spawn (creep passa por um lab antes de trabalhar), fallback sem composto.

## 4. Power creeps

Mecânica: GPL (Global Power Level) sobe processando power no `powerSpawn`
(o bot já o faz: `structures/powerSpawn.js`, `processPower` quando há power).
O custo cumulativo do nível N é `1000 × N²` de power. Um power creep ocupa
níveis de GPL, vive 5000 ticks e precisa renovar num power spawn/banco. Poderes
úteis: `OPERATE_SPAWN`, `OPERATE_LAB`, `OPERATE_FACTORY`, `OPERATE_STORAGE`,
`OPERATE_TOWER`, `REGEN_SOURCE`, `REGEN_MINERAL`, `GENERATE_OPS`.

Estado do bot: **nenhuma lógica de PowerCreep**. Observação do estado live
(2026-10-15): há ~11,2 mil de power **à venda** no mercado (E1N45 8.692, E1N47
2.505). Isso equivale a ~GPL 3 se processado (9.000 para o nível 3). Hoje o
bot vende o que poderia virar GPL.

**O que power creep faz pelo CPU:** **aumenta**: é mais um creep que roda
lógica todo tick (e precisa de renovação). Pelo ganho econômico: `REGEN_SOURCE`
(+energia por fonte), `OPERATE_LAB` (reações mais rápidas), `OPERATE_SPAWN`
(spawn mais rápido). Valor de economia, não de CPU.

Decisão de política que depende de você: **vender power ou processar para GPL**.

## 5. Recomendação

Para o objetivo de **CPU**: boosts e power creeps não valem; a camada de
unidades que vale é **população sob demanda** (spec 0148). Para **economia/
crescimento**: boosts T3 já produzidos (XLH2O) e GPL/power creeps são
candidatos, com spec própria cada (0149 boosts, 0150 power creeps), depois que
a CPU estiver sob controle.

Ordem sugerida:

1. 0148 — população sob demanda (CPU, risco de política: precisa da sua revisão).
2. Lógica restante (hauler/claims), com oráculo de equivalência.
3. 0149 — boosts (XLH2O nos builders primeiro).
4. 0150 — power: primeiro a decisão “processar vs. vender”.

## 6. Perguntas para você

- A política “sempre 1 builder por sala para reparo” é requisito, ou o tower/
  repair sob demanda cobre? (muda ~1 CPU)
- Nas salas RCL3, o upgrader é necessário o tempo todo, ou só quando há
  excedente de energia?
- Power: vender ou processar para GPL? Qual a prioridade de GPL vs. dinheiro?

## 7. Mecânicas, em detalhe (fontes: docs.screeps.com/power.html e /resources.html)

### 7.1 Boosts: a tabela completa

Um boost é aplicado por parte do corpo, **uma vez, na vida do creep** (1500
ticks), num lab com o composto e energia: custo de **30 mineral + 20 energia por
parte**. Cada parte aceita um tipo.

| Parte / ação | T1 | T2 | T3 |
|---|---|---|---|
| WORK **upgradeController** | GH +50% | GH2O +80% | **XGH2O +100%** |
| WORK **build / repair** | LH +50% | LH2O +80% | **XLH2O +100%** |
| WORK **harvest** | UO +200% | UHO2 +400% | XUHO2 +600% |
| WORK dismantle | ZH +100% | ZH2O +200% | XZH2O +300% |
| CARRY capacidade | KH +50 | KH2O +100 | XKH2O +150 (por parte: 50 -> 200) |
| MOVE fadiga | ZO +100% | ZHO2 +200% | XZHO2 +300% |
| ATTACK / RANGED / HEAL | UH, KO, LO ... | | até +300% |
| TOUGH dano recebido | GO -30% | GHO2 -50% | XGHO2 -70% |

O que compensa **aqui**: upgrade (GH/XGH2O) e build/repair (LH/XLH2O, composto que
o bot já produz) nas 3 salas com lab; CARRY (KH2O/XKH2O) nos haulers das salas
com lab quando as viagens dominarem. Harvest boost reduz o corpo do miner, não o
número de miners nem as ações; combate fica fora.

Valor de uma vida de upgrader com XGH2O (15 WORK): 450 minerais + 300 energia,
em troca de ~15 ticks-WORK extras por tick durante 1500 ticks, o equivalente a um
segundo upgrader (~0,25 CPU/tick e ~um corpo inteiro de energia de spawn).

### 7.2 GPL e power creeps

1. **Power** vem de power banks (estruturas de salas neutras; exigem combate com
   healers) ou do mercado.
2. O **power spawn** (RCL8) processa **1 power + 50 energia** por unidade e soma
   **1 ponto de GPL**. O custo real é a **energia: 50 por power**.
3. GPL sobe por nível; o custo de cada nível cresce. Confirme os números ao vivo
   com `JSON.stringify(Game.gpl)` (nível, progresso, total do nível) e
   `POWER_INFO` no console. (A fórmula `1000 x N^2` acumulado é a que conheço,
   mas a página oficial não a lista: não confie nela sem conferir.)
4. **1 GPL livre cria um power creep nível 0 ou sobe um nível.** Classe usável:
   **Operator** (Commander e Executor "em desenvolvimento"). Vida: 5000 ticks,
   renova gratuito e instantâneo num power spawn / power bank. Morrer = 8 h de
   espera para respawn. Excluir leva 24 h e custa 1 GPL.
5. Cada nível do creep dá um poder novo ou melhora um existente. O nível exigido
   por poder é a coluna "Lvl" (tier 1..5 = níveis 0/2/7/14/22). Usar poder gasta
   **ops** (recurso gerado por `GENERATE_OPS`, 1/2/4/6/8 a cada 50 ticks).
   Os poderes só funcionam em salas habilitadas (`PowerCreep.enableRoom`).

Poderes que importam a este bot (do nível 0/1, ou seja, **GPL baixo basta**):

| Poder | Efeito (T1 -> T5) | Ops | Valor aqui |
|---|---|---:|---|
| GENERATE_OPS | 1/2/4/6/8 ops por 50 ticks | 0 | pré-requisito dos outros |
| OPERATE_LAB | reação **+2/4/6/8/10** por ciclo (base 5) | 10 | até +40% de produção por lab no T1, +200% no T5: acelera XLH2O |
| OPERATE_EXTENSION | enche 20..100% das extensions do storage/terminal | 2 | menos viagens do hauler ao spawn; reduz ações |
| OPERATE_SPAWN | tempo de spawn -10..-80% | 100 | baixo (spawns ociosos) |
| OPERATE_TERMINAL | energia e cooldown -10..-50% | 100 | o bot opera muito no terminal |
| OPERATE_FACTORY | define o nível da fábrica (permanente) | 100 | abre produção de commodities mais altas |
| OPERATE_STORAGE | capacidade +500K..+7M | 100 | baixo hoje |

Poderes de **nível 10+** (exigem 10 GPL): `REGEN_SOURCE` (+50..250 energia por 15
ticks por fonte) e `OPERATE_POWER`; nível 20+: `OPERATE_CONTROLLER`. Caros em GPL.

**CPU de um power creep:** soma ao script (~0,2–0,5/tick com lógica de poder,
renovação e movimento). Compensa só se o ganho de economia for relevante.

### 7.3 O custo real de "processar para GPL"

11,2 mil de power processados = **~560 mil de energia** (50 por power) e, a 1 power
por tick sem OPERATE_POWER, ~11 mil ticks de power spawn. Para comparar com
**vender**: `marketPrice("power")` no console dá o preço; some o dinheiro de 11,2 mil
de power contra o uso alternativo de 560 mil de energia (que é boa parte da renda
de uma sala RCL8). **Não é uma decisão óbvia a favor de processar.**

### 7.4 Velocidade de RCL e quantidade de upgraders

Energia para subir de RCL (CONTROLLER_LEVELS): RCL2 45 mil, RCL3 135 mil,
RCL4 405 mil... Uma sala com 2 fontes rende no máximo **20 energia/tick**: mesmo
com 100% indo ao controller, RCL3->RCL4 leva ~6.750 ticks. **Mais upgraders só
aceleram se houver energia sobrando** (container cheio, storage crescendo). Nas
salas com storage em 0 (E5N41, E6N41) a velocidade é limitada pela **renda**, não
pelo número de upgraders. O que decide é para onde a energia vai (spawn,
reparo, torres, transferência para outras salas, upgrade): o bot tem um
`energyLedger` por sala que permite medir isso (ver spec 0148).
