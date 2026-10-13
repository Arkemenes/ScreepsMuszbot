# Plan — 0130

1. Estender `terminalOps.lockConflict` somente para compras automáticas versus
   operações de saída; preservar exclusividade de duas operações de saída.
2. Em `resourcePolicy.commitments`, descontar entradas pendentes vinculadas
   à compra de cada dono, mantendo proteção das compras já recebidas.
3. Pré-validar conflitos em `craftChain.open`; propagar `attempt.error` para
   `craftPlanner` e diagnóstico sem apagar o motivo de recurso existente.
4. Regressões integradas em `test/stockPolicyCases.js` e smoke, incluindo
   listing swing, compra/recebimento e abertura real de craft.
   `roles/hauler.js` limita toda retirada de minerais ao estoque livre de
   carga de saída. Um ledger por source/resource/tick no heap impede retiradas
   concorrentes excederem o limite. Listings fixas financiadas mantêm prioridade
   sobre promessas futuras de produção; somente seu excedente é consumível.
5. Atualizar ARCHITECTURE/ROADMAP, node --check, smoke, grunt e graphify.

## Risks

Reservas futuras não podem tomar material de uma venda antiga; testar cada
recebimento parcial. Não mudar referências/pisos financeiros. Não cancelar
ordens próprias durante a correção. O build deve gerar dist local sem alterar
o diretório do cliente Screeps fora do workspace.
