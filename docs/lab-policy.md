# Política de produção de labs — 0127 / ARK-98

A política escolhe o melhor candidato avaliado para o estado atual. Usa os 596
planos da pesquisa de 1.950 cenários, incluindo referências, pipelines parciais,
vários intermediários produzindo/fornecendo e reutilização durante cooldown.
Não promete ótimo global. As provas dos 18 casos pequenos do relatório valem
para aquele modelo instantâneo, não para a logística real da sala.

## Seleção e execução

`utils/labPolicyData.js` é gerado de `docs/lab-search-results.json` por:

```powershell
rtk proxy node docs/lab-search/generate-policy.cjs
```

O catálogo contém planos/alternativas, índices de cenários e fingerprint da
pesquisa. Não contém traces ou os resultados completos. Fica no heap junto com
geometria, cache e generators de avaliação. O bundle aumenta cerca de 0,6 MB.

Produto, lote, topologia e logística priorizam os candidatos conhecidos; a
referência `wide-live` sempre participa. Quantidades fora da matriz, estoques
intermediários e cooldowns são reavaliados no **mesmo motor físico puro usado
pela pesquisa**, com targets individuais. Nenhuma escolha usa somente a linha
mais próxima da tabela. Subconjuntos sem catálogo também recebem referência
larga com pares geometricamente válidos na topologia real.

A avaliação roda em fatias: oito candidatos, até 50.000 iterações por candidato,
1.000 passos e 1 CPU por tick, compartilhados entre salas. Após 100 ticks de
planejamento, pode começar pelo melhor concluído ou pela referência válida;
outros candidatos continuam sendo avaliados. Limites/fallback aparecem no
estado. A CPU de uma operação indivisível pode ultrapassar o orçamento; não é
uma garantia de tempo rígida. Bucket baixo suspende avaliação adicional.

Um item de craft guarda apenas targets, ID do plano, cursores, papéis e saldos.
O executor escolhe alternativas segundo cooldown/movimento, muda cada lab após
drenar mineral incompatível e reaproveita labs liberados. Inputs durante
cooldown são permitidos. Haulers respeitam os buffers, priorizam dreno de
conflito e redirecionam carga cujo destino mudou de função. Buffers consumidos
localmente ficam protegidos contra dreno; outputs finais são liberados para
venda pelas regras já existentes.

Reações compartilham snapshot/reservas por sala e tick. Um mesmo reagente não
pode ser consumido duas vezes, nem um intermediário recém-produzido usado no
mesmo tick. `OK` apenas registra intenção; cooldown novo no tick seguinte
confirma cinco unidades. Perda da confirmação ou power concorrente bloqueia a
política, informa `confirmation-lost` e deixa o stall guard cancelar com os
materiais preservados. Não fabrica progresso para compensar incerteza.

## Logística e configuração

Vazão B é observada nas interfaces, incluindo ticks de demanda sem movimento.
Demanda considera abastecimento solicitado/em trânsito e outputs aptos a dreno,
sem confundir espera por cooldown ou produção local com trabalho de transporte.
O cálculo desconta a transformação das reações confirmadas e considera troca
de mineral, evitando confundir produção com transporte. D estima preparação
residual de papel após descontar movimento/B; cooldown de produção não é
contado como atraso de troca. O executor não introduz esperas artificiais de D.
São aproximações agregadas, não simulação de rotas, concorrência ou destino
cheio. Cargo da cadeia é contado como estoque futuro; sua chegada exata não é
simulada. Buffers usam dois níveis: abastecer abaixo de metade e continuar até
o alvo, em vez de mandar um hauler buscar cinco unidades após cada reação.
O avaliador usa a mesma histerese; a pesquisa mantém seu default anterior.

Até medir logística, B=4 e D=50 são premissas conservadoras. Pipelines com
produção/consumo simultâneos exigem 100 amostras de demanda, override explícito
de B/D ou `policyAllowUnmeasuredPipeline`. A referência larga e rotação de papéis
continuam disponíveis antes disso. Valores de modelo podem ser configurados
em `Memory.settings.craft`; defaults estão em `utils/config.js`:

| Chave | Default | Uso |
|---|---:|---|
| `labPolicy` | `true` | Habilita política em `labStrategy: auto/policy` |
| `policyBandwidth` | `0` | Observado; número positivo fixa B; `instant` remove limite |
| `policySwitchDelay` | `null` | Observado; número fixa D no avaliador |
| `policyBuffer` | `500` | Buffer agregado dividido entre cópias do mesmo reagente |
| `policyRefillRatio` | `0.5` | Nível que inicia reposição; completar até o buffer alto |
| `policyAllowUnmeasuredPipeline` | `false` | Permite pipelines antes de calibrar |
| `policyCandidates` | `8` | Candidatos por avaliação, incluindo referência |
| `policyWorkPerTick` / `policyCpuPerTick` | `1000` / `1` | Orçamento global por tick |
| `policyPlanningTicks` | `100` | Prazo para iniciar com resultado parcial/fallback |
| `policyReplanTicks` | `500` | Intervalo mínimo entre reavaliações em barreiras |

Overrides `labStrategy: wide/waves` preservam o modo legado. `labPolicy: false`
desativa novas filas otimizadas; uma política em execução termina a janela e
passa à referência larga. Não altera `craft.test`, compras, vendas ou boosts.
Labs inativos e `Memory.rooms[room].labBoostReservations[id]` são excluídos;
labs com `labLoad` manual também permanecem reservados. Powers suspendem a
execução otimizada.

## Migração e observabilidade

Filas antigas preservam a onda iniciada. O sufixo ainda não iniciado migra
automaticamente na barreira, inclusive após `craftReplan(room)`. Estoques e
intermediários existentes são capturados no novo estado. Reações manuais
suspendem a cadeia e continuam respeitando snapshot compartilhado; uma reação
manual seleciona o par com mais saídas válidas, excluindo reservas para boost.
Um fallback largo pode ser reavaliado durante o lote em um tick sem intents
pendentes, preservando os saldos confirmados. Isso permite adotar um candidato
melhor quando a avaliação terminar, sem prender o lote inteiro na referência.
Replanejar exige ganho projetado que cubra o orçamento de planejamento.

`craftStatus()` mostra `labPolicies`: estado/ID da escolha, estimativa, catálogo,
saldo, atribuições/reactions, limites da avaliação, medições B/D e espera por
`cooldown`, `input`, `capacity`, `switch`, `reservation`, `unavailable`, `powers`
ou `confirmation-lost`. Candidatos financeiros identificam estimativa avaliada
ou `legacy-reference`. Preflight supõe compra dos insumos faltantes e acrescenta
o orçamento de planejamento à estimativa; o executor reavalia estoque e
cooldowns após a compra. Catálogo/motor são compartilhados, mas o estado pode
mudar entre esses momentos.

## Verificação

Smoke testa execução real dos adaptadores: múltiplos intermediários em dupla
função, falha após `OK`, consumo compartilhado, snapshot, estoque prévio, lote
fora da matriz, cooldown, reset de heap, topologia parcial/indisponibilidade,
limites do avaliador, abastecimento/dreno do hauler, craft e migração legada.
Todos os 1.950 vencedores são validados geometricamente no catálogo publicado.
Self-test e replays da pesquisa conferem a extração do motor compartilhado.

Não há medição de ganho de CPU/produção no servidor nesta entrega. O ganho em
ticks continua sendo evidência do modelo offline, descrita em
[lab-search-report.md](lab-search-report.md). Código/build locais não publicam
configurações ou um deploy no servidor.
