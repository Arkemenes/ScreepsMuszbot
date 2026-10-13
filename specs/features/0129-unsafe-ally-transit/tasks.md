# 0129 — Tasks

- [x] Rastrear spawn, fila e rota; obter evidência ao vivo de morte pelo aliado.
- [x] Preparar spec e plano; registrar ARK-100.
- [x] Revisar spec conforme pedido do usuário: nenhum nome nos defaults;
  aprendizado temporário com expiração/renovação e bloqueio manual opcional.
- [x] Revisão da spec pelo usuário.
- [x] Adicionar regressões de trânsito/dano ao smoke e comprovar falha inicial.
- [x] Implementar política manual/aprendida e coleta de eventos no intel;
  `node --check` e smoke para os critérios 1–3 e 6.
- [x] Aplicar bloqueios em todos os caminhos de roteamento e invalidar caches;
  `node --check` e smoke para os critérios 4–5.
- [x] Corrigir fase da assinatura fora da origem, sem apagar bloqueios;
  assertion de estabilidade de fase/timeout e smoke verde.
- [x] Documentar console/arquitetura; checks, smoke e build completos.
- [x] Atualizar grafo e concluir ARK-100; informar limite da validação em jogo.

## Validation (2026-10-12)

### Follow-up: bloqueio ignorado pelo motor

- [x] Confirmar intel/detecção em produção e rastrear wrapper de movimento.
- [x] Confirmar `_findPath2` ignora `false` em `costCallback`.
- [x] Reproduzir falha com teste da matriz efetivamente aceita pelo motor.
- [x] Corrigir callbacks compartilhados com matriz integralmente bloqueada.
- [x] Cobrir scout/claimer nos modos normal e nativo; ajustar assertions antigas.
- [x] Concluir syntax checks, smoke, build e atualização do grafo.

Follow-up: checks limpos nos três JS alterados; smoke completo com 6047
assertions e zero falhas; build local de `dist/main.js` concluído. O teste
reproduziu a falha antes da correção e passou com a matriz bloqueada.
Sem deploy nem confirmação do desvio em jogo nesta etapa.


`node --check` limpo nos oito arquivos JavaScript tocados; smoke completo
verde, incluindo eventos de torre/creep, vítima morta, expiração/renovação,
liberação, troca de dono, callbacks, recuo, escape, modo nativo e fase de
assinatura. `npx grunt` produziu `dist/main.js`; `graphify update .` concluído.
Sem deploy/commit e sem validação em jogo real. O incidente anterior narrado
pelo usuário não gera um bloqueio pré-carregado; o detector aprende novos
eventos observáveis após o deploy.
