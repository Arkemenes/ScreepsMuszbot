# Plan

## Auditoria sem implementação — 15/10/2026

O usuário suspendeu correções/deploys nesta etapa e pediu diagnóstico amplo e
handoff para outro agente. Plano consolidado, riscos, matriz de escala e lacunas:
[docs/cpu-optimization-plan-2026-10-15.md](../../../docs/cpu-optimization-plan-2026-10-15.md).
Reprodutores isolados em docs/diagnostics; nenhum arquivo de runtime alterado.
Prioridades novas: membership por sala, terminalFuel sem scan global por consulta,
ações duplicadas, consumidores vivos de claims/fuel, labs e custo frio/persistência.
Propostas não equivalem a autorização para mudar política econômica ou publicar
durante a fase de diagnóstico. ARK-128 permanece In Progress; CPU <15 não comprovada.

Resumo de referência: WeakMap por array canônico em market, com campos
length/buyCount/sellCount/buyTick/sellTick. Invalidar no push/poda e substituir
WeakMap no reset; hidratação substitui arrays. API sampleSummary usa provider
samples atual, mas só cacheia o provider canônico. swing.reference usa os
escalares e continua avaliando todas as condições vivas. Testes carregam
coletor real, contam acessos e comparam com referência antiga em cenários
de3/5/10salas, além de ciclo de coleta/poda/hidratação/reset.

Follow-up15/10: extrair cálculo de reservas físicas para helper privado;
`physicalFree` mantém contrato/fast paths, `physicalPool` resolve storage e
terminal na mesma chamada. Integrar somente somas consecutivas existentes
em craftEnergy, craftChain e saleAvailable. Reprodutor com ownKeys/read traps,
contagem de book calls, histórico separado e baseline antes da implementação.

1. Reproduzir buscas frias e repetição de histórico com contadores offline.
2. Extrair índice leve compartilhado por terminalClaims/resourcePolicy e
   terminalOps; filtrar estado atual, invalidar por tick/fonte/nextId.
   GC continua na cadência existente e calcula vínculos uma única vez.
3. Memorizar estados fracassados já explorados por budget na busca labSlots;
   pré-calcular ordens/reachability da topologia fora da recursão.
4. Verificar planos, mudanças no mesmo tick e custo de consultas repetidas.
   Documentar antes/depois e validar build normal; live permanece explícito.
5. Separar política por tick da manutenção no intervalo configurado; eliminar
   consultas caras de venda quando o limite físico já prova lote insuficiente.
6. Compartilhar lista local dos generators em poll; revalidar warming logo após
   hidratação e expor amostras/prontidão para distinguir a espera de E1N47.
