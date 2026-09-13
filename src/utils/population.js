const census = require("./census");

// Economy roles that make up a room's "ideal" working population.
const ECONOMY_ROLES = ["miner", "hauler", "upgrader", "builder"];

// Sum of the wanted count of every economy role for this room.
function idealPopulation(room) {
    const needs = require("../rooms/needs").roomNeeds(room);
    return _.sum(ECONOMY_ROLES, (role) => needs[role] || 0);
}

// How many economy creeps the room currently fields.
function currentPopulation(room) {
    return _.sum(ECONOMY_ROLES, (role) =>
        census.creepsByRole(room.name, role).length
    );
}

// The base is "stable" once it fields more than half its ideal working
// population. At or below 50% we spawn cheap bodies so units come back fast;
// above it we spawn full bodies sized to the room's energy capacity.
function isRoomStable(room) {
    const ideal = idealPopulation(room);
    if (!ideal) return true;
    return currentPopulation(room) > ideal * 0.5;
}

// Repeat `unit` as many times as the room can afford (capped at 50 parts).
// While the room is not stable, return a single `unit` (minimal body).
function scaledBody(room, unit) {
    if (!isRoomStable(room)) return unit.slice();

    const unitCost = _.sum(unit, (part) => BODYPART_COST[part]);
    const times = Math.max(
        1,
        Math.min(
            Math.floor(room.energyCapacityAvailable / unitCost),
            Math.floor(50 / unit.length)
        )
    );

    let body = [];
    for (let i = 0; i < times; i++) {
        body = body.concat(unit);
    }
    return body;
}

module.exports = {
    idealPopulation,
    currentPopulation,
    isRoomStable,
    scaledBody,
};
