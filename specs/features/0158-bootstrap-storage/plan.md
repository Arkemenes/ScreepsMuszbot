# 0158 — Plan

1. `utils/bootstrapStorage` identifica o container pelo ID persistido ou tile
   do terminal, prepara `room.storage` e remove somente após saldo e trânsito
   zerados. Sala madura sem ID evita consulta de plano/estruturas adicional.
2. `main` prepara salas próprias sob `guard`, antes de intel/economia. Architect
   deriva o site temporário, libera storage desde RCL 4 e inclui RCL no sinal
   de invalidação de construção. Site temporário incompleto é cancelado em RCL 4.
3. Hauler executa job serializável de migração, com movimento/retirada/entrega
   separados e ledger de retiradas no tick. Novos jobs aguardam consumidores
   essenciais, com exceção da energia que inicia um storage vazio para evitar
   deadlock de abastecimento; carga coletada termina no storage físico. IDs antigos de entrega
   de energia ao container são invalidados após a troca.
4. `rooms/needs` não conta o depósito central duas vezes nem o trata como
   container de source. Controller containers excluem depósito em migração.
5. Smoke cobre planejamento real, integração de logística/economia e transição
   com intents diferidos; build sem copiar automaticamente ao cliente.

Riscos: plano indisponível após reset (ID persistido mantém referência), storage
cheio (preservar carga/container), downgrade (manter depósito enquanto não houver
storage físico), intents diferidos (não destruir antes de observar entrega).
