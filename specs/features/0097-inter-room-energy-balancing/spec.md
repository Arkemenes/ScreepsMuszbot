# 0097 — Balanceamento automático de energia entre salas

- **Status:** ready
- **Owner:** usuário + assistente
- **Created:** 2026-09-18

## Problem

A política econômica do ROADMAP 0091 classifica cada sala como `critical`,
`stable` ou `abundant`, mas nenhuma rotina compara o estado econômico das salas
próprias nem cria uma operação para mover energia entre elas. Uma sala pode
ficar sem energia operacional enquanto outra mantém sobra no storage, e o
terminal não é usado para corrigir esse desequilíbrio.

A decisão de balancear também não deve duplicar a logística física nem chamar
`Terminal.send()` diretamente. Sem uma fronteira única, o balanceamento
automático e os comandos manuais poderiam disputar o mesmo terminal, ignorar o
cooldown, reservar a mesma energia duas vezes ou deixar recursos recebidos
parados no terminal.

## Desired outcome

Em intervalos configuráveis, o bot identifica salas próprias críticas ou
significativamente abaixo do restante da rede, escolhe uma origem que preserve
sua própria operação e cria uma transferência pela API de terminal da feature
0098. A origem entrega o recurso ao seu terminal usando um hauler; a sala de
destino retira o recurso recebido do terminal e o leva ao storage. A rotina é
idempotente, não duplica operações pendentes e nunca transforma uma sala
remetente estável em crítica.

## In scope

- Comparar salas próprias com `storage` e `terminal` válidos, usando o estado
  econômico de `utils/resourceTiers.js` (`critical`, `stable`, `abundant`).
- Considerar a energia agregada em `storage` + `terminal`, mas preservar as
  reservas locais definidas por `logistics.reserveRatio` e
  `logistics.terminalReserveRatio`.
- Usar a diferença de percentual de armazenamento como gatilho normal:
  `sourceRatio - targetRatio >= logistics.balanceGapRatio`, default `0.20`.
- Tratar uma sala `critical` como gatilho imediato, sem esperar o ciclo normal,
  desde que exista uma origem elegível.
- Avaliar o balanceamento em um ciclo configurável, default
  `logistics.balanceInterval = 1000` ticks.
- Escolher a origem por energia excedente preservável, depois pela menor
  distância linear entre as salas e, por fim, por nome de sala para manter
  decisão determinística.
- Calcular o volume como o menor valor entre:
  - a energia acima da reserva que a origem pode ceder;
  - a energia necessária para tirar o destino da condição crítica; e
  - o limite configurável `logistics.balanceMaxAmount`.
- Criar a transferência chamando a função pública de transferência da feature
  0098. Esta feature não chama `terminal.send()` nem manipula intents de
  terminal diretamente.
- Manter no estado persistente somente a operação pendente mínima: origem,
  destino, recurso, quantidade, identificador/estado e timestamps. Salvar
  nomes e ids, nunca objetos de jogo.
- Reutilizar operações já pendentes e impedir duas operações simultâneas para o
  mesmo destino ou para o mesmo terminal.
- Cancelar ou reavaliar uma operação que perdeu a elegibilidade antes da
  retirada do storage, sem destruir uma carga que já foi retirada por um
  hauler.
- Expor estado somente para observabilidade, incluindo razão, origem, destino,
  quantidade solicitada, quantidade enviada e último erro.

## Out of scope

- Implementar a logística física, `Terminal.send()`, compra, venda ou retirada
  de recursos recebidos; tudo isso pertence à feature 0098.
- Comprar energia no mercado ou vender excedentes automaticamente.
- Balancear minerais, commodities ou recursos que não sejam
  `RESOURCE_ENERGY`.
- Igualar salas por quantidade absoluta de energia ou ignorar capacidade de
  storage.
- Transferir se a origem não tiver storage/terminal operacionais, estiver
  `critical`, sob ameaça operacional ou não puder preservar sua reserva.
- Usar creeps de outra sala como transportadores; cada operação é executada
  pelos haulers da sala correspondente.
- Fazer uma transferência automática para uma sala que não seja própria ou
  para um jogador aliado/externo.

## Acceptance criteria

1. `test/smoke.js` asserts que uma sala `critical` cria uma operação mesmo
   antes de `logistics.balanceInterval` vencer, quando há origem elegível.
2. `test/smoke.js` asserts que uma sala `stable`/`abundant` não cede energia
   abaixo de `logistics.reserveRatio` e `logistics.terminalReserveRatio`.
3. `test/smoke.js` asserts que o gatilho normal exige uma diferença mínima de
   `logistics.balanceGapRatio` (default `0.20`) entre origem e destino.
4. `test/smoke.js` asserts que o volume escolhido é limitado pela necessidade
   do destino, pelo excedente preservável da origem e por
   `logistics.balanceMaxAmount`.
5. `test/smoke.js` asserts que a escolha de origem é determinística e prefere
   maior excedente, depois menor distância, depois nome.
6. `test/smoke.js` asserts que uma operação pendente impede duplicação e que
   uma operação já carregada não é cancelada apenas porque o snapshot econômico
   mudou.
7. `test/smoke.js` spies na API de 0098 e asserts que o balanceamento chama a
   função de transferência, sem chamar `terminal.send()` diretamente.
8. Em jogo, uma transferência automática cria uma operação de 0098; a origem
   usa um hauler para levar energia do storage ao terminal e o destino usa um
   hauler para levar a energia recebida do terminal ao storage.
9. `node test/smoke.js "$(pwd)"`, `node --check` nos arquivos tocados e
   `npx grunt` permanecem verdes quando a implementação for feita.

## Constitution check

- **CPU:** o snapshot econômico e a decisão de rede são cacheados uma vez por
  tick; a avaliação completa só roda no intervalo configurado ou quando uma
  sala crítica exigir reação. Não há `room.find` por creep.
- **Memory:** operações persistentes guardam apenas strings, números, estados e
  ids; candidatos e cálculos derivados ficam no heap.
- **Fail-soft:** falha ao criar uma operação ou consultar uma sala é isolada e
  não aborta as demais salas; o consumidor será chamado sob `guard` no `main`.
- **Testável offline:** a decisão de origem, destino, volume, cooldown e
  idempotência roda sem servidor com mocks do smoke.
- **Roles thin:** o balanceador decide política; o módulo 0098 executa o
  terminal e os haulers.
- **Config over hardcode:** gap, intervalo, reservas, teto e limites de
  simultaneidade vêm de `utils/config.js`.
- **Spending cascade:** a origem só usa energia excedente após os consumidores
  críticos e as reservas locais; uma sala crítica nunca é usada como origem.

## Review decisions (2026-09-19)

- Ratio e elegibilidade usam energia/capacidade agregada de `storage +
  terminal`, preservando as reservas de cada estrutura.
- Uma sala recebe no máximo uma operação pendente por vez. Após completar, uma
  sala crítica é reavaliada de imediato.
- Para energia, o volume enviado é resolvido contra `amount +
  calcTransactionCost(amount, from, to)`: a taxa pertence à origem e nunca
  pode violar sua reserva.
- A observabilidade usa a janela consolidada de 60 ticks de 0098, incluindo
  operação pendente, origem, destino, quantidade, enviado e último erro.
