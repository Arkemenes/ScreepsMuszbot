# Retomada com insumos recuperados e custo atribuível (ARK-127)

## Problema confirmado

E1N47/83651810: nenhum ativo, bucket4748, scan recente, candidatos lucrativos
XLH2O1960 e XKH2O375, mas open-recovered-cost-margin5. Backoff até83653271
atinge somente utrium_bar/XUH2O. recoveredBasis adiciona o spent inteiro de
cada registro estimated quando adota apenas parte, além do valor próprio já
incluído no candidato. Recuperações não são reconciliadas após consumo/venda,
e a soma de X dos registros excede o X físico1205. Isso bloqueia outras receitas.

## Resultado e política de custos

- Recuperação conserva proveniência e quantidades reais após claims válidos;
  a mesma unidade não pertence a dois registros nem a uma cadeia e ao pool.
- Custo confirmado por recurso é atribuído proporcionalmente à quantidade
  adotada. Reprecificação de estoque próprio usa max(custo confirmado,
  oportunidade já incluída), sem somar o mesmo custo duas vezes.
- spent histórico estimated não demonstra custo do recurso residual: pode
  conter outros insumos, consumo/perdas e até planejamento legado. Preservá-lo
  como histórico não atribuível, sem tratá-lo como gasto novo ou repassá-lo
  inteiro ao primeiro consumidor. O lote novo continua pagando custo de
  oportunidade conservador; custos históricos desconhecidos continuam explícitos
  e o lucro realizado permanece estimated/null. Não presumir insumo grátis.
- Sem referência de oportunidade e sem custo comprovado, aguardar com diagnóstico
  de custo desconhecido. Custo confirmado alto ainda pode recusar receita ruim.
- Preview/seleção e abertura usam a mesma avaliação de custo recuperado. Adoção
  acontece uma vez, antes de publicar o novo claim, e guarda origem/qty/confiança.
- Reconciliar sobras sem apagar custo: quantidades sem lastro ficam identificadas
  como removidas; custo conhecido correspondente fica separado do saldo disponível.
- Preservar backoff vigente, energia, caps, cooldown, listagens e lotes de terceiros.

## Revisão

O gasto histórico não desaparece: deixa de ser cobrado novamente como caixa ou
como custo integral de uma fração de material. Histórico sem evidência não é
promovido a confirmado. Não se garante recuperar prejuízo passado em toda nova
receita; o planejamento decide com custos atribuíveis e oportunidade atual.
Constituição: census/roomCache, Memory só contadores/proveniência e loops finitos.

## Critérios de aceitação

1. Adotar X375 de legacy X900/spent847543 não acrescenta847543 ao candidato já
   avaliado com custo de oportunidade; histórico segue preservado e estimado.
2. Custo conhecido X100=2000/adotar25 transfere500 uma vez; oportunidade incluída
   é descontada do incremento; custo alto mantém veto econômico legítimo.
3. Pool X900+1045 com físico1205 limita total1205; listing/ativos são protegidos.
   Consumo posterior reduz pool sem aumentar saldo e sem apagar base histórica.
4. Preview/reset não adotam; adoção repetida do mesmo ID não consome novamente;
   duas novas cadeias não adotam a mesma quantidade.
5. Cadeia com insumo estimated não vira lucro confirmado ao concluir/abortar.
6. Smoke reproduz falha antes do fix e testa abertura efetiva de cadeia de labs.
