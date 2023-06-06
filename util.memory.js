"use strict";

module.exports = {
    wrap(fn) {
        let memory;
        let tick;

        if (tick && tick + 1 === Game.time && memory) {
            // this line is required to disable the default Memory deserialization
            delete global.Memory;
            Memory = memory;
        } else {
            memory = Memory;
        }

        tick = Game.time;

        fn();

        // there are two ways of saving Memory with different advantages and disadvantages
        // 1. RawMemory.set(JSON.stringify(Memory));
        // + ability to use custom serialization method
        // - you have to pay for serialization
        // - unable to edit Memory via Memory watcher or console
        // 2. RawMemory._parsed = Memory;
        // - undocumented functionality, could get removed at any time
        // + the server will take care of serialization, it doesn't cost any CPU on your site
        // + maintain full functionality including Memory watcher and console

        if (tick % 10000 == 0) {
            global.GCStructureMemory();
        }

        // this implementation uses the undocumented way of saving Memory
        RawMemory._parsed = Memory;
    },
};

// This is called during global reset to set up structure memory,
// because it doesn't need to be called often.
if (!Memory.structures) {
    console.log("[Memory] Initializing structure memory");
    Memory.structures = {};
}

// Adds structure memory to OwnedStructure things.
// Easier to reason about garbage collection in this implementation.
Object.defineProperty(OwnedStructure.prototype, "memory", {
    get: function () {
        if (!Memory.structures[this.id]) Memory.structures[this.id] = {};
        return Memory.structures[this.id];
    },
    set: function (v) {
        return _.set(Memory, "structures." + this.id, v);
    },
    configurable: true,
    enumerable: false,
});

// Call this periodically to garbage collect structure memory
// (I find once every 10k ticks is fine)
global.GCStructureMemory = function () {
    for (var id in Memory.structures)
        if (!Game.structures[id]) {
            console.log(
                "Garbage collecting structure " +
                    id +
                    ", " +
                    JSON.stringify(Memory.structures[id])
            );
            delete Memory.structures[id];
        }
};
