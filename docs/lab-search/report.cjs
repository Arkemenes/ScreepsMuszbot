"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { order, rawStock } = require("./recipes.cjs");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../lab-search-results.json"), "utf8"));
if (data.quick || data.rows.length !== 1950) throw new Error("The report requires the complete 1950-scenario matrix");
const rows = data.rows, proven = rows.filter((r) => r.exact && r.exact.reason === "optimal-proved");
const truncated = rows.filter((r) => r.exact && r.exact.reason !== "optimal-proved");
const tally = {};
const unavailable = rows.filter((r) => r.unavailableReferences && r.unavailableReferences.length);
rows.forEach((r) => { tally[r.winner.family] = (tally[r.winner.family] || 0) + 1; });
const num = (n) => n == null ? "—" : n.toLocaleString("pt-BR");
const at = (p, rcl, qty, b = null, d = 0) => rows.find((r) => r.product === p && r.rcl === rcl && r.qty === qty && r.bandwidth === b && r.delay === d);
function lowerBound(r) {
    const steps = order(r.product), maxCooldown = Math.max(...steps.map((p) => data.recipes[p].cooldown));
    const work = steps.reduce((sum, p) => sum + r.qty / 5 * data.recipes[p].cooldown, 0);
    const cooldownBound = Math.max(1, Math.ceil(work / r.built.length) - maxCooldown + 1);
    const minimumMovement = Object.values(rawStock(r.product, r.qty)).reduce((sum, n) => sum + n, r.qty);
    return Math.max(cooldownBound, r.bandwidth == null ? 0 : Math.ceil(minimumMovement / r.bandwidth));
}
const text = ["# Comparação ampliada de labs — ARK-99", "", "Data: 2026-10-11. Pesquisa offline; runtime e configurações do jogo preservados.", "",
    "## Resultado", "",
    "A regra de dois labs de entrada e todas as demais saídas é uma referência forte, mas não resolve todos os cenários. Reutilizar labs em cooldown como entradas e escolher novas saídas pode melhorar RCL6/7; pipelines parciais e buffers locais podem compensar transporte limitado. A estratégia deve minimizar tempo até o lote final, incluindo logística e trocas.", "",
    `Matriz completa: **${num(rows.length)} cenários**, dez compostos, três RCLs, cinco lotes e treze regimes de logística. Foram reexecutados ${num(rows.reduce((n, r) => n + r.search.evaluated, 0))} candidatos/referências; não são todos os escalonamentos possíveis.`, "",
    `Vencedores por classe: ${Object.entries(tally).map(([k, n]) => `${k}=${num(n)}`).join(", ")}. Classes identificam a origem do plano: híbrido inclui reutilização adaptativa, pipelines parciais e referências modificadas. Empates são resolvidos por movimento, trocas e identificador determinístico.`, "",
    `Referências indisponíveis: ${num(unavailable.length)} cenários de XGH2O/XGHO2 não têm plano de ondas: o planejador existente retorna \`no-phase-plan\` nos três RCLs. O modo largo está presente em todos os cenários. A melhor referência usa apenas planos disponíveis; ausência de ondas não significa derrota simulada.`, "",
    "## Lotes de 3.000, transporte instantâneo", "",
    "Tempo da melhor referência → melhor candidato, em ticks. Referências incluem ondas, largo e o pipeline completo conhecido quando aplicável.", "",
    "| Produto | RCL6: 3 labs | RCL7: 6 labs | RCL8: 10 labs |",
    "|---|---:|---:|---:|"];
for (const p of data.products) text.push(`| ${p} | ${[6, 7, 8].map((rcl) => { const r = at(p, rcl, 3000); return `${num(r.bestReferenceTicks)} → **${num(r.winner.ticks)}** (${r.winner.name})`; }).join(" | ")} |`);
text.push("", "## Limites inferiores: quanto ainda poderia melhorar", "",
    "Além da busca, há um limite válido para qualquer escalonamento deste modelo: `ceil(W/N) - maxCooldown + 1`, em que W é a soma de trabalho em cooldown de todas as reações e N o número de labs. Os intervalos de cooldown de cada lab não se sobrepõem; só suas caudas após a conclusão podem ficar fora do tempo medido. Esse limite permite labs em cooldown como entradas e mudanças arbitrárias de papel.", "",
    "Com transporte finito, também vale `ceil((matérias-primas + produto final)/B)`. É um limite otimista, não um cronograma executável, e não inclui viagens ou barreiras. A diferença entre melhor resultado e limite inferior é um teto para a melhoria ainda possível, não prova de que ela existe.", "",
    "| XLH2O, lote 3.000 | Limite inferior | Melhor encontrado | Melhoria restante, no máximo |",
    "|---|---:|---:|---:|");
for (const rcl of [6, 7, 8]) {
    const r = at("XLH2O", rcl, 3000), bound = lowerBound(r);
    if (r.winner.ticks < bound) throw new Error("Physical schedule violates the independent lower bound");
    text.push(`| RCL${rcl}, logística instantânea | ${num(bound)} | ${num(r.winner.ticks)} | ${num(r.winner.ticks - bound)} ticks |`);
}
for (const r of rows) if (r.winner.ticks < lowerBound(r)) throw new Error("Lower-bound violation: " + r.id);
text.push("", "## XLH2O em RCL8: transporte e troca", "",
    "B é o limite agregado de unidades carregadas/drenadas por tick nas interfaces dos labs. D é o atraso por lab ao mudar de papel, após dreno; mudanças podem ocorrer em paralelo. Não são tempos de viagem de creeps.", "",
    "| B | D | Referência: ticks | Vencedor: ticks | Plano | Movimento | Pico de labs em dupla função |",
    "|---:|---:|---:|---:|---|---:|---:|");
for (const b of [null, 2, 4, 8, 16]) for (const d of b === null ? [0] : [0, 50, 200]) {
    const r = at("XLH2O", 8, 3000, b, d);
    text.push(`| ${b == null ? "∞" : b} | ${d} | ${num(r.bestReferenceTicks)} | **${num(r.winner.ticks)}** | ${r.winner.name} | ${num(r.winner.movement)} | ${r.winner.peakDualRoleLabs} |`);
}
text.push("", "## Comparação por produto, RCL e lote", "",
    "Estas tabelas usam logística instantânea. Todos os 1.800 cenários de logística limitada estão no CSV, junto das 150 referências de logística instantânea.");
for (const p of data.products) {
    text.push("", `### ${p}`, "", "| RCL | Lote | Referência: ticks | Melhor: ticks | Plano |", "|---:|---:|---:|---:|---|");
    for (const rcl of [6, 7, 8]) for (const qty of [5, 20, 100, 500, 3000]) {
        const r = at(p, rcl, qty);
        text.push(`| ${rcl} | ${num(qty)} | ${num(r.bestReferenceTicks)} | ${num(r.winner.ticks)} | ${r.winner.name} |`);
    }
}
text.push("", "## Busca exata pequena", "",
    `${proven.length} casos com ótimo provado; ${truncated.length} casos atingiram o limite sem prova. A prova vale apenas para o triângulo de três labs, lotes até 20, transporte instantâneo e as regras deste modelo. O solver exato é independente da busca de layouts/beam.`, "",
    "O candidato exato entra na comparação quando existe. A coluna guloso/beam mostra o melhor resultado antes dessa inclusão; uma vitória do exato não prova que a heurística encontrou o ótimo.", "",
    "| Produto | Lote | Exato | Guloso/beam | Gap | Estados | Resultado |",
    "|---|---:|---:|---:|---:|---:|---|");
for (const r of rows.filter((r) => r.exact)) text.push(`| ${r.product} | ${r.qty} | ${num(r.exact.ticks)} | ${num(r.exact.heuristicTicks)} | ${num(r.exact.heuristicGap)} | ${num(r.exact.expanded)} | ${r.exact.reason} |`);
text.push("", "## Método e limites", "",
    "- Todos os trios geometricamente válidos são enumerados. O beam de planos mantém até 64 estados, com limite de 100.000 expansões por caso ideal; os mesmos candidatos são reavaliados nos regimes de logística. Até 60.000 expansões são reservadas à construção de layouts, e o restante é repartido entre tamanhos de janela.",
    "- As decisões são grupos conectados ou independentes de etapas, layouts e janelas 5/20/100/500/lote. Candidatos adaptativos escolhem um layout por cooldown/estoque a cada janela e reutilizam labs liberados durante um grupo. Não enumeram todos os possíveis intents, tamanhos de buffer ou trocas arbitrárias por tick.",
    "- Score projetado prioriza tempo, depois movimento/trocas estimados; vencedor final usa o tempo efetivamente simulado, movimento/trocas medidos e desempate determinístico. Referências permanecem disponíveis mesmo quando a busca atinge limites.",
    "- Resultados JSON informam `layoutTruncated`, `windowLimits`, `reason`, estados exatos e candidatos inviáveis/truncados. Candidatos que travam são descartados, nunca tratados como produção completa.",
    "- Mineral único, capacidade 3.000, 5 unidades por reação, alcance Chebyshev<=2, saldo por etapa, cooldown individual e conservação dos átomos são verificados. Reservas impedem consumo duplo. Reagentes produzidos no tick atual não podem alimentar uma chamada downstream desse tick.",
    "- Reposição usa buffer alvo max(40,10×N), dividido entre cópias; transporte finito atende jobs em rodízio, até B por tick, sem acumular crédito ocioso. Referências e candidatos usam esse mesmo serviço. Não é uma busca do melhor controlador de transporte.",
    "- No modo instantâneo, produtos podem ser drenados ao final do tick; no modo finito, dreno usa orçamento do tick seguinte. O tempo termina com produto final no stock, sem esperar seu último cooldown.",
    "- Estoque inicial contém só matérias-primas suficientes. Powers, boosts, CPU de jogo, compras e caminhos de creeps estão fora do modelo. Nenhum ganho de CPU ou resultado vivo é alegado.", "",
    "## Reprodução", "", "```powershell", "node docs/lab-production-simulation.cjs --search --workers 4", "node docs/lab-search/report.cjs", "node docs/lab-production-simulation.cjs --search --self-test",
    "node docs/lab-production-simulation.cjs --search --replay XLH2O-RCL6-Q3000-Binf-D0 --trace", "```", "",
    "O replay confere todas as métricas salvas e, com `--trace`, grava `docs/lab-search-trace.json`: atribuições por janela, mudanças com cooldown remanescente, reações e períodos de dupla função. Cada plano salvo inclui alternativas e política determinística para reproduzir sua sequência.", "",
    "Artefatos: [JSON e planos](lab-search-results.json), [matriz CSV completa](lab-search-comparison.csv), [análise anterior e referências](lab-production-analysis.md).", "",
    "Fontes: [constantes oficiais](https://github.com/screeps/common/blob/master/lib/constants.js), [API](https://docs.screeps.com/api/#StructureLab.runReaction), [engine](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/run-reaction.js).", "");
const file = path.join(__dirname, "../lab-search-report.md");
fs.writeFileSync(file, text.join("\n"));
console.log(JSON.stringify({ rows: rows.length, families: tally, proven: proven.length, truncated: truncated.length,
    evaluated: rows.reduce((n, r) => n + r.search.evaluated, 0), maxDualRoleLabs: Math.max(...rows.map((r) => r.winner.peakDualRoleLabs)), report: "docs/lab-search-report.md" }, null, 2));
