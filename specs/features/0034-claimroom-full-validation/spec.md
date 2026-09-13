# 0034 — claimRoom() validates ownership, controller, and novice/respawn zone

- **Status:** done
- **Depends on:** 0020 (remote mining — `rooms/remotes.js`'s `claimRoom`),
  0033 (claim lifetime check — same function, travel-budget gate)

## Problem

`claimRoom()` had gaps a user Q&A turned up while reviewing what
"conditions" gate a claim: it checked "already mine" but not "already
owned by someone else" (`reserveRoom()`, right above it in the same file,
already does — an inconsistency), never checked whether the target room
even has a claimable controller (highway/Source Keeper/center rooms
don't), and never checked the game's own novice/respawn zone protection
(`Game.map.isRoomAvailable`). Any of these sends a claimer (650 energy,
`[CLAIM, MOVE]`) on a trip that was always going to fail at
`claimController()` — the same wasted-spawn problem 0033 fixed for
distance, for three more permanent, knowable-in-advance reasons.

## Desired outcome

`claimRoom()` refuses up front, with a clear reason logged, for a target
that's owned by another player, has no controller at all, or is blocked
by novice/respawn zone protection — on top of the checks it already had
(scouted, not already mine, no claim already pending, travel budget from
0033). GCL insufficiency stays a warning, not a hard refusal, since it's
the one condition here that can plausibly resolve itself before the
claimer arrives (GCL creeps up from ongoing upgrader work) - unlike the
other three, which are permanent facts about the room.

## In scope

- `rooms/remotes.js`'s `claimRoom()`: three new checks, same shape as the
  existing ones (log + `return`), inserted right after "already mine":
  - `tmem.owner && tmem.owner !== myUsername()` - mirrors `reserveRoom()`'s
    existing check exactly.
  - `tmem.hasController === false` - `rooms/intel.js` already tracks this
    per scouted room; `=== false` (not just falsy) so a room intel hasn't
    populated yet doesn't false-positive.
  - `Game.map.isRoomAvailable(targetRoomName)` - guarded
    (`Game.map.isRoomAvailable && ...`) so a hypothetical environment
    without it degrades to skipping the check instead of throwing
    (constitution §3).

## Out of scope

- Turning the existing GCL warning into a hard refusal - deliberately not
  changed (see Desired outcome).
- Checking novice/respawn zone for `reserveRoom()` too - reservation
  doesn't have the same protection semantics as claiming; not asked for.

## Acceptance criteria

1. `claimRoom()` refuses a target owned by another player
   (`Memory.rooms[x].owner` set to someone else). *(smoke)*
2. `claimRoom()` refuses a target with `Memory.rooms[x].hasController ===
   false`. *(smoke)*
3. `claimRoom()` refuses a target `Game.map.isRoomAvailable()` reports
   unavailable. *(smoke)*
4. None of the above regress the existing "successful claim" / "lifetime
   budget" / "GCL warning" tests. *(smoke, already existing)*

## Constitution check

- **§3 (fail-soft):** the `isRoomAvailable` check is guarded against the
  API being absent instead of assuming it.
- **§5 (roles finos, sem duplicar):** the owner check reuses the exact
  same shape `reserveRoom()` already has, right above it in the same
  file - no new abstraction needed for two call sites this small.

## Outcome

Entregue. Três checks novos em `claimRoom()` (`rooms/remotes.js`), um
stub de `Game.map.isRoomAvailable` no smoke harness. Validado pelo smoke
(252 assertions no total - 3 novas) + `npx grunt`.
