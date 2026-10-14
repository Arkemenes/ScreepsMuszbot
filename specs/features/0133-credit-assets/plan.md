# 0133 — Plan

1. `census.allOwned()` reutiliza a varredura existente, incluindo creeps sem role.
2. `stats.js` agrega stores em `Memory.stats.assets.resources`; roomCache evita
   buscas repetidas, um Set evita dupla contagem de storage/terminal.
3. `exporter.py` publica gauges `screeps_resource_amount{resource}` e
   `screeps_resource_sell_value{resource}`. Limpa séries sumidas a cada snapshot
   e publica a quantidade de tipos sem preço em `screeps_assets_unpriced_resources`.
4. Grafana faz o cálculo em PromQL por `job,instance,resource`, preservando
   créditos quando não houver estoque precificado. Novos painéis na linha Mercado.
5. Casos smoke isolados validam coleta, exporter e contrato do dashboard.

Sem nova chamada no main, sem scans de mercado adicionais, sem objetos de
jogo na Memory. Estoque usa a cadência existente `stats.publishInterval`.
