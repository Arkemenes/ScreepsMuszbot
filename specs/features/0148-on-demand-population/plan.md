# 0148 — População sob demanda — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** planned — execução local autorizada em etapas; não implementada.
- **Issue:** ARK-135; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

repairDemand calcula demanda atual/predita via roomCache e tiers; não presume torre abastecida/disponível. needs compõe autoscale/override/política/legado e eleva ao piso emergencial no fim. experiment/config da 0154 fornece overlay com ownership; readiness da 0157 fornece contexto por consumidor.

## Data flow e falhas

1. Observar obra, reparo por tier, trabalho útil RCL/GCL, torres realmente disponíveis e WORK vivo/spawning/fila deduplicado.
2. Predizer prazo de reposição = fila+spawn+viagem+energia+margem. Somente remover reposição se capacidade restante conserva toda a demanda útil, com evidência válida.
3. Definir target pela precedência do spec; invalidar needs em mudança e aplicar emergência acima de opcionais.
4. Piloto guarda room/regime/setting/owner/geração/estado e timestamps da recuperação; usa estados candidate/baseline/active/recovering/closed.
5. Guarda, off/reset ou intervenção manual remove overlay antes de spawn; piso emergencial continua independente. Reportar tempo real até primeiro trabalho do substituto.
6. Nenhum candidato → relatório por sala e encerramento sem ativação. Nunca escolher uma sala só por ser RCL3.

## Validation / Rollout

Fixtures 0148 demand preservation/precedence/emergency/fallback/no eligible room. Cobrir torre sem energia, sem alcance e em defesa, conversão/override, builder morto no off e fila essencial concorrente.
Piloto futuro de uma sala: baseline representativa, ausência efetiva e uma vida completa de creep, estendida até manutenção pendente. Medir CPU e obra/repair/RCL/GCL/gasto de torre/recuperação. Ganho não pode resultar de trabalho útil removido.

## Risks & mitigations

Reposição tardia: previsão antes das marcas de resgate e registro de recuperação. Controle manual: overlay removível sem reescrever base. Abastecimento unknown: manter população anterior, sem suspender emergência. Fallback §9 testado como único trabalho disponível.
