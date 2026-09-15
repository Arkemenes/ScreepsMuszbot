# Instruções do Copilot

Este repositório é spec-driven. Siga o SDD sempre que a mudança não for
trivial.

## Antes de editar

- Para qualquer mudança não trivial, leia primeiro:
  - `specs/constitution.md`
  - `specs/ARCHITECTURE.md`
  - `specs/ROADMAP.md`
  - `specs/README.md`
- Formule uma hipótese local sobre o comportamento e identifique um teste ou
  check que possa refutá-la antes da primeira edição.
- Não comece a implementação de uma feature nova sem uma spec aprovada.

## Fluxo obrigatório para features

Siga esta ordem:

1. Criar `specs/features/NNNN-name/spec.md` usando o template e adicionar a
   linha correspondente em `specs/ROADMAP.md` com status `spec`.
2. Revisar a spec e resolver ambiguidades nela; depois mudar o status para
   `ready`.
3. Criar `plan.md` com módulos tocados, dados, riscos e aderência à
   constituição; depois mudar o status para `planned`.
4. Criar `tasks.md` com passos pequenos e verificáveis.
5. Implementar as tasks em ordem, mantendo `tasks.md` atualizado.
6. Atualizar `ARCHITECTURE.md` quando a forma do sistema mudar e marcar a
   feature como `done` no `ROADMAP.md` apenas após a validação.

## Validação obrigatória

Para toda mudança de código:

- Rodar `node --check` em cada arquivo JavaScript tocado.
- Rodar `node test/smoke.js "$(pwd)"` e manter o smoke verde.
- Rodar `npx grunt` para reconstruir `dist/main.js`.
- Adicionar ou atualizar assertions no smoke para toda mudança de
  comportamento.

Depois da primeira edição substantiva, a próxima ação deve ser uma validação
focada do comportamento alterado, antes de explorar outras áreas ou fazer
edições não relacionadas.

## Exceções

Mudanças triviais, como typo, rename sem alteração comportamental ou guard de
uma linha, podem pular o fluxo completo de spec, mas ainda devem respeitar a
constituição e ser validadas quando aplicável. Se uma mudança inicialmente
trivial revelar alteração de comportamento, pare e retome o fluxo SDD.

## Convenções

- Converse com o usuário em português.
- Escreva prosa de specs em português, preservando âncoras técnicas em
  inglês/código.
- Mantenha comentários de código em inglês.
- Preserve mudanças existentes do usuário e faça alterações mínimas.
- Não faça commit nem crie branch sem pedido explícito.