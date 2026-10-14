# Tasks

- [x] Regressões de custo efetivo e concorrência antes da correção.
- [x] Identidade/lotes, reservas físicas e integração craft/flip/swing.
- [x] Compras efetivas, diagnóstico e coordenação de pedidos.
- [x] Extensão/reprecificação, taxas e cancelamento confirmado.
- [x] Jobs antigos, intents concorrentes, reset e regressões integradas.
- [x] Smoke/check/build/diff/grafo e documentação.
- [x] ARK-124: reprecificação/extensão BUY com taxas acumuladas, fill parcial e preservação de ID; regressões no smoke.
- [ ] Publicação e verificação live W7N49/E1N47 (etapa separada).

## Validation — 2026-10-14

Smoke completo: 6458 assertions, 44 identificadas por `0132:`. Check limpo
em 14 JS da implementação; diff sem erros; Grunt gerou dist/main.js com
104 módulos, sem cópia ao cliente; graphify update . concluído.
Casos incluem swing110 + craft440, migração, agregação/FIFO, extensão
confirmada, negócio imediato de cargo novo, taxa perdida de BUY cancelada,
limite líquido de energia, stale jobs e cancelamento de carga em trânsito.
Algumas taxas legadas sem listingFee registrado são reconstruídas com
feeHistoryEstimated=true; novas operações registram custos exatos.
