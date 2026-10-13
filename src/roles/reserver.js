// One role, two missions (memory.mission): "reserve" keeps a remote's
// controller reserved for us (renewable, several can run in parallel - one
// per remote); "claim" permanently takes ownership of a room
// (claimController, single instance empire-wide - like the scout). Both are
// the same body/travel shape, just a different final intent, so they share
// one role instead of two near-duplicates (ROADMAP 0020).

const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const remotes = require("../rooms/remotes");
const routing = require("../utils/routing");
const names = require("../utils/names");
const config = require("../utils/config");
const claimDiagnostics = require("../utils/claimDiagnostics");
const keeperTransit = require("../utils/keeperTransit");
const { silenceAttackAlerts } = require("../utils/combat");

// CLAIM parts beyond this don't help - extra buffer for "reserve" missions
// (more CLAIM = more reservation ticks added per trip), wasted on "claim"
// (claimController only ever consumes one).
const MAX_RESERVE_CLAIM_PARTS = 3;

function reserveBody(room) {
    const unitCost = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE];
    const affordable = Math.floor(room.energyCapacityAvailable / unitCost);
    const n = Math.max(1, Math.min(MAX_RESERVE_CLAIM_PARTS, affordable || 1));
    const body = [];
    for (let i = 0; i < n; i++) body.push(CLAIM);
    for (let i = 0; i < n; i++) body.push(MOVE);
    return body;
}

var reserver = {
    /** @param {Creep} creep **/
    run: function (creep) {
        const mission = creep.memory.mission;
        // ROADMAP 0052: only "contest" routinely sits next to an armed
        // owner/defender for a long siege - "reserve"/"claim" target
        // neutral or already-safe rooms, no need to silence there.
        if (mission === "contest") silenceAttackAlerts(creep);
        const targetRoomName = creep.memory.targetRoom;
        if (!targetRoomName) {
            creep.suicide();
            return;
        }

        // mark that a claim creep is actually out there - see needs.js,
        // which uses this to notice when one disappears (dies) mid-mission
        // instead of respawning a replacement forever
        if (mission === "claim" && Memory.claimTarget) {
            Memory.claimTarget.creepSeen = true;
        }
        claimDiagnostics.observe(creep, creep.room.name === targetRoomName ? "at_target" : "travelling");
        const allowSourceKeepers = mission === "claim" && config.get("claim.keeperTransit", true);
        if (allowSourceKeepers && keeperTransit.evade(creep)) {
            claimDiagnostics.observe(creep, "evading_keeper");
            return;
        }

        if (creep.room.name !== targetRoomName) {
            // claim: blockHostiles below already refuses to CROSS a room
            // with known hostiles on the way there, but findRoute/moveToRoom
            // deliberately never block the destination itself (you have to
            // enter your actual target eventually - contest's whole point is
            // walking into a hostile-owned room, see silenceAttackAlerts
            // above, and reserve targets are already filtered upstream by
            // remotes.pendingReserves()). "claim" is the one mission where a
            // hostile *destination* is still worth waiting out rather than
            // marching an unarmed CLAIM/MOVE body straight into - without
            // this it would walk in and out of that room every time a
            // hostile (re)appears there, never actually claiming anything.
            const hostileTarget =
                mission === "claim" && remotes.hasHostiles(targetRoomName);
            if (!hostileTarget) {
                // never a scout-style exploratory move - always one specific
                // room, so route through highways and completely avoid any
                // room with known hostiles (utils/routing). Also validates
                // the whole trip against real terrain upfront (ROADMAP
                // 0064) - originally scoped to "claim" only (its fixed
                // 600-tick CREEP_CLAIM_LIFE_TIME, ROADMAP 0033, can least
                // afford discovering a dead end reactively, ROADMAP 0063,
                // before reaching the controller), widened to every mission
                // (ROADMAP 0064 same-day) once the pioneer role hit the
                // identical live symptom - a walled intermediate room
                // needing a detour - proving the fix isn't claim-specific;
                // now the default for every moveToRoom() caller (ROADMAP
                // 0075), so the explicit flag is gone.
                const moveStatus = routing.moveToRoom(creep, targetRoomName, {
                    range: 20,
                    reusePath: 30,
                    blockHostiles: true,
                    allowSourceKeepers,
                });
                const phase = moveStatus === ERR_BUSY
                    ? "waiting_cpu" : moveStatus === ERR_NO_PATH ? "no_route" : "travelling";
                claimDiagnostics.observe(creep, phase, moveStatus);
                if (mission === "claim" && Memory.claimTarget && Memory.claimTarget.lastSeen) {
                    Memory.claimTarget.lastSeen.routePlan = routing.planningStatus(creep);
                }
            } else {
                claimDiagnostics.observe(creep, "waiting_hostile_target");
            }

            // stall guard (constitution): blockHostiles correctly refuses to
            // cross a genuinely hostile chokepoint room, and a hostile claim
            // target (above) refuses to even approach it - either way the
            // creep just parks instead of camping silently forever. Warn
            // once instead of doing that without a trace.
            const posKey = creep.pos.x + ":" + creep.pos.y + ":" + creep.room.name;
            if (creep.memory._stallPos === posKey) {
                creep.memory._stallTicks = (creep.memory._stallTicks || 0) + 1;
            } else {
                creep.memory._stallPos = posKey;
                creep.memory._stallTicks = 0;
            }
            if (creep.memory._stallTicks === config.get("routing.claimStallTicks", 50)) {
                console.log(
                    `[reserver] ${creep.name} (mission ${mission}) stuck heading to ` +
                        `${targetRoomName} - ` +
                        (hostileTarget
                            ? "the target room itself has a hostile - waiting for it to clear"
                            : "likely no route avoiding a hostile room")
                );
            }
            return;
        }
        creep.memory._stallTicks = 0;

        const controller = creep.room.controller;
        if (!controller) {
            // nothing to reserve/claim here - the target was a dead end
            if (mission === "claim") {
                claimDiagnostics.finish(creep, "no_controller");
                delete Memory.claimTarget;
            }
            creep.suicide();
            return;
        }

        if (mission === "claim") {
            const status = creep.claimController(controller);
            if (status === ERR_NOT_IN_RANGE) {
                const moveStatus = creep.moveTo(controller, { range: 1, reusePath: 20 });
                claimDiagnostics.observe(creep, "controller_out_of_range", status, moveStatus);
                return;
            }
            claimDiagnostics.finish(creep, status === OK ? "claim_accepted" : "claimController_failed", status);
            // OK, or an unrecoverable error (GCL full, already owned, ...) -
            // the mission is over either way
            delete Memory.claimTarget;
            return;
        }

        // mission === "contest" (ROADMAP 0046, old_1 parity): a deliberate,
        // manual siege on a room already claimed/reserved by someone else.
        // Keep hammering attackController() while it's still theirs; once
        // the controller goes neutral, finish the job like a claim mission.
        // Dying mid-siege (CLAIM parts cap a body at 600 ticks total) is
        // expected, not a dead end - rooms/needs.js just spawns another
        // while Memory.contestTarget is still set, no abandon-on-death
        // check like the "claim" mission has (0035).
        if (mission === "contest") {
            const stillTheirs = !!(controller.owner || controller.reservation);
            if (stillTheirs) {
                const status = creep.attackController(controller);
                if (status === ERR_NOT_IN_RANGE) {
                    creep.moveTo(controller, { range: 1, reusePath: 20 });
                }
                return;
            }
            const status = creep.claimController(controller);
            if (status === ERR_NOT_IN_RANGE) {
                creep.moveTo(controller, { range: 1, reusePath: 20 });
                return;
            }
            // OK, or an unrecoverable error - the siege is over either way
            delete Memory.contestTarget;
            return;
        }

        // mission === "reserve"
        const status = creep.reserveController(controller);
        if (status === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, { range: 1, reusePath: 20 });
        }
    },

    // the number of reservers this room should have (both missions combined)
    // - see rooms/needs.js
    wanted: function (room) {
        return roomNeeds(room).reserver;
    },

    spawn: function (room) {
        if (room.energyAvailable < BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) {
            return false;
        }
        return census.count(room.name, "reserver", 0) < this.wanted(room);
    },

    spawnData: function (room) {
        // a pending claim assigned to this room always wins - it's a rarer,
        // higher-value mission and there's only ever one in flight
        if (
            Memory.claimTarget &&
            Memory.claimTarget.from === room.name &&
            !census
                .all("reserver")
                .some((c) => c.memory.mission === "claim")
        ) {
            return {
                name: names.generate("reserver:claim"),
                body: [CLAIM, MOVE],
                memory: {
                    role: "reserver",
                    mission: "claim",
                    targetRoom: Memory.claimTarget.room,
                    home: room.name,
                },
            };
        }

        // a pending contest (ROADMAP 0046) is next in priority - same tier
        // as claim, just a different final intent. More CLAIM parts than
        // the fixed claim body on purpose: attackController()'s effect
        // scales with CLAIM count, so a bigger body sieges faster.
        if (
            Memory.contestTarget &&
            Memory.contestTarget.from === room.name &&
            !census
                .all("reserver")
                .some((c) => c.memory.mission === "contest")
        ) {
            return {
                name: names.generate("reserver:contest"),
                body: reserveBody(room),
                memory: {
                    role: "reserver",
                    mission: "contest",
                    targetRoom: Memory.contestTarget.room,
                    home: room.name,
                },
            };
        }

        const target = remotes.pendingReserves(room)[0];
        return {
            name: names.generate("reserver:reserve"),
            body: reserveBody(room),
            memory: {
                role: "reserver",
                mission: "reserve",
                targetRoom: target,
                home: room.name,
            },
        };
    },
};

module.exports = reserver;
