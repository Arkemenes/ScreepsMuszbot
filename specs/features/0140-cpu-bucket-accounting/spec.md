# CPU medida e balanço efetivo do bucket (ARK-128)

## Problema

Usuário mostra bucket quase estável~3353 entre22h10/23h05 apesar de cpuTop
49ticks16,16 e gauge amostrada com média17,5 para limite20. Não comprova
folga sustentada. cpuTop termina dentro dos wrappers; driver oficial
screeps/driver/lib/runtime/runtime.js serializa rawMemory._parsed depois de
game.run e calcula usedTime depois, arredondando para cima. O comentário
local que chama essa serialização de gratuita está errado. Grafana lê
screeps_cpu_used, um tick amostrado, não média temporal completa.

## Resultado e critérios

- Preservar medição por módulos e média atual; identificá-la como script
  observado antes do fechamento do motor, sem chamar residual de serialização.
- Inferir custo anterior pelo balanço `limiteAnterior+bucketAnterior-bucketAtual`
  em ticks consecutivos do mesmo shard, sem saturação/esgotamento/mudança de
  limite. Parear com a leitura do script daquele mesmo tick anterior.
- Janela móvel configurável600ticks, heap limitado e O(1) por tick. Publicar
  média inferida, média script pareada, residual, folga, amostras válidas,
  ticks sem end e intervalos inválidos. Tick perdido não inventa amostra zero;
  timeout sem end mantém custo inferido, explicitando falta de par.
- Duplicidade/reset/gaps/fronteiras não geram gasto falso; limites inválidos
  não viram zero. Resíduos negativos continuam visíveis como inconsistência.
- cpuTop e Memory.stats.cpu.accounting compartilham a avaliação. Exporter
  genérico existente entrega os escalares sem novo polling/chamada de API.
- Dashboard local compara média pelo bucket e script pareado; gauge antiga
  fica compatível. Arquivo de dashboard requer aplicação no Grafana externo.
- Não alterar execução das features nem estratégia de serialização neste
  ajuste. Check/smoke/grunt/diff/graphify; ganho/folga real aguardam live.

## Review

Não medir JSON.stringify extra a cada tick nem cobrar o teste duas vezes.
Inferência por conservação não identifica isoladamente GC/serialização/console
ou callbacks do motor; nomes e documentação deixam essa limitação explícita.
Frente a bucket em0/10000 ou intervenção externa, invalidar a inferência.
