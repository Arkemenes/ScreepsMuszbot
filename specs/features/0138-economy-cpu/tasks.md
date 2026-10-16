# Tasks

## Diagnóstico e handoff, sem correções — 15/10/2026

- [x] Inventariar os111arquivos de src e rastrear os consumidores quentes.
- [x] Reproduzir27cenários de scans globais/localidade, histórico final separado,
  harvest/build duplicados, serialização em retry e diluição da média após reset.
- [x] Escrever relatório com evidências, propostas, riscos, invalidadores e critérios
  em docs/cpu-optimization-plan-2026-10-15.md.
- [x] Preparar coleta pontual via console sem deploy nem reset do medidor.
- [ ] Atribuir pico~197, residual e frequência live dos desperdícios com as coletas.
- [ ] Obter baseline normal de600intervalos; último pós-profile154/154=17,961CPU.
- [ ] Implementação futura: seguir pacotes/condições do relatório, sem alterar
  cadências/estoque/fees/intents para aparentar ganho.

- [x] Baseline e regressões do resumo histórico com coletor real.
- [x] Cache derivado com invalidação na mutação, frescor intratick e motivos.
- [x] Medir escala; smoke11516/check/grunt111/graphify4576nós/9342arestas.
  Bundle=cliente19CD89F88164325AC3AF44A1E912B7DEF587EF2863E406C34589ACC8320A8BAB.
- [ ] Comparar CPU cobrada aquecida após resumo histórico, com população/carga.

- [x] Reproduzir soma de fontes e medir escala antes/depois, warm/cold.
- [x] Consulta local compartilhada e regressões de frescor/claims.
- [x] Checks/smoke11459/build111 após medição live prévia17,702CPU/600intervalos; documentar limites.

- [x] Reprodutor e baseline offline.
- [x] Índice compartilhado; smoke de mutações/reset/claims.
- [x] Busca geométrica sem estados repetidos; smoke de validade/estratégias.
- [x] Cadência separada, fast paths de venda, poll e hidratação diagnosticada.
- [x] Check/smoke6723/grunt109/diff/graphify (4466nós/9202arestas) e documentação antes/depois; SHA256 dist=cliente95FF5F58372B663CC1022D72B3A3704EF00662302A5C38FA9AA7BAA1057C1FF9.
- [x] Comparar cpuTop aquecido após publicação:23h00/83653067 total16,16 vs20,91; craft0,764 vs4,273; terminal2,131 vs2,860. Carga diferente (32 vs36,9calls de creep); tendência longa do bucket não incluída. E1N47 abriu cadeia e avançou conversão, bloqueio de energia tratado em0139.
- [ ] Reconciliar leitura do script com cobrança pelo bucket e confirmar folga sustentada (0140); comparação anterior isolada não fecha ARK-128.
