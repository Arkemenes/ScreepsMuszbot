# Plano

Follow-up15/10: compartilhar poda recente no terminalOps; mercado recebe
snapshot anterior para labels zero e cache por eventos/expiração. stats
atualiza mercado/rede no caminho leve e publica T3 na cadência completa.
Extrair coletor esparso para mercado/minerais/T3, fechar séries ausentes e
medir cobertura pelo tick real da janela. Ajustar222/233/234/241 preservando
layout e demais painéis; só aplicar externo depois de obter acesso/configuração.

Extrair atualização do Gauge e substituir labels expirados por zero durante
uma coleta, removendo-os na seguinte. Preservar separação por recurso e
idempotência de snapshots. Ajustar somente painel241 do dashboard atual.
Validar Python/exporter/painel, smoke/diff/graphify e build junto ao pacote CPU.
Exporter e dashboard exigem aplicação no ambiente externo ao repo.
