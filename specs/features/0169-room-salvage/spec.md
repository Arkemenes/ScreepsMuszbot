# 0169 — Coleta de recursos recuperáveis em salas conquistadas

- **Status:** done (local)
- **Owner:** a definir
- **Created:** 2026-10-21
- **Linear:** [ARK-215](https://linear.app/arkemenes/issue/ARK-215/0169-coleta-de-recursos-recuperaveis-em-salas-conquistadas)

## Problem

O Pioneer carrega energia em casa, mas ao chegar na sala-alvo considera construção, harvest de fonte e retorno para casa. Não usa primeiro energia no chão ou em estruturas deixadas pelo dono anterior. O hauler já tem loot job parcial para tombstones e ruins; ainda não recupera de forma geral recursos em drops e estruturas com Store acessíveis. Isso desperdiça estoque gratuito e prolonga a recuperação da sala.

## Desired outcome

Pioneers e roles econômicos recuperam recursos locais permitidos antes de minerar, comprar ou abandonar a sala. Energia recuperada alimenta construção e spawn; materiais recuperados seguem para consumidores e destinos seguros. Recursos protegidos por hostile rampart ou em zona perigosa são ignorados.

## In scope

- Pioneer procura energia segura na sala-alvo antes de harvest local ou retorno para casa quando precisa recarregar para concluir a missão.
- Suportar dropped resources, tombstones, ruins, storage/containers e links elegíveis por meio de roomCache e energyPiles.
- Corrigir a ação para usar pickup em dropped resources e withdraw em stores.
- Bootstrap prioriza energia recuperável compatível com a precedência atual de links e fontes.
- Hauler recupera dropped resources não energéticos e Stores com owner estrangeiro; containers sem owner entram somente quando guardam recursos não energéticos, preservando o contrato dos source containers ativos.
- Usar claims/reservations, nonEnergyLogistics, combat.excludeDangerZone e stockPolicy.destination para evitar duplicação, perigo e perda de cargo.
- Reutilizar os caches de Room.find existentes; Memory guarda somente IDs e alvos compactos.
- Política salvage.enabled com default ligado e filtros de segurança sempre ativos; rollback pela configuração.

## Out of scope

- Recuperar recursos de estruturas protegidas por hostile rampart.
- Entrar em sala remota sob ameaça, atacar creeps ou contornar os limites de perigo existentes.
- Dismantlar/remover estruturas para obter recursos.
- Alterar o limiar econômico geral de harvest, preços ou compra de mercado.
- Expandir coleta especializada de power banks/deposits em corredores (0121).

## Acceptance criteria

1. Se Pioneer chegar vazio a uma sala-alvo com energia recuperável segura e disponível, move/coleta/retira essa energia antes de harvest ou retorno à origem.
2. Dropped energy usa pickup; tombstone, ruin, storage, container e link elegível usam withdraw sem erro de tipo. Energia recuperada pode ser gasta imediatamente em spawn/construction site.
3. Ao esgotar o salvamento local, Pioneer mantém o fallback existente de harvest ou refill em casa; com energia suficiente, não interrompe o fluxo de construção apenas para buscar mais.
4. Bootstrap e hauler não duplicam fontes já reclamadas e obedecem a capacidade do creep, claims e filtros de perigo; energy-only em container sem owner permanece sob a logística de miner/link.
5. Hauler transfere o loot para um destino aprovado quando há espaço; sem destino seguro conserva o cargo e não o descarta.
6. Estrutura em zona excluída ou sob hostile rampart não é coletada; busca respeita roomCache e não adiciona chamadas por tipo/sala/tick.
7. Prioridade por decaimento (pedido do usuário, 2026-10-21): recurso no chão vem sempre antes de tombstone/ruin, que vem antes de Store de estrutura, mesmo quando o Store está mais perto. Dentro de cada nível vale o mais próximo por path; um nível sem pile alcançável passa ao seguinte ("closestDecayFirst() picks a dropped pile before a ruin or a store, whatever the distance", "closestDecayFirst() takes a ruin/tombstone before a structure store", "closestDecayFirst() falls through to the next tier when no dropped pile is reachable", "battlefieldLootJob() takes dropped salvage before a tombstone (drops decay every tick)").

## Constitution check

- **CPU:** usa roomCache, energia reutiliza energyPiles e o hauler mantém jobs cacheados; não varre Game.creeps novamente.
- **Memory:** objetos permanecem no heap; jobs e reservations armazenam IDs e nomes de recurso apenas.
- **Fail-soft:** sources antigas continuam como fallback; erros de withdraw/pickup não limpam cargo nem travam o role.
- **Offline test:** fixtures cobrem drop, tombstone, ruin, Store hostil acessível, hostile rampart, perigo, reservas, destino e ausência de salvage.
- **Configuração:** salvage.enabled fica em Memory.settings/config e default ligado; filtros de segurança não são configuráveis para bypass.

## Open questions

Nenhuma decisão de produto está aberta. A primeira entrega foca energia para Pioneer e recuperação segura por hauler; o escopo de outros roles fica limitado às fontes que possam usar ou encaminhar sem descartar carga.
