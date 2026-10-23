# 0185 — Tasks

- [x] T1 `noStorageEconomy.observe`: EMAs, histerese do hauler extra, cooldown dos upgraders — smoke `0185: lasting pressure…`, `0185: a lasting surplus…`.
- [x] T2 `needs.compute` usa o módulo em salas sem storage/links — smoke `0185: a storage-less room without hauler pressure wants 1 hauler`.
- [x] T3 hauler excedente recicla (um por vez, menor TTL) — smoke `0185: with more haulers than wanted…`.
- [x] T4 escopo e Memory — smoke `0185: only rooms without storage…`, `0185: Memory keeps only numbers`.
- [x] T5 testes legados da fórmula de `needs` rodam com a regra desligada (`noStorageEconomy.enabled = false` no bloco).
- [x] T6 `node --check`, smoke verde, `npx grunt`.
- [x] T8 fix 2026-10-23 (W4N49: 3 haulers, wanted 1, ping-pong no buffer): excedente cheio sem destino recicla; saque do storage para consumidor opcional respeita `claimedLoad`; `surplusCooldown` 1500→500 — smoke `0185: an excess hauler full with nowhere to deliver recycles too`, `0185: haulers already loading from storage for an optional consumer keep the next one away`, `0185: claimedLoad sums…`.
- [ ] T7 aceite live (W4N49/W9N49): haulers 1–2, upgraders acompanham a sobra — janela longa em ARK-203.
