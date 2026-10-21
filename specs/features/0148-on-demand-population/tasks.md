# 0148 — População sob demanda — Tasks

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — T1–T2 publicados em 2026-10-21 (piloto W7N49 por padrão); T3–T5 pendentes.
- **Issue:** ARK-135; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Gate de implementação futura

- [x] Implementação local incremental autorizada pelo usuário em 16/10/2026; gates operacionais preservados.
- [ ] Pré-requisitos do pacote no DAG e revisão das fontes/fixtures verificados.

## Implementação futura — não executada

- [x] **T1 — Modelar demanda, capacidade de torre e previsão de reposição.** AC1–4. Feito 2026-10-21 (local, sem consumidor): `utils/builderDemand.evaluate(sala)` → `{useful, reasons, lead, idleSince}`. Demanda = obra; upgrade abaixo do RCL8; repair critical (piso); repair defensivo liberado pelos gates de storage; repair normal só sem cobertura de torre (sem torre, alguma abaixo de `tower.satisfactoryRepairEnergyRatio`, defesa/hostis, economia critical). No RCL8 a faixa de 99% (0103) não é demanda: o piso de downgrade é do upgrader. Prazo de reposição = partes × spawn + `population.onDemand.travelTicks` (50) + `marginTicks` (100); `idleSince` = início da sequência sem demanda (tolerância `gapTicks` 20). Smoke `0148 demand preservation` (14). `0148 precedence` vai para a T2.
- [x] **T2 — Compor target após autoscale e deduplicar vivos/spawning/fila.** AC1,4,7. Feito 2026-10-21 (publicado): `rooms/onDemandPopulation.apply` no fim de `needs.compute`; precedência legado → override manual → política opt-in (W7N49 por padrão, evidência do energyReport para entrar, estado persistente `Memory.rooms[r].onDemand`) → piso emergencial em toda sala. Dedupe: census conta vivos + spawning e builders convertidos; o spawn só pede `count < wanted`. Smoke `0148 precedence`, `0148 recovery ownership`, `0148 emergency after death` (13). Stats `rooms[sala].onDemand` + painéis no Grafana (ARK-201).
- [ ] **T3 — Integrar overlay/guardas e recuperação off/reset/manual, invalidando needs.** AC5,7. Verificação futura: `0148 recovery ownership`.
- [ ] **T4 — Preservar fallback de todo WORK e explicar nenhuma sala elegível.** AC8–9. Verificação futura: `0148 fallback; 0148 no eligible room`.
- [ ] **T5 — Preparar métricas/seleção da sala e executar piloto só após autorização própria.** AC3,6. Verificação futura: `LIVE-0148: ausência real, vida completa, manutenção e recuperação`.

## Definition of done futura

- [ ] Assertions offline acima integradas ao smoke, com stubs deferidos e origem/qualidade explícitas.
- [ ] `node --check` nos JS tocados, smoke com caminho absoluto e diff check verdes.
- [ ] Build local sem copiar/publicar ao cliente; graphify atualizado após código; docs refletem somente o implementado.
- [ ] Evidências LIVE exigidas registradas em aceite separado; nenhum checkbox live concluído só por fixture.

Todos os checkboxes são de execução futura e continuam abertos. A revisão documental não conclui AC de runtime.
