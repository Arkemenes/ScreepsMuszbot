# Plan — 0128

## Implementation

- Manter o harness anterior como referência reproduzível. Novo modelo offline
  em `docs/lab-search/`: recipes, motor de simulação, geração/busca e runner.
- Estados do motor: tick, stock, labs (tipo/quantidade/cooldown), produção por
  recurso, orçamento de transporte e trace. Interfaces de transporte contam
  cada unidade carregada ou drenada; sem acumular crédito durante ociosidade.
- Enumerar trios do stamp. Gerar layouts de grupos conectados/independentes,
  incluindo cópias de intermediários, entradas compartilhadas e buffers locais.
- Beam de planos em janelas: decisões de subconjunto de etapas/layout, ordem
  topológica e tamanho de janela. Score por tempo projetado, transporte/trocas;
  completar os 64 melhores estados distintos, com limite de expansões.
- Reexecutar candidatos completos no motor físico. Manter referências wide,
  waves e pipeline conhecido, além de variante de reutilização gulosa de labs
  liberados. Vencedor é pelo tempo real simulado, transporte e trocas.
- A variante adaptativa escolhe entre layouts válidos a cada janela pelo
  cooldown restante e custo de mudança, permitindo rotacionar saídas mesmo
  com três labs. Slots em cooldown podem ser entradas, sem resetar cooldown.
- Busca exata pequena independente: estoque agregado com logística instantânea,
  uma reação/tick em três labs, todas receitas executáveis, saídas e espera.
  Cooldown individual e geometria preservados; Dijkstra e dominance seguros.
- Publicar resultados compactos, planos deduplicados e CSV/Markdown por cenário;
  replay por identificador verifica métricas e invariantes.

## Safety / Constitution

Código de pesquisa fora do bundle; sem varreduras do jogo/Memory. Loops limitados,
limites/flags explícitos no runner. Nenhuma migração do bot. Preservar alterações
preexistentes no workspace. Custos e limites documentados, sem chamar heurística
de solução ótima.
