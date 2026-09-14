const { scaledBody } = require("../utils/population");
const { energyPiles } = require("../utils/energy");
const census = require("../utils/census");
const roomCache = require("../utils/roomCache");
const reservations = require("../utils/reservations");
const routing = require("../utils/routing");
const remotes = require("../rooms/remotes");
const pioneering = require("../rooms/pioneering");
const { roomNeeds } = require("../rooms/needs");
const config = require("../utils/config");
const names = require("../utils/names");
const bootstrap = require("./bootstrap");
const { silenceAttackAlerts } = require("../utils/combat");

// Closest source in the target room that still has energy to give.
function nearestMinableSource(creep) {
    return creep.pos.findClosestByRange(FIND_SOURCES, {
        filter: (s) => s.energy > 0,
    });
}

// Ticks until this pioneer would have energy in hand again by mining a
// source right here, vs. by making the round trip home and back. Travel is a
// straight-line range estimate (both legs are already rough estimates, no
// point running PathFinder every tick just to compare two guesses), harvest
// time is capacity / (WORK parts * HARVEST_POWER), capped by what the source
// actually still holds.
function ticksToMineLocally(creep, source) {
    const workParts = _.filter(creep.body, (p) => p.type === WORK).length;
    if (!workParts) return Infinity;
    const travel = creep.pos.getRangeTo(source);
    const fillable = Math.min(
        creep.store.getCapacity(RESOURCE_ENERGY),
        source.energy
    );
    return travel + Math.ceil(fillable / (workParts * HARVEST_POWER));
}

// Round trip estimate (there and back) at the same ticks-per-hop budget
// claimRoom already uses to judge travel (rooms/remotes.js, config
// claim.ticksPerRoomHop) - hop count, not path length, so it's cheap.
function ticksToFetchFromHome(home, targetRoomName) {
    const hops = remotes.roomDistance(targetRoomName, home);
    if (hops === Infinity) return Infinity;
    return 2 * hops * config.get("claim.ticksPerRoomHop", 50);
}

// Rescues an owned room with zero spawns (freshly claimed, or one that lost
// its last spawn) by hauling energy over from a nearby sister room and
// building the spawn's construction site - rooms/architect.js already
// planned/placed that site the moment the room became `my`, nothing else
// ever puts a WORK part there to finish it (ROADMAP 0037).

const pioneer = {
    run(creep) {
        silenceAttackAlerts(creep); // ROADMAP 0052 - rescuing a spawnless room means routine travel to it
        const targetRoomName = creep.memory.targetRoom;
        const home = creep.memory.home;
        if (!targetRoomName || !home) {
            creep.suicide();
            return;
        }

        const spawnBuilt =
            creep.room.name === targetRoomName &&
            roomCache.structuresByType(creep.room, STRUCTURE_SPAWN).length > 0;

        // Spawn's done, and so is everything else the architect placed -
        // mission accomplished. Rather than retiring and waiting for the
        // room's own (now-possible) bootstrap to spawn and grow into itself
        // from scratch, relabel this creep as a bootstrap right here - it's
        // already standing there, already loaded, and its WORK+CARRY+MOVE
        // body is exactly bootstrap's shape (constitution §7, prefer the
        // no-op: don't throw away a working creep just to spawn an
        // equivalent one a few ticks later). Mirrors the harvester->hauler
        // role migration main.js already does (ROADMAP 0014) - just done
        // here instead, since it depends on pioneer-specific state
        // (targetRoomName) main.js has no business knowing about.
        //
        // While the spawn exists but other sites (extensions, containers,
        // roads, ...) are still pending, keep building instead - a fresh
        // room with a spawn and nothing else still can't spawn its own
        // builder for a while, so this WORK part is worth more finishing
        // the base than idling as an early bootstrap.
        if (
            spawnBuilt &&
            creep.room.find(FIND_MY_CONSTRUCTION_SITES).length === 0
        ) {
            creep.memory.role = "bootstrap";
            delete creep.memory.targetRoom;
            delete creep.memory.home;
            delete creep.memory.returning;
            bootstrap.run(creep);
            return;
        }

        // Still home and not full - load up before leaving. The whole point
        // of the trip is to arrive with a full tank, not trickle in energy
        // over many half-empty runs.
        if (
            creep.room.name === home &&
            creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        ) {
            const pile = creep.pos.findClosestByPath(
                reservations.usable(creep, energyPiles(creep.room))
            );
            if (pile) {
                reservations.claim(creep, pile.id);
                if (creep.pos.isNearTo(pile)) {
                    creep.withdraw(pile, RESOURCE_ENERGY);
                } else {
                    creep.moveTo(pile, { reusePath: 5 });
                }
            }
            return;
        }
        reservations.release(creep);

        // Sticky "heading home to refill" flag. Without it, the choice
        // between "go to target" and "go home" is re-derived every tick
        // from creep.room.name alone - fine normally, but when home and the
        // target are a single hop apart the tank can hit empty right by the
        // shared border, and the very next tick's room-name flip (crossing
        // it) flips the decision straight back, then back again next tick:
        // the pioneer visibly ping-pongs in the doorway forever. Latching
        // the decision until the creep is actually home again (classic
        // working-flag hysteresis) breaks that loop.
        if (creep.memory.returning) {
            if (creep.room.name === home) {
                delete creep.memory.returning;
            } else {
                routing.moveToRoom(creep, home, { range: 20, reusePath: 20, realRoute: true });
                return;
            }
        }

        if (creep.room.name !== targetRoomName) {
            routing.moveToRoom(creep, targetRoomName, { range: 20, reusePath: 20, realRoute: true });
            return;
        }

        // Already committed to mining a source right here instead of the
        // round trip home (decided below) - keep at it until full. Sticky
        // for the same reason `returning` is: re-comparing every tick while
        // both estimates drift by ~1 tick would dither.
        if (creep.memory.miningLocal) {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                delete creep.memory.miningLocal;
            } else {
                const source = nearestMinableSource(creep);
                if (source) {
                    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(source, { range: 1, reusePath: 5 });
                    }
                    return;
                }
                // source drained while mining - fall through to the normal
                // decision below with whatever's already in the tank
                delete creep.memory.miningLocal;
            }
        }

        // In the target room. Empty-handed with the job still unfinished -
        // compare mining a source right here against the round trip home
        // for a refill (spawn.js costs 15000 energy total, almost never a
        // single load's worth, so idling isn't an option either way) and
        // commit to whichever is faster.
        if (creep.store[RESOURCE_ENERGY] === 0) {
            const source = nearestMinableSource(creep);
            const mineTicks = source ? ticksToMineLocally(creep, source) : Infinity;
            const fetchTicks = ticksToFetchFromHome(home, targetRoomName);
            if (mineTicks < fetchTicks) {
                creep.memory.miningLocal = true;
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, { range: 1, reusePath: 5 });
                }
                return;
            }
            creep.memory.returning = true;
            routing.moveToRoom(creep, home, { range: 20, reusePath: 20, realRoute: true });
            return;
        }

        const site = spawnBuilt
            ? creep.pos.findClosestByRange(
                  creep.room.find(FIND_MY_CONSTRUCTION_SITES)
              )
            : creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
                  filter: (s) => s.structureType === STRUCTURE_SPAWN,
              })[0];
        if (!site) {
            // architect.js hasn't placed the site yet (still catching up,
            // or bucket-starved) - wait near the middle instead of idling
            // at the room edge where routing dropped it off.
            creep.moveTo(new RoomPosition(25, 25, creep.room.name), { range: 10 });
            return;
        }
        if (creep.pos.inRangeTo(site, 3)) {
            creep.build(site);
        } else {
            creep.moveTo(site, { range: 3, reusePath: 5 });
        }
    },

    // the number of pioneers this room should have out - see
    // rooms/pioneering.js (called through rooms/needs.js, same as every
    // other role's wanted())
    wanted(room) {
        return roomNeeds(room).pioneer;
    },

    spawn(room) {
        return census.count(room.name, "pioneer", 0) < this.wanted(room);
    },

    spawnData(room) {
        return {
            name: names.generate("pioneer"),
            body: scaledBody(room, [WORK, CARRY, MOVE]),
            memory: {
                role: "pioneer",
                targetRoom: pioneering.nextTarget(room),
                home: room.name,
            },
        };
    },
};

module.exports = pioneer;
