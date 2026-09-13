const { isAlly, getHostiles } = require("../utils/hostiles");

// Ally creeps in the room, found once per room per tick.
let tick = -1;
let cache = {};
function alliesIn(room) {
    if (tick !== Game.time) {
        tick = Game.time;
        cache = {};
    }
    if (!cache[room.name]) {
        cache[room.name] = room.find(FIND_HOSTILE_CREEPS, {
            filter: (c) => c.owner && isAlly(c.owner.username),
        });
    }
    return cache[room.name];
}

var rampart = {
    /** @param {StructureRampart} rampart **/
    run: function (rampart) {
        const allies = alliesIn(rampart.room);

        let open = false;
        if (allies.length && rampart.pos.findInRange(allies, 1).length) {
            // don't open the wall if a real hostile is also standing right there
            const enemies = getHostiles(rampart.room);
            open =
                !enemies.length ||
                rampart.pos.findInRange(enemies, 2).length === 0;
        }

        if (open !== !!rampart.isPublic) {
            rampart.setPublic(open);
        }
    },
};

module.exports = rampart;
