# ScreepsMuszbot

IA para [Screeps](https://screeps.com).

## Desenvolvimento

Este código é **spec-driven** — ver [`specs/`](specs/):

- [`specs/constitution.md`](specs/constitution.md) — as regras que tudo obedece
- [`specs/ARCHITECTURE.md`](specs/ARCHITECTURE.md) — como funciona hoje
- [`specs/ROADMAP.md`](specs/ROADMAP.md) — o que vem a seguir
- [`specs/README.md`](specs/README.md) — o workflow spec → plan → tasks → code

As specs usam prosa em português e âncoras técnicas em inglês/código.

## Build & run

```
npx grunt                              # empacota src/ em dist/main.js  (o que o Screeps roda)
node test/smoke.js [caminho-do-repo]   # smoke test offline (mock de Game/Memory)
```

`dist/main.js` é git-ignored e regenerado a cada mudança.

## Layout

```
src/
  main.js          ponto de entrada do tick
  roles/           um arquivo por role de creep
  rooms/           intel, planejador de cidade, spawning
  structures/      tower, link
  prototypes/      extensões de Creep/Room/RoomObject/RoomVisual
  utils/           census, roomCache, terrain, move, combat, plan, …
specs/             docs de spec-driven-development (comece aqui)
```
