# 0169 — Coleta de recursos recuperáveis em salas conquistadas — Plan

Derivado de spec.md. ARK-215 é urgente e está em execução logo após a correção de claimRoom.

## Approach

Usar a seleção existente energyPiles como fonte comum de energia: ela já combina drops, tombstones, ruins e holders cacheados e aplica a zona de perigo. No Pioneer, separar a ação de coleta por tipo de objeto e consultar energia recuperável na sala-alvo antes de continuar um compromisso de miningLocal ou iniciar retorno a home. Manter a carga de energia focada no fluxo de construção; depois do salvamento, a escolha local-vs-home segue igual.

No hauler, ampliar a atribuição de loot para drops de todos os recursos e stores abandonados/hostis que possam ser sacados, mantendo jobs e claims de origem, claims de destino da logística não energética e stockPolicy. Não levar recursos sem destino seguro. Bootstrap reutiliza energyPiles com a prioridade atual do link feeder; limiares e cache de room.find continuam centralizados.

## Modules

### New

| Path | Responsibility |
|------|----------------|
| — | Usar energyPiles e os jobs de loot existentes; criar helper somente se pickup/withdraw compartilhado for realmente necessário. |

### Changed

| Path | Change |
|------|--------|
| src/roles/pioneer.js | Salvar energia da sala-alvo antes de harvest/retorno e diferenciar pickup de withdraw. |
| src/roles/bootstrap.js | Usar fontes recuperáveis com a precedência de energia já existente. |
| src/roles/hauler.js | Cobrir drops não energéticos e Stores acessíveis sem retirar reservas de outras tarefas. |
| src/utils/energy.js | Ajustar a lista de energia apenas quando os filtros atuais não cobrirem um caso permitido. |
| src/utils/roomCache.js | Reusar os mesmos find caches; sem buscas diretas redundantes. |
| test/smoke.js | Adicionar fixtures para fonte, segurança, claims, entrega e fallback. |

## Data shapes

- Sem novo objeto persistente de sistema.
- Creep.memory.lootJob contém apenas sourceId, resource, room/entrega já compatíveis com a forma atual.
- Memory.settings.salvage.enabled: boolean, default true.
- Objetos de jogo resolvidos por ID; pile cache e referência da sala são heap por tick.

## How it satisfies the constitution

- **CPU:** não adiciona uma travessia em Game.creeps; cada tipo de fonte usa roomCache.
- **Memory:** somente IDs e campos primitivos nos jobs; nenhum Store/Room vai para Memory.
- **Fail-soft:** fallback de harvest/refill e de loot permanece; sem destino, conservar recurso.
- **Offline test:** o smoke confirma pickup/withdraw e as decisões antes de implementar ação.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Dois creeps tentarem a mesma pilha. | Reservar sourceId pela infraestrutura existente e validar a quantidade antes da ação. |
| Withdraw de estrutura hostil falhar ou gastar ações sem efeito. | Excluir hostile rampart, usar API permitida e limpar apenas o job inválido com retry limitado. |
| Pioneer abandonar construção para coletar energia. | Priorizar salvage só quando vazio ou já comprometido com refill/mining; usar a carga recuperada imediatamente. |
| Recursos valiosos não terem destino no room. | Hauler só aceita loot não energético com destino stockPolicy; sem destino, conserva o cargo. |
| Novo find romper o teto constitucional. | Usar roomCache/energyPiles e acrescentar assertion do contador de find no smoke. |

## Rollback

Definir salvage.enabled=false para desativar novas atribuições; manter a implementação anterior de harvest/refill e os jobs existentes. Se o toggle não puder ser aplicado em cada call path sem duplicação, reverter os commits da mudança.
