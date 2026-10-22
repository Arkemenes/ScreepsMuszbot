// Which room is worth raiding, and the console surface (raidRoom,
// raidSquad) to dispatch it. Mirrors rooms/remotes.js's role for remote
// mining - this module is the single place that decides room-level
// offensive eligibility (constitution §6); roles/raider.js and the squad
// roles (defenderStriker/defenderMedic/squadDismantler in squad mode)
// only execute.
//
// Two cases share one gate (refusalReason): O2 (PvE - a neutral room with an
// invader core or other hostile presence, never checked against
// targetEnemies) and O4 (a player room, but ONLY one already added to the
// opt-in utils/hostiles.targetEnemies list, and only when it looks weak
// enough to raid safely - see isWeakEnemyRoom). ROADMAP 0032 Fase 3/4.
// O3 (remote harassment, ROADMAP 0036) is shaped differently - the target
// is a reserved-not-owned remote, not an owned/neutral room - so it gets
// its own gate (remoteRefusalReason/isEnemyRemote) below.

const config = require("../utils/config");
const assembly = require("../utils/squadAssembly");
const { isTargetEnemy, isAlly } = require("../utils/hostiles");
const remotes = require("./remotes");
const defenderStriker = require("../roles/defenderStriker");
const defenderMedic = require("../roles/defenderMedic");
const squadDismantler = require("../roles/squadDismantler");

// A targetEnemy's room, scouted, with no tower/hostile seen and a low
// enough RCL to be worth the risk. Intel can be stale (last observation,
// not live) - accepted risk, see spec 0032's O4 "Contras".
// ROADMAP 0176: a 4-creep squad with 2 medics (opts.squad) can take what a
// solo, heal-less raider can't - up to raiding.squadMaxTowers towers (1),
// and RCL only capped by raiding.squadMaxTargetRcl (8: towers are the real
// threat, not the level). Hostile creeps seen still refuse either way.
function weakLimits(opts) {
    const squad = !!(opts && opts.squad);
    return {
        towers: squad ? config.get("raiding.squadMaxTowers", 1) : 0,
        rcl: squad ? config.get("raiding.squadMaxTargetRcl", 8) : config.get("raiding.maxTargetRcl", 3),
    };
}

function isWeakEnemyRoom(roomName, opts) {
    const mem = Memory.rooms[roomName];
    if (!mem || !mem.lastVisit) return false;
    if (!mem.owner || !isTargetEnemy(mem.owner)) return false;
    const limits = weakLimits(opts);
    if ((mem.enemies || 0) > 0) return false;
    if ((mem.numberOfTowers || 0) > limits.towers) return false;
    if ((mem.controllerLevel || 0) > limits.rcl) return false;
    return true;
}

// The first known weak targetEnemy room, or null. Cheap - just scans
// already-known Memory.rooms, no room.find.
function findWeakTarget() {
    for (const name in Memory.rooms) {
        if (isWeakEnemyRoom(name)) return name;
    }
    return null;
}

// Shared by raidRoom() and raidSquad() - same "is this room fair game"
// rule, with the squad's looser strength limits (opts.squad, ROADMAP 0176).
// Returns null when OK, or a reason string when refused.
function refusalReason(targetRoomName, opts) {
    const tmem = Memory.rooms[targetRoomName];
    if (!tmem || !tmem.lastVisit) {
        return "hasn't been scouted yet - can't raid it";
    }
    if (tmem.my) {
        return "is already mine";
    }
    if (tmem.owner) {
        if (!isTargetEnemy(tmem.owner)) {
            return `is owned by ${tmem.owner}, not in targetEnemies - refusing`;
        }
        if (!isWeakEnemyRoom(targetRoomName, opts)) {
            const limits = weakLimits(opts);
            return "doesn't look weak enough to raid safely " +
                `(seen: ${tmem.numberOfTowers || 0} tower(s), ${tmem.enemies || 0} hostile creep(s), ` +
                `RCL ${tmem.controllerLevel || 0}; limits: ${limits.towers} tower(s), 0 creeps, RCL ${limits.rcl}) - refusing`;
        }
        return null;
    }
    if (!tmem.hasInvaderCore && !(tmem.enemies > 0) && !(tmem.enemyStructures > 0)) {
        return "has nothing hostile to raid";
    }
    return null;
}

// A targetEnemy's REMOTE - scouted, unowned (someone's base is raidRoom's
// job, not this one), currently reserved by them, and no hostile seen there
// (a guarded remote isn't the "clear advantage, low risk" case O3 is for -
// see spec.md). mem.enemies now correctly reflects a targetEnemy's own
// guard even outside their owned room, since utils/hostiles.isHostile() was
// fixed to recognize targetEnemies outside our own rooms too (ROADMAP 0036).
function isEnemyRemote(roomName) {
    const mem = Memory.rooms[roomName];
    if (!mem || !mem.lastVisit) return false;
    if (mem.my || mem.owner) return false;
    const reservedBy = mem.reservation && mem.reservation.username;
    if (!isTargetEnemy(reservedBy)) return false;
    if ((mem.enemies || 0) > 0) return false;
    return true;
}

// O3's own gate - separate from refusalReason() above because the shape of
// "is this fair game" is different (reserved-not-owned vs. owned/PvE).
function remoteRefusalReason(targetRoomName) {
    const tmem = Memory.rooms[targetRoomName];
    if (!tmem || !tmem.lastVisit) {
        return "hasn't been scouted yet - can't harass it";
    }
    if (tmem.my || tmem.owner) {
        return "is someone's owned room, not a remote - use raidRoom for that";
    }
    const reservedBy = tmem.reservation && tmem.reservation.username;
    if (!reservedBy) {
        return "isn't reserved by anyone right now";
    }
    if (!isTargetEnemy(reservedBy)) {
        return `is reserved by ${reservedBy}, not in targetEnemies - refusing`;
    }
    if ((tmem.enemies || 0) > 0) {
        return "has a hostile creep present - doesn't look undefended, refusing";
    }
    return null;
}

// ROADMAP 0045/0046 note: contestRoom (below) is the only place that
// *wants* an owned/reserved-by-someone-else room - claimRoom/reserveRoom
// (rooms/remotes.js) refuse that on purpose. Never automatic (no
// autoRaid-style opt-in) - the player types this deliberately.
function contestRefusalReason(targetRoomName) {
    const tmem = Memory.rooms[targetRoomName];
    if (!tmem || !tmem.lastVisit) {
        return "hasn't been scouted yet - can't contest it";
    }
    if (tmem.my) {
        return "is already mine";
    }
    const holder = tmem.owner || (tmem.reservation && tmem.reservation.username);
    if (!holder) {
        return "isn't owned or reserved by anyone - use claimRoom/reserveRoom instead";
    }
    if (isAlly(holder)) {
        return `is owned/reserved by ${holder}, an ally - refusing`;
    }
    if (!isTargetEnemy(holder)) {
        return `is owned/reserved by ${holder}, not in targetEnemies - refusing`;
    }
    if (tmem.hasController === false) {
        return "has no controller to contest (highway/SK/center room)";
    }
    const status = Game.map.getRoomStatus && Game.map.getRoomStatus(targetRoomName);
    if (status && status.status !== "normal") {
        return `isn't available to contest (status: ${status.status} - novice/respawn ` +
            "zone protection, or out of bounds)";
    }
    return null;
}

// --- console --------------------------------------------------------
//   raidRoom("W2N5")            -> mother = nearest owned room
//   raidRoom("W2N5", "W1N1")    -> explicit mother room
global.raidRoom = function (targetRoomName, motherRoomName) {
    const reason = refusalReason(targetRoomName);
    if (reason) {
        console.log(`[raiding] ${targetRoomName} ${reason}`);
        return;
    }

    if (Memory.raidTarget) {
        console.log(
            `[raiding] a raid is already pending: ${Memory.raidTarget.room} ` +
                `(from ${Memory.raidTarget.from})`
        );
        return;
    }

    const mother = motherRoomName || remotes.nearestOwnedRoom(targetRoomName);
    if (!mother) {
        console.log(`[raiding] no owned room found to raid ${targetRoomName} from`);
        return;
    }

    Memory.raidTarget = { room: targetRoomName, from: mother };
    console.log(`[raiding] ${mother} will raid ${targetRoomName}`);
};

// --- console: harass a targetEnemy's remote (ROADMAP 0036, O3) ----------
// Denies economy (kills their reserver/miner/hauler), never touches a
// structure, never enters an owned room - see isEnemyRemote() above.
//   raidRemote("W2N5")            -> mother = nearest owned room
//   raidRemote("W2N5", "W1N1")    -> explicit mother room
global.raidRemote = function (targetRoomName, motherRoomName) {
    const reason = remoteRefusalReason(targetRoomName);
    if (reason) {
        console.log(`[raiding] ${targetRoomName} ${reason}`);
        return;
    }

    if (Memory.raidTarget) {
        console.log(
            `[raiding] a raid is already pending: ${Memory.raidTarget.room} ` +
                `(from ${Memory.raidTarget.from})`
        );
        return;
    }

    const mother = motherRoomName || remotes.nearestOwnedRoom(targetRoomName);
    if (!mother) {
        console.log(`[raiding] no owned room found to harass ${targetRoomName} from`);
        return;
    }

    Memory.raidTarget = { room: targetRoomName, from: mother, mission: "harass" };
    console.log(`[raiding] ${mother} will harass ${targetRoomName}'s remote`);
};

// --- console: siege an already-claimed/reserved targetEnemy room -------
// (ROADMAP 0046, old_1 parity) - a slow, deliberate attackController()
// grind, never automatic. A creep with a CLAIM part is capped at
// CREEP_CLAIM_LIFE_TIME (600 ticks) - dying mid-siege is expected, not a
// dead end (unlike the claim mission, 0035), so roles/reserver.js and
// rooms/needs.js keep respawning a replacement until the controller goes
// neutral or the player calls cancelContest().
//   contestRoom("W2N5")            -> mother = nearest owned room
//   contestRoom("W2N5", "W1N1")    -> explicit mother room
global.contestRoom = function (targetRoomName, motherRoomName) {
    const reason = contestRefusalReason(targetRoomName);
    if (reason) {
        console.log(`[raiding] ${targetRoomName} ${reason}`);
        return;
    }

    if (Memory.contestTarget) {
        console.log(
            `[raiding] a contest is already pending: ${Memory.contestTarget.room} ` +
                `(from ${Memory.contestTarget.from})`
        );
        return;
    }

    const mother = motherRoomName || remotes.nearestOwnedRoom(targetRoomName);
    if (!mother) {
        console.log(`[raiding] no owned room found to contest ${targetRoomName} from`);
        return;
    }

    // Same reachability rule as claimRoom() (ROADMAP 0033) - any body with
    // a CLAIM part is capped at CREEP_CLAIM_LIFE_TIME, not the usual 1500.
    const hops = remotes.roomDistance(mother, targetRoomName);
    const estimatedTicks = hops * config.get("claim.ticksPerRoomHop", 50);
    const margin = config.get("claim.travelMargin", 10);
    const budget = CREEP_CLAIM_LIFE_TIME - margin;
    if (estimatedTicks > budget) {
        console.log(
            `[raiding] ${targetRoomName} is too far from ${mother} for a CLAIM creep to ` +
                `survive the trip (~${estimatedTicks} ticks estimated, ${budget} available) - ` +
                "pick a closer mother room"
        );
        return;
    }

    Memory.contestTarget = { room: targetRoomName, from: mother };
    console.log(
        `[raiding] ${mother} will contest ${targetRoomName} - this is a slow siege ` +
            "(attackController), expect several creep lifetimes; cancelContest() to stop"
    );
};

// --- console: defend one of my own rooms from another (ROADMAP 0173) ----
// A young room (RCL 1-2) can only spawn token defenders; this sends a raider
// sized by the mother's energy. mission "defend" fights hostile creeps only -
// never the previous owner's structures (salvage, 0169) - then parks in the
// room until it dies, still defending. A dead defender is replaced while
// Memory.defendTarget stands; the raider clears it once the room is clean.
//   defendRoom("W9N49")            -> mother = nearest other owned room with a spawn
//   defendRoom("W9N49", "W7N49")   -> explicit mother room
function defendRefusalReason(targetRoomName, motherRoomName) {
    const tmem = Memory.rooms[targetRoomName];
    if (!tmem || !tmem.my) return `${targetRoomName} isn't one of my rooms - use raidRoom for others`;
    if (motherRoomName === targetRoomName) return "the mother room can't defend itself this way";
    const mother = Game.rooms[motherRoomName];
    if (!mother || !mother.controller || !mother.controller.my) return `${motherRoomName} isn't an owned room in vision`;
    if (!mother.find(FIND_MY_SPAWNS).length) return `${motherRoomName} has no spawn`;
    return null;
}

function nearestSpawnRoom(targetRoomName) {
    let best = null;
    let bestDist = Infinity;
    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (name === targetRoomName || !room.controller || !room.controller.my) continue;
        if (!room.find(FIND_MY_SPAWNS).length) continue;
        const dist = remotes.roomDistance(name, targetRoomName);
        if (dist < bestDist) {
            bestDist = dist;
            best = name;
        }
    }
    return best;
}

global.defendRoom = function (targetRoomName, motherRoomName) {
    const mother = motherRoomName || nearestSpawnRoom(targetRoomName);
    if (!mother) {
        console.log(`[defend] no other owned room with a spawn to defend ${targetRoomName} from`);
        return;
    }
    const reason = defendRefusalReason(targetRoomName, mother);
    if (reason) {
        console.log(`[defend] ${reason}`);
        return;
    }
    if (Memory.defendTarget && Memory.defendTarget.room !== targetRoomName) {
        console.log(
            `[defend] replacing the pending defense of ${Memory.defendTarget.room} ` +
                `(from ${Memory.defendTarget.from})`
        );
    }
    Memory.defendTarget = { room: targetRoomName, from: mother };
    console.log(`[defend] ${mother} will send a raider to defend ${targetRoomName}; cancelDefend() to stop`);
};

global.cancelDefend = function () {
    if (!Memory.defendTarget) {
        console.log("[defend] no defense pending");
        return;
    }
    console.log(`[defend] defense of ${Memory.defendTarget.room} cancelled (a raider already out keeps guarding)`);
    delete Memory.defendTarget;
};

global.cancelContest = function () {
    if (!Memory.contestTarget) {
        console.log("[raiding] no contest pending");
        return;
    }
    console.log(`[raiding] contest on ${Memory.contestTarget.room} cancelled`);
    delete Memory.contestTarget;
};

// --- console: a real 2x2 lockstep squad (ROADMAP 0032 Fase 4, O5) -------
//   raidSquad("W2N5", "combat")            -> 2 striker + 2 medic
//   raidSquad("W2N5", "siege", "W1N1")     -> 2 dismantler + 2 medic
const SQUAD_RECIPES = {
    combat: ["defenderStriker", "defenderStriker", "defenderMedic", "defenderMedic"],
    siege: ["squadDismantler", "squadDismantler", "defenderMedic", "defenderMedic"],
};
global.raidSquad = function (targetRoomName, mission, motherRoomName) {
    mission = mission || "combat";
    if (!SQUAD_RECIPES[mission]) {
        console.log(`[raiding] mission must be "combat" or "siege" (got ${mission})`);
        return;
    }

    const reason = refusalReason(targetRoomName, { squad: true });
    if (reason) {
        console.log(`[raiding] ${targetRoomName} ${reason}`);
        return;
    }

    const mother = motherRoomName || remotes.nearestOwnedRoom(targetRoomName);
    if (!mother) {
        console.log(`[raiding] no owned room found to raid ${targetRoomName} from`);
        return;
    }

    const id = assembly.create(mission, targetRoomName, mother, SQUAD_RECIPES[mission]);
    console.log(
        `[raiding] ${mother} assembling ${id}, a ${mission} squad (${SQUAD_RECIPES[mission].join("+")}) ` +
            `for ${targetRoomName}`
    );
    return id;
};

const SQUAD_ROLES = {
    defenderStriker,
    defenderMedic,
    squadDismantler,
};

// The next spawn request to complete this mother's oldest assembly, or null when
// there's nothing pending for this room (or nothing left to spawn - it's
// about to be promoted to a real squad by roles/*'s registerPending()).
function spawnPendingSquad(room) {
    for (const pending of Object.values(assembly.pending())) {
        if (pending.from !== room.name) continue;
        const members = assembly.population(pending);
        const roleName = pending.need.find((role) => members.filter((c) => c.memory.role === role).length <
            pending.need.filter((needed) => needed === role).length);
        if (!roleName) continue;
        const roleLogic = SQUAD_ROLES[roleName];
        if (!roleLogic) continue;
        const data = roleLogic.spawnData(room);
        data.memory.pendingSquad = pending.id;
        return data;
    }
    return null;
}

function hasPendingSquad(room) {
    return Object.values(assembly.pending()).some((entry) => entry.from === room.name);
}

module.exports = {
    isWeakEnemyRoom,
    findWeakTarget,
    isEnemyRemote,
    contestRefusalReason,
    spawnPendingSquad,
    hasPendingSquad,
};
