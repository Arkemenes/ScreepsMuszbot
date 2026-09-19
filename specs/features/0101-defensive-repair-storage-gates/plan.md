# 0101 — Gates de storage para reparo defensivo — Plan

## Approach

Adicionar dois thresholds específicos em `logistics`, sem reutilizar o
threshold de 50% que também classifica a economia e orienta links. Expor
comparadores null-safe em `resourceTiers` e fazer `rampartRepair` decidir o
gate por tier e tipo defensivo.

Crítico bypassa storage. Saudável usa comparação estrita `> 10%`. Ótimo usa
comparação inclusiva `>= 70%`. A torre continua exigindo sua energia própria
antes dos gates de storage.

## Modules

### Changed

| Path | Change |
|------|--------|
| `src/utils/config.js` | `logistics.rampartHealthyStorageRatio = 0.1` e `rampartHardeningStorageRatio = 0.7`. |
| `src/utils/resourceTiers.js` | Comparadores null-safe de storage. |
| `src/utils/rampartRepair.js` | Gates compartilhados para builder e tower. |
| `test/smoke.js` | Regressões dos limites e preservação de prioridade/economia. |
| `specs/ARCHITECTURE.md` | Atualizar a descrição dos gates. |

## Data shapes

Não há novas chaves em `Memory`. Os thresholds são defaults de config e podem
ser sobrescritos em `Memory.settings.logistics`; os valores derivados são
calculados diretamente do storage no tick.

## How it satisfies the constitution

- **CPU:** comparações O(1), sem novas buscas.
- **Memory:** nenhum objeto de jogo é persistido.
- **Fail-soft:** ausência de storage torna gates não críticos inelegíveis.
- **Offline test:** smoke usa storages de 10%, 11%, 60% e 70%.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Alterar por engano a classificação econômica de 50% | Thresholds defensivos separados de `storageSatisfactoryRatio`. |
| Tower e builder divergirem | Ambos chamam os comparadores centralizados. |
| Reparo crítico ser bloqueado | Branch crítico retorna antes de qualquer gate de storage. |

## Rollback

Remover os dois gates de `rampartRepair.js` e restaurar os valores anteriores
dos testes; a configuração nova é inerte quando não é lida.
