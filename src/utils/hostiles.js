const defaultHostilePlayers = ["Warrobot10"];
const systemHostiles = ["Invader", "Source Keeper"];
const defaultAllies = [
    "vlc6wsw0l",
    "fR1dj",
    "PhilipSchlump",
    "Netloc",
    "Dustinc555",
    "Ricardo306",
    "TimelessTacticianEon",
];

let cacheTick;
let hostileCache = {};

// Allies default to the list above; Memory.settings.allies overrides it (an
// empty array means "no allies").
function allies() {
    const custom = Memory.settings && Memory.settings.allies;
    return Array.isArray(custom) ? custom : defaultAllies;
}

function isAlly(username) {
    return !!username && allies().indexOf(username) !== -1;
}

// The whitelist used OUTSIDE a room we own - Memory.settings.hostilePlayers
// overrides the default (ROADMAP 0012).
function hostilePlayers() {
    const custom = Memory.settings && Memory.settings.hostilePlayers;
    return Array.isArray(custom) ? custom : defaultHostilePlayers;
}

// Opt-in offensive target list (ROADMAP 0032 Fase 3) - empty by default.
// Being hostile (above) never makes a player a valid offensive target on
// its own; O3/O4/O5 only ever consider a player explicitly added here, and
// even then only with a clear advantage (rooms/raiding.js). O2 (invader
// core) never consults this - it's PvE, not a player.
function targetEnemies() {
    const custom = Memory.settings && Memory.settings.targetEnemies;
    return Array.isArray(custom) ? custom : [];
}

function isTargetEnemy(username) {
    return !!username && targetEnemies().indexOf(username) !== -1;
}

// Deliberately broader than combat.js's isArmed() (ATTACK/RANGED_ATTACK
// only, never imported here - would need a require cycle, combat.js itself
// requires this module for getHostiles). That one answers "can this creep
// fight back", which WORK never does. This one answers "is this creep a
// threat inside a room we own", and a pure-WORK creep (a dismantler with no
// ATTACK/RANGED_ATTACK at all) absolutely is one - it can chew through
// ramparts/walls same as any siege unit. Without WORK here, such a creep
// never enters getHostiles()/mem.defenseActive, so every combat role gates
// on `mem.defenseActive ? getHostiles(...) : []` (defender.js,
// defenderStriker.js, defenderMedic.js) and just stands idle at spawn while
// it breaches the base - live case (2026-09-25): a defender that never
// moved since spawning, because the intruder it should've engaged only had
// WORK parts and this check never flagged it hostile in the first place.
function isThreatInOwnRoom(creep) {
    return _.some(
        creep.body,
        (part) =>
            part.type === ATTACK ||
            part.type === RANGED_ATTACK ||
            part.type === WORK
    );
}

// `room` is optional for backward compatibility, but always pass it when
// known - see the room.controller.my branch below (ROADMAP 0012).
function isHostile(creep, room) {
    const username = creep.owner && creep.owner.username;
    if (!username || isAlly(username)) return false;

    // In a room we own, anyone not on the ally list who can actually hurt us
    // counts as hostile - no whitelist needed, this is our own territory.
    if (room && room.controller && room.controller.my) {
        return isThreatInOwnRoom(creep);
    }

    // targetEnemies also counts as hostile outside our own rooms (ROADMAP
    // 0036) - without this, a player only opted into targetEnemies (not
    // also hostilePlayers) was invisible to getHostiles()/mem.enemies/
    // combat.threats() in their own room or remote, so a guard they posted
    // there never showed up as a threat - this affected O4 silently and
    // would've affected O3 (remote harassment) the same way. This only
    // changes detection ("is this hostile"), not the separate "should we
    // attack it" policy in rooms/raiding.js.
    return (
        hostilePlayers().includes(username) ||
        systemHostiles.includes(username) ||
        isTargetEnemy(username)
    );
}

function getHostiles(room) {
    if (cacheTick !== Game.time) {
        cacheTick = Game.time;
        hostileCache = {};
    }

    if (!hostileCache[room.name]) {
        hostileCache[room.name] = room.find(FIND_HOSTILE_CREEPS, {
            filter: (creep) => isHostile(creep, room),
        });
    }

    return hostileCache[room.name];
}

// console: addAlly("name") / removeAlly("name") / listAlly()
global.listAlly = function () {
    console.log("[allies] " + JSON.stringify(allies()));
};
global.addAlly = function (name) {
    if (!Memory.settings) Memory.settings = {};
    const list = Array.isArray(Memory.settings.allies)
        ? Memory.settings.allies.slice()
        : defaultAllies.slice();
    if (list.indexOf(name) === -1) list.push(name);
    Memory.settings.allies = list;
    console.log("[allies] " + JSON.stringify(list));
};
global.removeAlly = function (name) {
    if (!Memory.settings) Memory.settings = {};
    const base = Array.isArray(Memory.settings.allies)
        ? Memory.settings.allies
        : defaultAllies;
    Memory.settings.allies = base.filter((n) => n !== name);
    console.log("[allies] " + JSON.stringify(Memory.settings.allies));
};

// console: addTargetEnemy("name") / removeTargetEnemy("name") / listTargetEnemies()
global.listTargetEnemies = function () {
    console.log("[targetEnemies] " + JSON.stringify(targetEnemies()));
};
global.addTargetEnemy = function (name) {
    if (!Memory.settings) Memory.settings = {};
    const list = targetEnemies().slice();
    if (list.indexOf(name) === -1) list.push(name);
    Memory.settings.targetEnemies = list;
    console.log("[targetEnemies] " + JSON.stringify(list));
};
global.removeTargetEnemy = function (name) {
    if (!Memory.settings) Memory.settings = {};
    Memory.settings.targetEnemies = targetEnemies().filter((n) => n !== name);
    console.log("[targetEnemies] " + JSON.stringify(Memory.settings.targetEnemies));
};

module.exports = { getHostiles, isHostile, isAlly, allies, targetEnemies, isTargetEnemy };
