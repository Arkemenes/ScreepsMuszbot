"use strict";
// ROADMAP 0146: a room's exits are map data - Game.map.describeExits never changes
// during a global - so they live on the heap, not in Memory.rooms[x].exits where they
// were re-serialised every tick for every room ever seen.
//   exits(name)  the exits of any room (read-only: callers must not mutate it)
//   known(name)  what the old Memory.rooms[x].exits answered: the exits of a room the
//                bot has already looked at (getIntel), undefined for one it has not.
//                A legacy `exits` field still wins until the cleanup removes it.
const cache = {};

function exits(roomName) {
    let value = cache[roomName];
    if (value === undefined) {
        value = Game.map.describeExits(roomName) || null;
        cache[roomName] = value;
    }
    return value;
}

function known(roomName) {
    const mem = Memory.rooms && Memory.rooms[roomName];
    if (!mem) return undefined;
    if (mem.exits) return mem.exits;
    return mem.lastVisit !== undefined ? exits(roomName) || undefined : undefined;
}

module.exports = { exits, known };
