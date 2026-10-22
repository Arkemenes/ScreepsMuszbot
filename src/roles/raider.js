const combat = require("../utils/combat");
const routing = require("../utils/routing");
const census = require("../utils/census");
const { roomNeeds } = require("../rooms/needs");
const names = require("../utils/names");

// Dispatched at Memory.raidTarget (console raidRoom(), rooms/raiding.js -
// ROADMAP 0032 O2/O4). A single-purpose offensive role, separate from
// defenderStriker/defenderMedic on purpose: that pair is already full
// (D2/D3/O1) and built for holding home ground, not for travelling to
// fight on someone else's - a raider has none of that (no partner, no
// rampart-tanking, no mop-up), just travel + fight + retire. Reuses
// utils/combat.js's shared primitives either way (constitution §5).

function getBody(energy) {
    // RANGED_ATTACK + MOVE, 1:1, MOVE last (same D1 reasoning - protect
    // the ability to retreat longest). No HEAL: a raid is meant to be
    // quick and cheap; if it needs sustained healing it probably
    // shouldn't have been sent without a real squad (ROADMAP 0032 Fase 4).
    const unitCost = BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
    const n = Math.max(1, Math.min(20, Math.floor(energy / unitCost)));
    const body = [];
    for (let i = 0; i < n; i++) body.push(RANGED_ATTACK);
    for (let i = 0; i < n; i++) body.push(MOVE);
    return body;
}

// Memory.defendTarget (ROADMAP 0173) is assigned to `roomName` and no
// defending raider is alive for that room - also read by rooms/needs.js.
function defendPending(roomName) {
    const target = Memory.defendTarget;
    if (!target || target.from !== roomName) return false;
    return !census.all("raider").some(
        (c) => c.memory.mission === "defend" && c.memory.targetRoom === target.room
    );
}

const raider = {
    run(creep) {
        combat.silenceAttackAlerts(creep); // ROADMAP 0052 - fighting on someone else's ground is the whole job here
        const targetRoomName = creep.memory.targetRoom;
        if (!targetRoomName) {
            creep.suicide();
            return;
        }

        if (creep.room.name !== targetRoomName) {
            routing.travelToRoom(creep, targetRoomName, { range: 20, reusePath: 30 });
            return;
        }

        const hostiles = combat.threats(creep.room);
        if (hostiles.length) {
            combat.shoot(creep, hostiles);
            // a raider doesn't hold ground like the defender pair - it
            // just needs to not get chewed up by melee it didn't expect
            if (
                _.some(hostiles, (h) => combat.hasMelee(h) && creep.pos.getRangeTo(h) <= 1)
            ) {
                combat.kiteAwayFrom(creep, hostiles);
            }
            return;
        }

        // ROADMAP 0173: defending one of my own rooms - creeps only, never the
        // previous owner's structures (they're salvage, 0169). Room clean:
        // close the request and park by the controller, still guarding it
        // until the creep dies of old age.
        if (creep.memory.mission === "defend") {
            if (Memory.defendTarget && Memory.defendTarget.room === targetRoomName) {
                delete Memory.defendTarget;
            }
            const controller = creep.room.controller;
            if (controller && creep.pos.getRangeTo(controller) > 3) {
                creep.moveTo(controller, { range: 3, reusePath: 20 });
            }
            return;
        }

        // O3 (ROADMAP 0036): harassing a targetEnemy's remote is about
        // denying their economy (reserver/miner/hauler - all unarmed, so
        // they never show up in combat.threats() above), never about
        // structures - a remote by definition has nothing hostile-owned
        // worth dismantling, and going near a real base isn't this
        // mission's job (that's raidRoom/raidSquad).
        if (creep.memory.mission === "harass") {
            const target = creep.room.find(FIND_HOSTILE_CREEPS)[0];
            if (target) {
                const range = creep.pos.getRangeTo(target);
                if (range > combat.KITE_RANGE) {
                    creep.moveTo(target, { range: combat.KITE_RANGE, reusePath: 10 });
                } else {
                    creep.rangedAttack(target);
                }
                return;
            }
            // nothing to harass right now - low-commitment by design, don't
            // camp someone else's remote waiting for a respawn
            delete Memory.raidTarget;
            creep.suicide();
            return;
        }

        // ROADMAP 0175: live tower / invader core, then spawn, then empty
        // tower - extensions, storage etc. are left intact
        const structureTarget = combat.structureTarget(creep.room, creep.pos);
        if (structureTarget) {
            const range = creep.pos.getRangeTo(structureTarget);
            if (range > combat.KITE_RANGE) {
                creep.moveTo(structureTarget, { range: combat.KITE_RANGE, reusePath: 10 });
            } else {
                creep.rangedAttack(structureTarget);
            }
            return;
        }

        // nothing left to fight here - mission accomplished
        delete Memory.raidTarget;
        creep.suicide();
    },

    wanted(room) {
        return roomNeeds(room).raider;
    },

    spawn(room) {
        if (room.energyAvailable < BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) {
            return false;
        }
        return census.count(room.name, "raider", 0) < this.wanted(room);
    },

    spawnData(room) {
        // a pending defense of my own room (ROADMAP 0173) outranks a raid
        if (defendPending(room.name)) {
            // sized by capacity and blocking (critical): a token defender is
            // exactly what the defended room could already spawn on its own
            return {
                name: names.generate("raider"),
                body: getBody(room.energyCapacityAvailable || room.energyAvailable),
                critical: true,
                memory: {
                    role: "raider",
                    targetRoom: Memory.defendTarget.room,
                    mission: "defend",
                    home: room.name,
                },
            };
        }
        const target = Memory.raidTarget;
        return {
            name: names.generate("raider"),
            body: getBody(room.energyAvailable),
            memory: {
                role: "raider",
                targetRoom: target && target.room,
                mission: (target && target.mission) || "raid",
                home: room.name,
            },
        };
    },
};

raider.defendPending = defendPending;
module.exports = raider;
