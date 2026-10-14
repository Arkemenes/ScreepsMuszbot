# 0133 — Patrimônio estimado em créditos

## Problem

O Grafana conhece créditos e preços, mas só recebe energia e minerais base
em storage/terminal. Recursos em labs, factories e transporte ficam ausentes.

## Desired outcome

Publicar inventário por recurso e adicionar o gráfico de patrimônio:
`credits + 0.95 * sum(sellValue * amount)`. `sellValue` corresponde ao
`sellPrice` da série **Sell Value** existente no `grafana.json`, não a
`currentSell`. Os 5% incidem apenas sobre recursos.

## Scope

- Todas as estruturas com `store` em salas próprias, incluindo containers,
  labs, factories, torres, links, spawns e extensions; excluir estruturas inimigas.
- Todos os creeps próprios, inclusive sem role e em trânsito, usando census.
- Power creeps próprios presentes no mundo e recursos de conta (`Game.resources`).
- Não contar fontes/depositos, recursos no chão, tombstones/ruins ou estruturas
  neutras em salas remotas como patrimônio próprio.
- Manter métricas antigas; snapshot esparso, somente números, na cadência de stats.
- Recursos sem `sellPrice` finito e não negativo permanecem no inventário;
  não recebem preço substituto e aparecem num indicador de cobertura.
- O valor exibido é estimado, não garantia de liquidez ou execução.

## Acceptance criteria

1. `0133: inventory includes labs, containers, factories and all owned cargo`.
2. `0133: inventory does not double-count storage or include enemy structures`.
3. `0133: exporter joins sellValue by resource and clears vanished stock`.
4. `0133: dashboard values assets with sellValue and discounts resources only`.
5. Snapshot vazio e recursos sem preço não apagam os créditos do gráfico.
6. `node --check`, smoke e `npx grunt` verdes; `graphify update .` executado.

## Review

Implementação solicitada explicitamente pelo usuário. Mapeamento de preço
confirmado pela query da série Sell Value no dashboard. Nenhuma política de
compra/venda alterada; leitura de estoque físico, sem ledger/reservas.

## Validation

- Smoke completo verde, incluindo `test/assetStatsCases.js`.
- `python test/assetExporterCases.py <project>` verde; verifica cálculo com
  preços distintos de currentSell, ausência/zero/infinito e remoção de séries.
- `node --check` limpo em todos os JavaScript tocados.
- `npx grunt` gerou `dist/main.js`; cópia opcional ao cliente local bloqueada
  por permissão. Não houve publicação do exporter nem importação no Grafana.
