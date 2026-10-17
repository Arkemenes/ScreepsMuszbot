# 0155 — Observação final dos labs — Plan

> **Decisão posterior — 16/10/2026:** implementação local autorizada passo a passo no [plano de execução incremental](../../../docs/plano-execucao-incremental-2026-10-16.md). Histórico persistente sofisticado adiado até necessidade demonstrada; cobertura inicial no heap, com lacunas explícitas. Gates operacionais continuam válidos.

- **Status:** planned — execução local autorizada em etapas; não implementada.
- **Issue:** ARK-134; consolidação ARK-141.
- **Revisão documental:** 2026-10-16.
- **Autorização:** implementação local incremental; publicação/ativação e gastos seguem os gates do plano de execução.
- **Contrato:** [spec.md](spec.md). **DAG/aceite:** [planejamento integrado](../../../docs/planejamento-integrado-2026-10-16.md).

## Approach / Modules

labObservation recebe decisão em assignments, resultado de execute e conciliação do executor; labReport só apresenta. Hook final percorre uma vez o conjunto de labs já obtido pelo roomCache e registra ausentes/não alocados, antes de endTick.
coverage da 0157 persiste agregados por regime; não existe segundo relógio/gate de dois dias em labReport.

## Data flow e falhas

Abrir registro efêmero do tick/lab → atualizar decisão e resultado sem contar consulta → fechar classificação principal conforme precedência do spec → agregar denominadores e confirmação por origem.
IntentAccepted/ready/cooldown são estados/proxies; só delta atribuível confirma quantidade. Confirmação tardia antes de fechar contribui à origem; após fechamento unknown é diagnóstico, nunca produção atual ou nova publicação econômica. MetricSet da0157 mantém denominador/qualidade de saída separados do físico. Executor é dono do pending; observador não repete intent.
Labs sem atividade continuam na disponibilidade. Saída manual/boost não integra denominador de output elegível, mas é visível no físico. Intermediário não vira produto final.
Reset conserva resumo confirmado e perde cauda. Off do observador abre gap sem desligar confirmação de operações. Mudança de regime cria coorte nova; dado anterior fica diagnóstico.

## Validation / Rollout

Fixtures por todos os estados e early returns, múltiplas consultas/cache hits, erro após ready, lab não alocado/manual, quantidades variadas, entrega final e replay/tardio.
Utilizações95%/50% têm denominadores explícitos e não aprovam investimento sozinhas. Persistência/gaps/tetos/regras temporais reutilizam as fixtures da 0157; ligar mudança de regime aos setters e descritor real.
labReport(n=1200) e auto-report mostram top3 motivos, quantidades/qualidade, período e limites. Medir overhead live; coletar 48h representativas só após autorização operacional, sem habilitar poder.

## Risks & mitigations

Amostragem só do caminho feliz: hook final próprio e unknown em falta de coleta. Dupla contagem: origem/idempotência. Confundir input com transporte: causa comprovada ou unknown. Cobertura antiga aprovar regime novo: descritor canônico e gate único. Alta utilização sem venda: avaliação da cadeia completa.
