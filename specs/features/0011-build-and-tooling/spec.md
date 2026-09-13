# 0011 — Build & tooling

- **Status:** spec
- **Analysis refs:** M7

## Problem

- `grunt-scripts/mergeFiles.js` chama `gitDescribeSync()` para um módulo
  `.version`; o projeto não é um repositório git, então `npx grunt` pode
  quebrar dependendo do ambiente.
- `Gruntfile.js` só registra `mergeFiles` — não há task `grunt-screeps` de
  deploy, então o push para o servidor é manual.
- Sem ESLint / Prettier / `jsconfig.json` — o estilo deriva (`var`/`let`, `==`).
- Sem CI e sem script `npm test` para o smoke test.

## Desired outcome

`npm run build` empacota de forma confiável (a versão cai para `"unknown"` fora
de git). `npm run deploy` faz push de `dist/main.js` via `grunt-screeps` usando
credenciais de um `.screeps.json` git-ignored. `npm test` roda `test/smoke.js`.
ESLint + Prettier configurados com os globals do Screeps. `jsconfig.json` para
intellisense do editor.

## In scope

- `try/catch` em volta de `gitDescribeSync()` → `{ hash: "unknown" }`.
- Task `grunt-screeps` + `.screeps.json.example`, `.screeps.json` no
  `.gitignore`.
- Scripts do `package.json`: `build`, `deploy`, `test`, `check`
  (`node --check` sobre `src/`).
- `.eslintrc` (env screeps, extends recommended + prettier), `.prettierrc`
  (casar o estilo atual de 4 espaços), `jsconfig.json`.

## Out of scope

- Consertar todo warning de lint (isso é um sweep de follow-up; entregar a
  config com warnings permitidos).
- GitHub Actions CI (opcional, esticado).
- Migração para TypeScript.

## Acceptance criteria

1. `npx grunt` (ou `npm run build`) tem sucesso sem um diretório `.git`
   presente.
2. `npm run deploy` faz upload de `dist/main.js` dado um `.screeps.json` válido
   (documentado; não rodado em CI).
3. `npm test` sai com 0 quando o smoke test passa, não-zero em falha.
4. `.screeps.json` é git-ignored; `.screeps.json.example` é commitado.
5. `npx eslint src/` roda (warnings ok, sem erros de config).

## Constitution check

- Nenhuma mudança de comportamento em runtime. O fallback de `.version` mantém
  o `main` carregando se algo ler ela.
