# 0148 — População sob demanda com preservação de trabalho útil

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** in-progress — T1 (builderDemand) e T2 (precedência + piso emergencial) publicados em 2026-10-21; piloto W7N49 ligado por padrão (decisão do usuário: features novas ligadas, conciliada com o opt-in por sala da spec); T4 (elegibilidade sem ameaça/economia estável, motivo por sala, fallback §9 no smoke) e T3 (setting por sala `pilot` sob overlay de experimento da 0154, recuperação cronometrada em `onDemandLast`) publicados no mesmo dia; T5 (piloto live) pendente.
- **Issue:** ARK-135 (filha de ARK-128).
- **Created / revisão documental:** 2026-10-15.
- **Contrato integrado e aceite:** [planejamento vigente](../../../docs/planejamento-integrado-2026-10-16.md); análises anteriores são históricas.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.

## Problem

Reduzir builders/upgraders pode cortar trabalho útil e apenas aparentar eficiência. O builder atual também faz repair e upgrade;
autoscale, overrides e conversão de roles afetam a contagem final. Torre existente não comprova cobertura suficiente.

## Desired outcome / In scope

- Política opt-in por sala. Considerar construção, reparos elegíveis em todos os tiers e progresso útil de RCL/GCL; não limitar demanda à emergência.
- Só retirar reposição quando capacidade restante, abastecimento e logística preservarem esse trabalho. Usar o contexto operacional observado da 0154.
- Predizer manutenção e reposição por fila + spawn + viagem + aquisição de energia + margem; iniciar antes dos limites de segurança.
- Preservar pisos de defesa/downgrade, controles manuais e regras de conversão. Não reciclar creeps vivos no piloto.
- Integrar a política após autoscale, com precedência explícita: override manual preservado, safety floor não pode ser reduzido; invalidar needs após mudança/rollback.
- Piloto em uma sala elegível, escolhida por ausência de ameaça e abastecimento estável; RCL3 não é automaticamente menos arriscado.
- Observar uma vida completa de creep depois da ausência efetiva, ampliando até cobrir manutenção pendente. Se nenhum caso elegível, não ativar.
- Fusão builder/upgrader fica fora desta primeira entrega; política de upgrader só reduz capacidade comprovadamente ociosa, preservando progresso útil.

### Precedência, emergência e encerramento

Após autoscale, aplicar override manual ou política opt-in (legado quando off), depois elevar ao piso de segurança. Contagem manual maior é preservada; zero não reduz piso crítico. Converter roles não pode contar o mesmo worker duas vezes.

Piso emergencial independente: reparo crítico ou marcas de resgate (container 40%, road 30%, critical 300 ticks) sem builder vivo/spawning/na fila cria uma única demanda de builder. Fila: defesa/economia essencial antes; builder emergencial antes de consumo opcional. Marcas de resgate não são o momento normal para começar reposição: usar previsão de fila+spawn+viagem+energia+margem antes delas.

Flag off conserva o legado **acrescido desse piso explicitamente novo**. Guard/reset remove overlay de experimento da 0154 e invalida needs no mesmo tick, antes da decisão de spawn; não ressuscita creep. Estados do piloto: candidate → baseline → active → recovering → closed/aborted. Registrar detectionTick, queuedTick, spawnTick, arrivedTick e firstWorkTick para medir recuperação.

Readiness é o contrato da [0157](../0157-operational-readiness/spec.md). Nenhuma sala elegível é resultado aceito, com motivo por sala; sem ativação automática por falta de candidato. Período live começa após ausência efetiva e cobre uma vida de creep e manutenção pendente, com configuração/carga identificadas.
Fallback §9 preserva trabalho útil em todas as faixas; economia de CPU não pode vir de suprimir obra/reparo/RCL/GCL demandados.

## Acceptance criteria

1. Flag off usa legado com o piso emergencial documentado; flag on permite builder 0 somente sem demanda útil descoberta/predita, e repõe antes da necessidade.
2. Mundo com repair saudável/ótimo ou upgrade útil que perderia capacidade mantém worker; torre vazia, sem alcance/capacidade ou ocupada em defesa não é cobertura presumida.
3. Storage vazio com renda/logística sustentáveis não bloqueia trabalho; energia reservada e transporte insuficiente não contam como excedente.
4. Autoscale, override manual, convertedFrom e cache de needs não anulam os pisos nem congelam start/rollback; não há downgrade.
5. Experimento reverte com motivo em guarda, reset e fim; inclui tempo de recuperação e preserva edição manual posterior.
6. Comparação live aguarda ausência efetiva e horizonte de manutenção; medir CPU junto de obra, reparo, RCL/GCL e gasto extra das torres, sem alegar ganho ao eliminar trabalho útil.

7. Política desligada, builder já morto e reparo crítico presente: o respawn é demandado no próximo slot; o experimento registra o tempo até o respawn.
8. Com a faixa preterida como único trabalho, o worker não fica ocioso (fallback §9).
9. Nenhuma sala elegível: política não ativa, e a saída lista o motivo por sala.

## Constitution check

Reusar census/roomCache; configuração em Memory.settings; dados derivados no heap limitado;
somente ownership/recuperação persistente necessária, nunca objetos de jogo; guard e stall guard.
Observações e relatórios novos antes de cpuMeter.endTick. Preservar cascata crítico → saudável → ótimo e fallback.
Smoke e invariantes verificam comportamento, não só ausência de exceção.

## Review gate

[Revisão independente e reavaliação favorável](../../../docs/revisao-final-planejamento-2026-10-16.md): R1–R6 fechados no desenho. [Resposta e precisões](../../../docs/resposta-revisao-final-planejamento-2026-10-16.md). ARK-141 conclui somente planejamento/documentação; AC de runtime/live permanecem abertos. Implementação local segue o plano incremental autorizado; ativação/investimentos preservam os gates operacionais.
