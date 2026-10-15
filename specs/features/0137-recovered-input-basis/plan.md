# Plano

craftLedger reconcilia recovered contra estoque físico/cargo e commitments,
preservando metadata de itens/base sem lastro. Retorna preview de basis/extra,
confidence e allocations; estimated mantém oportunidade atual e histórico spent.
AdoptId guarda recibo de adoção idempotente, quantidades e custos por recurso.

craftPlanner inclui extra confirmado em candidatos/motivos; craftChain revalida
diferença na abertura, adota antes de criar inventory e aplica increments por
recurso. Finish/abort mantêm confiança estimada de custos recuperados.

Smoke: snapshot sintético E1N47, parcial/duas adoções/reset, estoque/listing,
custo conhecido/desconhecido, abertura de lab e confiança pós-abort. Final:
nodecheck/smoke/grunt com cópia automática/diff/graphify, docs e validação live.

Revisão final: costConfidence por recurso conserva compras/base conhecidas em
lotes mistos; estimatedCosts propaga incerteza dos componentes ao produto. Um
único recoveredCostVersion solicita rescan após migração, sem resetar backoff.
Recibos de adoção usam recoveredKeep e preservam IDs ainda ativos.
