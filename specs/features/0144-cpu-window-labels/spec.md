# Janela do cpuTop e tempo desde reset (ARK-128)

cpuTop imprime o acumulador parcial de uma janela de60ticks que se reinicia
na publicação. Os18ticks não são o total desde deploy. Explicitar janela
configurada, ticks desde reset do medidor e primeiro/último Game.time da
janela. Não inferir Game.time de relógio de parede ou assumir shard de1s.

Review: manter semântica do console e médias existentes, apenas acrescentar
metadados de cobertura. Balanço197intervalos continua separado da janela18;
reset manual do medidor também reinicia o total. Sem amostras extras/Memory.
