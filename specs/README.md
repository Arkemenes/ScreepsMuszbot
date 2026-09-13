# Spec-Driven Development

Este projeto é construído spec-first. Código e testes derivam das specs, não o
contrário.

**Idioma:** prosa em português; âncoras técnicas em inglês/código — nomes de
arquivo, identificadores, headers de seção, e as strings de assertion que os
critérios de aceitação referenciam.

## Layout

```
specs/
  constitution.md          Princípios inegociáveis. Leia primeiro.
  ARCHITECTURE.md          Foto do sistema como está hoje.
  ROADMAP.md               Backlog ordenado. A única fonte de "o que vem a seguir".
  templates/
    spec-template.md       O quê & por quê de uma feature.
    plan-template.md       A abordagem técnica.
    tasks-template.md      A lista ordenada e verificável de tarefas.
  features/
    NNNN-short-name/
      spec.md              Obrigatório.
      plan.md              Adicionado no passo Design.
      tasks.md             Adicionado no passo Tasks.
      notes.md             Opcional: pesquisa, decisões, becos sem saída.
```

As pastas de feature são numeradas na ordem de criação (`0007-…`), nunca
renumeradas.

## Workflow

1. **Spec** — copie `templates/spec-template.md` para
   `features/NNNN-name/spec.md`. Preencha o problema, o resultado desejado e
   critérios de aceitação *testáveis*. Adicione uma linha ao `ROADMAP.md`
   (status `spec`).
2. **Review** — uma pessoa lê a spec. Ambiguidades são resolvidas na spec, não
   no código. Status → `ready`.
3. **Plan** — escreva `plan.md`: módulos tocados, módulos novos, formatos de
   dados, como satisfaz a constituição, riscos. Status → `planned`.
4. **Tasks** — escreva `tasks.md`: uma lista ordenada de passos pequenos e
   verificáveis individualmente, cada um terminando numa assertion do smoke ou
   num check manual.
5. **Implement** — faça as tarefas em ordem. Depois de cada uma, rode
   `node --check` + `test/smoke.js`. Mantenha os checkboxes do `tasks.md` em dia.
6. **Done** — `npx grunt` builda; smoke verde; `ROADMAP.md` status → `done`
   com a referência do commit/PR; atualize `ARCHITECTURE.md` se a forma do
   sistema mudou.

## Definition of done (toda feature)

- [ ] todos os critérios de aceitação do `spec.md` atendidos
- [ ] smoke test atualizado, `node test/smoke.js` verde
- [ ] `node --check` limpo em todo arquivo tocado
- [ ] `npx grunt` produz `dist/main.js`
- [ ] `ROADMAP.md` e (se preciso) `ARCHITECTURE.md` atualizados

## Relação com o documento de análise

A análise completa original vive em
`~/.claude/plans/fa-a-uma-an-lise-completa-radiant-engelbart.md` (fora do
repo). O `ROADMAP.md` é a destilação in-repo, canônica, dela. Quando
divergirem, o `ROADMAP.md` vence.
