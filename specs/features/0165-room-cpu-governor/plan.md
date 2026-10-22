# 0165 — Governor de CPU por sala — Plan

Derivado de `spec.md`. O modo de aplicação permanece desligado até o aceite live descrito na spec.

## Approach

Manter `cpuTier` como controle global por bucket e acrescentar uma camada separada que decide sobre trabalho opcional por sala. A primeira etapa mede e publica em `off`/`observe`; somente depois de medir custo e efeito dos candidatos é permitido registrá-los na allowlist. A integração deve envolver sub-etapas opcionais como previews/visuais, nunca o loop inteiro da sala, o planejador essencial, defesa, spawn ou execução de roles.

O governor usa agregados da janela de `cpuMeter`, bucket band e uma cota suave configurável. Pressão aumenta a cadência de skips em salas não protegidas; histerese e cooldown controlam a entrada/saída, e um cursor ordenado por nome mantém suspensão/retomada reproduzíveis. Se a leitura estiver incompleta, a decisão é executar. Após um reset global, nenhuma sala é suspensa até recompor evidência suficiente.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| `src/utils/roomCpuGovernor.js` | Agregar custo e decidir modo, pressão, elegibilidade, proteção, cooldown e motivo de skip por sala. |

### Changed

| Path | Change |
|------|--------|
| `src/main.js` | Medir execuções por sala e consultar o governor apenas nos pontos opcionais explicitamente registrados; manter `guard()` e subsistemas obrigatórios. |
| `src/utils/cpuMeter.js` | Publicar agregados de custo por sala na janela existente sem manter amostras por tick. |
| `src/utils/cpuTier.js` | Expor a faixa global como sinal de pressão; os tiers atuais continuam independentes. |
| `src/utils/stats.js` | Publicar modo, custo agregado, execuções elegíveis, skips e causas em `Memory.stats.cpu`. |
| `src/utils/config.js` | Definir `cpu.roomGovernor.mode = "off"` por padrão e os parâmetros calibráveis. |
| `src/rooms/architect.js` | Separar a sub-etapa de preview/visual das etapas que geram plano e construction sites; nunca pular a chamada completa `planCity()`. |
| `test/smoke.js` | Adicionar fixtures determinísticas para modo, pressão, proteção, reset e retomada. |

## Data shapes

- `Memory.settings.cpu.roomGovernor`: `{ mode, softBudgetCpuPerRoom, enterPressure, recoverPressure, cooldownTicks }`; valores de pressão e orçamento são definidos após baseline e `mode` começa em `off`.
- Heap do governor, indexado por `roomName`: agregados da janela, pressão atual, próximo tick permitido e cursor de retomada. Não guardar objetos de jogo nem histórico por tick.
- Telemetria agregada existente: `Memory.stats.cpu.meter.rooms[roomName]` com `{ avg, max, calls }`; `Memory.stats.cpu.roomGovernor` com `{ mode, eligible, skipped, reasons }`.
- Labels opcionais desconhecidos ou sem telemetria não têm autorização implícita para skip.

## How it satisfies the constitution

- **CPU:** o próprio custo de medição será incluído no baseline; nenhuma passagem nova por `Game.creeps` ou chamada redundante a `room.find`.
- **Memory:** estado derivado fica no heap; somente os agregados limitados pela janela já existente são publicados.
- **Fail-soft:** default `off`; telemetria insuficiente, exceção ou label desconhecido executa a tarefa; toda integração continua em `guard()`.
- **Offline test:** stubs variam `Game.cpu.bucket`, uso por sala, sinais de proteção e reset; assertions comparam ações em `observe` e `enforce` e verificam motivo/ordem.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Starvation ou atraso de planejamento em sala com necessidade econômica | Allowlist pequena, explícita e baseada em medição; excluir trabalho essencial e manter modo `off` até janela live. |
| Falso positivo de sala protegida ou ameaça stale | Usar sinais existentes, fail-open para dados ausentes e fixtures de transição/retomada. |
| A instrumentação consumir o ganho | Incluir custo por chamada e comparar a janela `observe` com o baseline atual antes de ativar. |
| Oscilação da política | Separar limiar de entrada/recuperação e impor cooldown configurável. |

## Rollback

Definir `Memory.settings.cpu.roomGovernor.mode = "off"`; isso conserva a medição para diagnóstico, mas impede skips. Remover a flag retorna os defaults sem necessidade de migrar Memory. Se o overhead da telemetria não se pagar, desligar também a publicação do grupo por sala mantendo os registros globais atuais.
