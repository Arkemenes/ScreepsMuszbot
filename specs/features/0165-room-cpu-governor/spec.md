# 0165 — Governor de CPU por sala

- **Status:** planned
- **Owner:** a definir após revisão
- **Created:** 2026-10-21
- **Linear:** [ARK-211](https://linear.app/arkemenes/issue/ARK-211/0165-governor-de-cpu-por-sala)

## Problem

O `cpuTier` limita módulos inteiros conforme o bucket global e o `cpuMeter` atribui custo a módulos, roles, estruturas e spans. O loop já chama vários subsistemas por sala em `src/main.js`, mas não há uma política que estime o custo recorrente de cada sala e reduza, de forma gradual, apenas trabalho opcional nas salas não protegidas. Um grupo de salas caro pode consumir o orçamento compartilhado enquanto trabalho adiável continua rodando.

Envolver um loop inteiro por sala em uma nova regra seria inseguro: o mesmo fluxo inclui defesa, spawn e execução de creeps. A política precisa operar em unidades opcionais explícitas e manter essas ações essenciais fora da allowlist de skip.

## Desired outcome

O mantenedor consegue observar custo e decisões por sala sem alterar ações; depois de uma janela de evidência, pode ativar throttling configurável. Sob pressão, o governor reduz primeiro a cadência de trabalho opcional em salas não protegidas, informa custo e motivo dos skips e retoma esse trabalho de forma determinística quando a pressão cede. O padrão permanece desligado.

## In scope

- Integrar os pontos por sala de `src/main.js` ao `src/utils/cpuMeter.js` e ao `src/utils/cpuTier.js`, preservando as faixas globais por bucket existentes.
- Medir custo por sala em agregados por janela e estabelecer um orçamento suave por sala com parâmetros em `Memory.settings.cpu.roomGovernor`.
- Oferecer os modos `off`, `observe` e `enforce`. `off` é o padrão; `observe` calcula e publica decisões sem pular chamadas; somente `enforce` aplica skips.
- Permitir skip apenas para trabalho por sala explicitamente classificado como opcional e registrado em uma allowlist. Exemplos candidatos para revisão após medição: previews/visuais e diagnósticos de baixa prioridade. O plano de implementação deve confirmar a lista pelo custo real e pelo impacto; se não houver unidade segura, a allowlist pode ficar vazia.
- Usar throttling gradual, com limiares de entrada/recuperação, histerese e cooldown configuráveis. A seleção e a retomada seguem ordem determinística para o mesmo estado e conjunto de salas.
- Proteger salas com ameaça ou defesa ativa, déficit crítico de população e operação militar ativa. As ações de defesa, a execução de roles de creeps e o spawn crítico não são elegíveis para skip, mesmo em sala não protegida.
- Se a telemetria necessária estiver ausente, inválida ou ainda sem janela suficiente, falhar aberto: manter o trabalho opcional em execução e publicar o motivo.
- Expor na telemetria CPU existente custo agregado por sala, trabalho elegível executado/suspenso e motivo de skip. Não guardar amostras por tick nem objetos de jogo em `Memory`.
- Manter a política desabilitada até uma janela live controlada demonstrar ganho e preservar defesa e spawn.

## Out of scope

- Substituir ou recalibrar os tiers globais de `cpuTier`.
- Pular defesa, execução de creeps, spawn crítico, ou qualquer trabalho sem classificação explícita.
- Prometer garantia geral de ausência de starvation.
- Persistir histórico por tick em `Memory` ou manter referências a objetos de jogo.
- Escolher thresholds de produção sem baseline medido.

## Acceptance criteria

1. O smoke test afirma que `cpu.roomGovernor.mode` inicia como `off`; em `observe`, `actionsBefore === actionsAfter` para a mesma fixture, embora a decisão prevista e o motivo sejam registrados.
2. Fixtures offline com pressão e telemetria suficiente afirmam que `enforce` reduz gradualmente somente unidades da allowlist (`skippedOptionalWork > 0`) e publica custo por sala e motivo (`roomCost` e `skipReason`). Labels desconhecidos ou sem telemetria não são pulados.
3. Fixtures de sala ameaçada/defesa ativa, déficit crítico de população e operação militar afirmam `protected === true`; nenhuma ação de defesa, `spawnCritical` ou execução de creep pode ser registrada como skip.
4. Testes de limiar acima/abaixo da faixa, cooldown e retomada afirmam que não há oscilação a cada tick e que a ordem de retomada é determinística. Após reset do global, a política falha aberta até recompor telemetria suficiente.
5. O contrato de publicação contém agregados por sala, execução, skips e motivos na janela do medidor existente; não contém arrays de amostras por tick nem objetos de jogo em `Memory`.
6. Em uma janela live controlada, o modo `observe` produz baseline por sala; uma janela comparável em `enforce` demonstra redução mensurável de CPU sem regressão observável de defesa ou spawn. A configuração live não passa a `enforce` antes desse aceite.

## Constitution check

- **CPU:** mede antes de decidir, reutiliza `cpuTier` como sinal global e só reduz trabalho opcional. A coleta não adiciona outra varredura em `Game.creeps` nem chamadas diretas redundantes de `room.find`.
- **Memory:** estado derivado e amostras ficam no heap; somente agregados já limitados por janela são publicados na telemetria existente. Nenhum objeto do jogo é serializado.
- **Fail soft:** política desligada por padrão; telemetria insuficiente, erro ou label desconhecido resultam em executar o trabalho. Chamadas de subsistema continuam sob `guard()`.
- **Testabilidade:** critérios offline cobrem modos, proteção, reset e recuperação; a ativação requer evidência live separada.
- **Configuração:** modos, limiares, cooldown e orçamento ficam em `Memory.settings`/config, não em literais de produção espalhados.

## Open questions

Nenhuma decisão de produto está aberta. O plano limita a allowlist inicial a tarefas comprovadamente opcionais e calibra orçamento/limiares/cooldown a partir de baseline; se não houver candidato seguro, a allowlist fica vazia e `enforce` continua desligado.
