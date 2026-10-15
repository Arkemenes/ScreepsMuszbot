# Sincronização financeira sem alterações (ARK-128)

Consultas de reservas chamam craftLedger.sync repetidamente. Mesmo sem novo
negócio, sync recria o registro econômico e escreve saldo/custo/custo vendido.
Além da alocação, `saldo + custo - custo` repete aritmética desnecessária.

Comparar os campos econômicos atuais e os contadores duráveis antes de
escrever. Não cachear por tick: quantidade, preço justo, taxas, confiança e
recebimentos podem mudar no mesmo tick. Preservar migração e reconciliação.
Não remover histórico nem mudar retenção para reduzir Memory sem diagnóstico.

Review: cache temporal falharia com intents simultâneos; comparação direta
preserva atualização imediata. Reset reconstrói pelos contadores existentes.
Validação offline prova ausência de escrita/recriação em consultas repetidas;
ganho live e alvo <15 permanecem pendentes de medição pareada pelo bucket.
