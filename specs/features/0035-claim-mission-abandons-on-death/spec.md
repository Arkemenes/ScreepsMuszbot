# 0035 — A claim mission gives up when its claimer dies, instead of respawning forever

- **Status:** done
- **Depends on:** 0020 (remote mining — `Memory.claimTarget`, `reserver.js`
  mission `"claim"`), 0033/0034 (claimRoom validations — rule out the
  other ways a claim was doomed from the start; this covers the one that
  still slips through: dying in transit)

## Problem

`Memory.claimTarget` only ever gets cleared from inside the claim
creep's own `run()` — on success (`claimController` returns `OK` or an
unrecoverable error) or on a dead end (room turns out to have no
controller). If the creep dies **before** either of those (combat, most
likely, now that 0033/0034 rule out "doomed from the start" cases),
nothing clears `Memory.claimTarget` — `rooms/needs.js`'s `claimPending`
just sees "target still set, no live claim creep" and spawns another one,
forever, silently, with no indication anything went wrong.

## Desired outcome

A claim mission whose creep dies without completing is abandoned after
that one attempt: `Memory.claimTarget` is cleared, and a log line says
why. No infinite respawn loop for a target that keeps killing its
claimer.

## In scope

- `roles/reserver.js`: `run()` sets `Memory.claimTarget.creepSeen = true`
  every tick a `"claim"`-mission creep is alive and running (regardless of
  whether it's reached the target room yet) - a marker that a claimer for
  this mission actually existed at some point.
- `rooms/needs.js`'s `claimPending` (inside `compute()`): if
  `Memory.claimTarget.creepSeen` is set but no live `"claim"`-mission
  reserver exists anymore, the previous one died mid-mission - log why and
  `delete Memory.claimTarget` instead of returning `claimPending = 1`
  again. Without `creepSeen` set yet (first attempt, nothing spawned so
  far), behavior is unchanged (`claimPending = 1`).

## Out of scope

- Retrying automatically with a different mother room / after a cooldown -
  not asked for; the user wants it to stop, not to retry smarter. Can be
  layered on later if wanted (re-run `claimRoom()` manually is already how
  you'd restart it).
- Distinguishing *why* the creep died (combat vs. some other cause) - not
  observable after the fact (the creep is just gone from `Game.creeps`),
  and not needed for the fix to do its job.

## Acceptance criteria

1. `Memory.claimTarget.creepSeen` is unset right after `claimRoom()`
   queues a target. *(smoke)*
2. With no `creepSeen` and no live claim creep, `roomNeeds(room).reserver`
   still wants one spawned (first attempt unaffected). *(smoke)*
3. `reserver.run()` on a `"claim"`-mission creep sets `creepSeen = true`.
   *(smoke)*
4. Once that creep is gone (no longer in `Game.creeps`) without having
   cleared `Memory.claimTarget` itself, the next `roomNeeds()` call:
   wants zero more reservers for it, deletes `Memory.claimTarget`, and
   logs a line naming the abandoned room. *(smoke)*

## Constitution check

- **§2 (Memory pequena):** `creepSeen` is one boolean on an already-tiny,
  single-entry `Memory.claimTarget` object - no growth.
- **§1 (CPU):** no new scan - reuses `census.all("reserver")`, already
  computed for the pre-existing `claimPending` check.

## Outcome

Entregue. `Memory.claimTarget.creepSeen` marker (`reserver.js`), abandon
logic + log in `rooms/needs.js`'s `compute()`. Validado pelo smoke (264
assertions no total - 5 novas: sem `creepSeen` no início, primeira
tentativa ainda spawna, `creepSeen` marcado ao rodar, abandono quando o
claimer some, e o log explicando por quê) + `npx grunt`.
