// Contention resolver for shared energy piles (drops, tombstones, ruins,
// containers, receiving links, storage).
//
// Three ranks (highest wins a contested pile): pioneer (rescuing a
// spawnless sister room, ROADMAP 0037 follow-up - always wins, whether the
// room is stable or not) > hauler/bootstrap (keep spawn/extensions topped
// up - wins only while the room still needs that) > everyone else (builder,
// upgrader, ...). Within a rank, whoever's closer to a full pile just takes
// it once nothing above them is still hungry.
//
// Claims live in `creep.memory.loadTarget`; the ledger is rebuilt each tick
// from the live creeps, so a dead or re-tasked creep drops out on its own.

// roles that exist to feed spawn / extensions
const ECONOMY_PICKERS = { hauler: true, bootstrap: true };

// pioneer always outranks everyone, stable room or not (ROADMAP 0037
// follow-up) - rescuing a spawnless sister room is scoped, deliberate work
// (rooms/pioneering.js already caps how many at once), it should never lose
// a pile to routine home-room traffic just because spawn/extensions happen
// to already be full.
const TOP_PICKERS = { pioneer: true };

let tick = -1;
let byTarget = {};

function rebuild() {
    if (tick === Game.time) return;
    tick = Game.time;
    byTarget = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        const id = c.memory.loadTarget;
        if (!id) continue;
        // a creep with nothing left to carry isn't really contending
        if (c.store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
        (byTarget[id] || (byTarget[id] = [])).push(c);
    }
}

// 2 = pioneer (always wins), 1 = economy picker (hauler/bootstrap, wins
// while the room isn't stable yet), 0 = everyone else.
function pickerRank(creep) {
    if (TOP_PICKERS[creep.memory.role]) return 2;
    if (ECONOMY_PICKERS[creep.memory.role]) return 1;
    return 0;
}

// spawn + extensions full -> the room can spare energy for building / upgrading
function economyStable(room) {
    return room.energyAvailable >= room.energyCapacityAvailable;
}

function pileEnergy(pile) {
    if (pile.amount != null) return pile.amount;
    if (pile.store) return pile.store[RESOURCE_ENERGY] || 0;
    return 0;
}

// A container / storage / link keeps getting refilled (miner, link network)
// and can hold up to 2000-ish energy, so several creeps can draw from it at
// once without anyone coming up short. A drop / tombstone / ruin is a single
// one-shot puddle - only structures carry `structureType`, so that's the
// split.
function isReplenishing(pile) {
    return !!pile.structureType;
}

// Energy on `pile` still up for grabs for `creep` once the claims that outrank
// it are subtracted. 0 means "leave this one alone".
//   - a pioneer (rank 2) always outranks everyone else, stable room or not:
//       - on a one-shot pile the lower-rank creep yields it whole
//       - on a replenishing store it only gives up what the pioneer still
//         needs, not the whole thing
//     a pioneer itself never yields to a lower rank, ever - only to another
//     pioneer (peer tie-break below)
//   - below that, while spawn / extensions still want energy, an economy
//     picker (hauler / bootstrap, rank 1) outranks a builder / upgrader
//     (rank 0) the same way, but ONLY while the room isn't stable yet -
//     once spawn/extensions are full, rank 1 vs 0 no longer matters
//   - creeps of equal rank split the pile deterministically by name so two
//     builders (or two pioneers) don't both commit to one small drop
function available(creep, pile) {
    rebuild();
    const myRank = pickerRank(creep);
    const stable = economyStable(creep.room);
    const renewable = isReplenishing(pile);
    let energy = pileEnergy(pile);

    for (const other of byTarget[pile.id] || []) {
        if (other.name === creep.name) continue;
        const otherRank = pickerRank(other);

        if (otherRank === 2 && myRank < 2) {
            if (!renewable) return 0; // pioneer outranks me - hands off
            energy -= other.store.getFreeCapacity(RESOURCE_ENERGY);
            continue;
        }
        if (myRank === 2 && otherRank < 2) continue; // I'm the pioneer - ignore their claim entirely

        if (!stable && otherRank !== myRank) {
            if (otherRank > myRank) {
                if (!renewable) return 0; // they outrank me - hands off
                energy -= other.store.getFreeCapacity(RESOURCE_ENERGY);
            }
            continue; // I outrank them (or just discounted them) - move on
        }

        // peers: whoever sorts first keeps their share
        if (other.name < creep.name) {
            energy -= other.store.getFreeCapacity(RESOURCE_ENERGY);
        }
    }
    return Math.max(0, energy);
}

// keep only the piles `creep` is actually allowed to touch this tick
function usable(creep, piles, min = 50) {
    return _.filter(piles, (p) => available(creep, p) >= min);
}

// register / clear `creep`'s intent to load from a pile
function claim(creep, id) {
    creep.memory.loadTarget = id;
    rebuild();
    const list = byTarget[id] || (byTarget[id] = []);
    if (!_.some(list, (o) => o.name === creep.name)) list.push(creep);
}

function release(creep) {
    if (creep.memory.loadTarget) delete creep.memory.loadTarget;
}

module.exports = {
    available,
    usable,
    claim,
    release,
    economyStable,
    ECONOMY_PICKERS,
};
