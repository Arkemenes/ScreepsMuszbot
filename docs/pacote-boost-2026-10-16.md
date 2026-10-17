# Boosts — pacote local 0149-B

Issues ARK-136 e ARK-140. Continuidade autônoma autorizada em 16/10/2026, após a [fundação 0149-A](entrega-0149-a-2026-10-16.md). Sem deploy, compra ou aplicação automática de boost.

## O que foi desenvolvido

### Retorno por trabalho útil

`boostPolicy.worth` compara dois cenários para o mesmo builder: continuar normal ou receber boost depois do preparo/viagem. Usa o corpo real, as partes selecionáveis pelo motor, TTL restante, demanda finita atribuída ao creep, energia disponível por ação e uma fração explícita de ticks produtivos. Não assume que todo builder trabalha o tempo inteiro.

O modo `fixed` só credita energia evitada quando ambos os cenários concluem o mesmo trabalho. O modo `capacity` só credita trabalho adicional útil e desconta energia adicional; não soma a economia calculada para o trabalho fixo. Build e repair dividem o tempo disponível. Upgrade não recebe benefício de XLH2O. Arredondamento, alvo pequeno e energia parcial seguem o modelo mecânico; taxa fracionária é discretizada para o cenário estimado.

Do benefício são descontados o uso alternativo executável do composto, energia de aplicação, logística e oportunidade do lab. Entrada exige margem de 20%, configurável; avaliação de continuidade pode usar 10% para evitar oscilação. Nova reserva sempre usa a margem de entrada. Resultado continua **estimado**, com validade curta. Custo/demanda/evidência ausentes ou antigos retornam `unknown`, sem aprovação.

### Energia chegando no prazo

`operationalReadiness.evaluate` é um checker puro de oferta mínima e demanda máxima acumuladas. Verifica ambos os lados dos saltos e todas as fronteiras do modelo, com margem inicial20%. Até 16 fronteiras; dados ambíguos, duplicados, antigos ou sem cobertura do horizonte retornam `unknown`. Saldo positivo no fim não encobre falta de energia no começo.

Não é um novo coletor. O contexto ainda precisa demonstrar energia líquida, fontes, canais e prazos, já descontados os compromissos concorrentes. Storage vazio pode ser compatível com entrega sustentável; storage cheio não prova essa entrega. Construção automática desse contexto e admissão compartilhada de combustível futuro continuam pendentes. O checker não concede estoque nem canais por si só.

### Preparação e transporte

`boostLogistics` implementa preparação controlada de **um builder em uma sala**, com XLH2O próprio. Admissão reavalia a política, confere lab livre e disponibilidade física de todas as parcelas antes de gravar o registro canônico. Não usa energia do terminal; o piso inicial de energia do storage é configurável. Não toma lab com reação, desejo/hold de cadeia ou pin manual.

Composto/energia de aplicação na origem, cargo em trânsito e estoque do lab pertencem ao mesmo `labBoostReservations`. `terminalClaims` e `resourcePolicy` descontam essas parcelas nas localizações corretas. O transporte usa os haulers existentes e a prioridade de energia da sala; não cria role. Viagens do mesmo material são deduplicadas. Retirada aceita vira pending, depois cargo confirmado; transferência aceita também aguarda o tick seguinte. Mudança não atribuível encerra a preparação com motivo explícito.

O trabalho normal continua prioritário: coleta de energia pode revogar a preparação opcional, mantendo a operação normal. Jobs antigos não entregam em um lab já liberado ou sob outra geração; devolvem a carga ao estoque.

Off/reset/morte/prazo cancelam preparação, conciliando os transportes submetidos. Recursos não submetidos são liberados; resíduo do lab passa por cleanup mesmo com idle drain desligado. Pin manual assume custódia sem ser removido. Sem limpeza segura, há quarentena; o timeout não devolve lab sujo ao planner. O motivo de encerramento é preservado. Não há histórico crescente: registros automáticos released de outros labs são podados na próxima admissão; entradas externas permanecem externas.

### Núcleo de confirmação do boost

`boostConfirmation` captura um recibo limitado ao corpo inteiro e estoques anteriores e concilia prefixo real, consumo e mudanças externas. Trata aplicação parcial, dano posterior, zero efeito e alteração fora dos índices previstos. Resultado incerto não autoriza reaplicação. Atribuição exige custódia exclusiva do lab e do intent do creep; o chamador futuro precisa demonstrá-la e consumir o recibo uma vez.

Esse módulo está testado isoladamente. **Ainda não está ligado a um executor nativo de boost** e não integra o bundle de runtime. A preparação atual não chama `lab.boostCreep` e não desloca o builder para o lab.

## Controles e superfície de inspeção

Defaults: `boost.enabled=false`, `boost.room=null`, composto XLH2O, prazo de 100 ticks, cleanup de 300 ticks, reavaliação de quarentena de 25 ticks, piso de energia de 100000. Configuração em `Memory.settings.boost`; não há alteração automática dos settings do jogo.

| Comando | Comportamento |
| --- | --- |
| `boostPreview(nome, "XLH2O", count?)` | Previsão mecânica, sem reserva/intents. |
| `boostEvaluate(nome, "XLH2O", context)` | Política estimada com fatos explícitos; sem contexto suficiente, retorna unknown. |
| `boostPrepare(nome, labId, context)` | Só com flag e sala explícitas: reserva/prepara estoque próprio após o gate. Não aplica boost. |
| `boostCancel(sala, labId)` | Cancela preparação e mantém recuperação/cleanup. |
| `boostStatus(sala?)` | Mostra estoque/faltas, pending, estado e motivo; distingue stockPrepared de partes realmente aplicadas. |

O `context` segue o contrato de `boostPolicy`/`operationalReadiness` e inclui evidência atual, demanda atribuída, ações/duty, custos executáveis e envelope de entrega. Constantes, corpo, TTL e tick são relidos pelo adaptador, não aceitos do contexto. Não preencher flags de qualidade ou números favoráveis sem evidência. Os testes usam dados sintéticos declarados; eles não autorizam ativação em produção.

O helper manual antigo `boostCreep` continua existindo, mas gastar manualmente por ele não constitui o piloto automático e não usa o gate econômico. Ele respeita a exclusão de labs reservados.

## CPU e limites práticos

- Política e envelope rodam sob demanda, sem varrer todos os builders por tick.
- Nenhuma nova varredura de `Game.creeps` ou `room.find`; haulers reutilizam census.
- Sem reserva existente, manutenção por sala só confere a presença do campo. Há verificações adicionais pequenas nos caminhos de disponibilidade/energia; não afirmar custo zero.
- Com preparação ativa, manutenção é proporcional aos poucos registros/fontes/transportes da sala piloto. Sem telemetria periódica nova, journal ou infraestrutura persistente de histórico.
- Não há ganho de CPU medido para este pacote. O primeiro teste live deve separar o custo com feature desligada do custo da preparação em uma sala.

## O que falta antes do piloto automático

1. Montar contexto operacional confiável com a observação existente/heap mínimo, sem inventar duty ou renda líquida; integrar a admissão comum de canais/combustível futuro. Os claims desta entrega protegem **estoque físico de composto e energia de aplicação**, não todo o consumo futuro do worker.
2. Fixar/reconfirmar revisão mecânica do servidor e fixtures. Fontes primárias consultadas em master em 16/10: [build](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/build.js), [repair](https://github.com/screeps/engine/blob/master/src/processor/intents/creeps/repair.js), [boost](https://github.com/screeps/engine/blob/master/src/processor/intents/labs/boost-creep.js). Não alegar replay pinado.
3. Integrar escolha do candidato, aproximação curta, revalidação, intent exclusivo e conciliação do boost ao runtime; spawn não espera. O núcleo puro de confirmação não conclui esse item.
4. Testar piloto opt-in em uma sala com composto próprio, comparando custo total/trabalho útil/CPU. Sem compras automáticas ou expansão para outros roles.

## Validação local

Fechamento local: `node --check` nos 19 JS desta etapa; smoke com 11.875 assertions (96 novas sobre 0149-A); build isolado com 126 módulos; diff check e atualização graphify por AST. Cliente real preservado, sem deploy. Hash/evidências em `graphify-out/validation-0149-b/result.json`, smoke.log e build.log. Fixtures usam intents deferidos e verificam estado/recursos no tick seguinte, não a execução imediata de uma chamada OK. Não há validação live ou AC automático concluído somente por essas fixtures.

Bundle local SHA256: `3c66fd55bbd0eb795f31ffa36ec0e61c345c9a0b3f88e716289a07e36234fbfe`. Não copiado ao cliente real.
