# 0180 — Evidência local

Snapshot GET de `W4N48`, coletado em 2026-10-22 e reutilizado sem polling.
Líder `(20,33)` e dois strikers ativos, 25 RANGED_ATTACK cada, DPS total 500.

O novo planejador aplicado ao snapshot encontrou:

- Objetivo: torre `(35,28)`.
- Primeiro bloqueio: muralha `(31,30)`, 500501 HP.
- Aproximação livre: `(28,32)`.
- Custo estimado até posição de ataque ao objetivo: 1013,002 ticks, dos quais
  1001,002 são dano da muralha; não inclui reparo inimigo.
- Com todas as barreiras destrutíveis proibidas, a mesma busca retornou
  `noRoute`, confirmando que não existe caminho aberto sob essa política.

Execução local isolada do mesmo `squadBreach.js`, com objetos e terreno do
snapshot; não é confirmação de comportamento live após publicação. Arquivos
temporários da coleta não fazem parte da entrega.
