# Plan

1. Teste isolado de contabilidade por conservação e fronteiras.
2. cpuAccounting: ring buffer de acumuladores reversíveis no heap; begin/end
   pareiam observação do script com balanço disponível no tick seguinte.
3. cpuMeter/main/stats: capturar begin dentro de memory.wrap e end junto da
   média já existente, publicar e imprimir a mesma análise sem mudar execução.
4. Corrigir comentário memory.wrap; ajustar consultas/descrição do grafana.json
   para sinalizar script amostrado versus média e balanço. Validar offline.
