/* This header is placed at the beginning of the output file and defines the
	special `__require`, `__getFilename`, and `__getDirname` functions.
*/
(function() {
	/* __modules is an Array of functions; each function is a module added
		to the project */
var __modules = {},
	/* __modulesCache is an Array of cached modules, much like
		`require.cache`.  Once a module is executed, it is cached. */
	__modulesCache = {},
	/* __moduleIsCached - an Array of booleans, `true` if module is cached. */
	__moduleIsCached = {};
/* If the module with the specified `uid` is cached, return it;
	otherwise, execute and cache it first. */
function __require(uid, parentUid) {
	if(!__moduleIsCached[uid]) {
		// Populate the cache initially with an empty `exports` Object
		__modulesCache[uid] = {"exports": {}, "loaded": false};
		__moduleIsCached[uid] = true;
		if(uid === 0 && typeof require === "function") {
			require.main = __modulesCache[0];
		} else {
			__modulesCache[uid].parent = __modulesCache[parentUid];
		}
		/* Note: if this module requires itself, or if its depenedencies
			require it, they will only see an empty Object for now */
		// Now load the module
		__modules[uid].call(this, __modulesCache[uid], __modulesCache[uid].exports);
		__modulesCache[uid].loaded = true;
	}
	return __modulesCache[uid].exports;
}
/* This function is the replacement for all `__filename` references within a
	project file.  The idea is to return the correct `__filename` as if the
	file was not concatenated at all.  Therefore, we should return the
	filename relative to the output file's path.

	`path` is the path relative to the output file's path at the time the
	project file was concatenated and added to the output file.
*/
function __getFilename(path) {
	return require("path").resolve(__dirname + "/" + path);
}
/* Same deal as __getFilename.
	`path` is the path relative to the output file's path at the time the
	project file was concatenated and added to the output file.
*/
function __getDirname(path) {
	return require("path").resolve(__dirname + "/" + path + "/../");
}
/********** End of header **********/
/********** Start module 0: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\main.js **********/
__modules[0] = function(module, exports) {
let creepLogic = __require(1,0);
let structureLogic = __require(2,0);
let roomLogic = __require(3,0);
let prototypes = __require(4,0);
let utils = __require(5,0);
utils.profiler.enable();

module.exports.loop = function () {
    utils.profiler.wrap(function () {
        utils.memory.wrap(function () {
            Game.myRooms = _.filter(
                Game.rooms,
                (r) => r.controller && r.controller.level > 0 && r.controller.my
            );
            _.forEach(Game.rooms, (r) => roomLogic.getIntel(r));
            _.forEach(Game.myRooms, (r) => roomLogic.planCity(r));
            _.forEach(Game.myRooms, (r) => roomLogic.spawning(r));
            for (var name in Game.creeps) {
                var creep = Game.creeps[name];
                let role = creep.memory.role;
                if (creepLogic[role]) {
                    creepLogic[role].run(creep);
                }
            }
            for (var name in Memory.creeps) {
                if (!Game.creeps[name]) {
                    delete Memory.creeps[name];
                }
            }
            for (var name in Game.structures) {
                var structure = Game.structures[name];
                let structureType = structure.structureType;

                if (structureLogic[structureType]) {
                    structureLogic[structureType].run(structure);
                }
            }
            for (var name in Memory.structures) {
                if (!Game.structures[name]) {
                    delete Memory.structures[name];
                }
            }
            utils.stats();
        });
    });
};

return module.exports;
}
/********** End of module 0: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\main.js **********/
/********** Start module 1: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\index.js **********/
__modules[1] = function(module, exports) {
let creepLogic = {
    miner: __require(6,1),
    harvester: __require(7,1),
    upgrader: __require(8,1),
    builder: __require(9,1),
    scout: __require(10,1),
};

module.exports = creepLogic;

return module.exports;
}
/********** End of module 1: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\index.js **********/
/********** Start module 2: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\structures\index.js **********/
__modules[2] = function(module, exports) {
let structureLogic = {
    tower: __require(11,2),
    link: __require(12,2),
};

module.exports = structureLogic;

return module.exports;
}
/********** End of module 2: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\structures\index.js **********/
/********** Start module 3: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\index.js **********/
__modules[3] = function(module, exports) {
let roomLogic = {
    spawning: __require(13,3),
    getIntel: __require(14,3),
    planCity: __require(15,3),
};

module.exports = roomLogic;

return module.exports;
}
/********** End of module 3: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\index.js **********/
/********** Start module 4: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\index.js **********/
__modules[4] = function(module, exports) {
__require(16,4);
__require(17,4);
__require(18,4);
__require(19,4);

return module.exports;
}
/********** End of module 4: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\index.js **********/
/********** Start module 5: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\index.js **********/
__modules[5] = function(module, exports) {
let utils = {
    memory: __require(20,5),
    profiler: __require(21,5),
    upgrader: __require(22,5),
    stats: __require(23,5),
};

module.exports = utils;

return module.exports;
}
/********** End of module 5: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\index.js **********/
/********** Start module 6: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\miner.js **********/
__modules[6] = function(module, exports) {
var miner = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (!creep.memory.target) {
            let sources = creep.room.find(FIND_SOURCES);
            for (const source of sources) {
                var miners = _.filter(
                    Game.creeps,
                    (creep) =>
                        creep.memory.target == source.id &&
                        creep.memory.role == "miner" &&
                        creep.room.name == creep.room.name
                );

                var workCount = 0;

                for (var i = 0; i < miners.length; i++) {
                    workCount += miners[i].body.filter(
                        (part) => part.type == WORK
                    ).length;
                }

                if (workCount < 2) {
                    creep.memory.target = source.id;
                    break;
                }
            }
        }

        if (
            creep.harvest(Game.getObjectById(creep.memory.target)) ==
            ERR_NOT_IN_RANGE
        ) {
            creep.moveTo(Game.getObjectById(creep.memory.target));
        }
    },
    spawn: function (room) {
        var miners = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "miner" && creep.room.name == room.name
        );

        var harvesters = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "harvester" && creep.room.name == room.name
        );

        var workCount = 0;

        for (var i = 0; i < miners.length; i++) {
            var creep = miners[i];
            workCount += creep.body.filter((part) => part.type == WORK).length;
        }

        let wantedMinersWorkParts = 2 * room.find(FIND_SOURCES).length;

        if (miners.length < 2 && miners.length <= harvesters.length) {
            return true;
        }
    },
    spawnData: function (room) {
        let name = "Miner" + Game.time;
        var extensions = room.find(FIND_MY_STRUCTURES, {
            filter: { structureType: STRUCTURE_EXTENSION },
        });

        var miners = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "miner" && creep.room.name == room.name
        );

        let body = [MOVE, WORK, WORK, WORK, WORK, WORK];
        if (
            extensions.length < 5 ||
            (miners.length == 0 && room.energyAvailable < 550)
        ) {
            body = [MOVE, WORK, WORK];
        }

        let target = undefined; // the id of the source to harvest from. undefined means that there is no source to harvest from.
        let sources = room.find(FIND_SOURCES);
        for (const source of sources) {
            var miners = _.filter(
                Game.creeps,
                (creep) =>
                    creep.memory.target == source.id &&
                    creep.memory.role == "miner" &&
                    creep.room.name == creep.room.name
            );

            var workCount = 0;

            for (var i = 0; i < miners.length; i++) {
                workCount += miners[i].body.filter(
                    (part) => part.type == WORK
                ).length;
            }

            if (workCount < 2) {
                target = source.id;
                break;
            }
        }

        let memory = { role: "miner", target: target };

        return { name, body, memory };
    },
};

module.exports = miner;

return module.exports;
}
/********** End of module 6: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\miner.js **********/
/********** Start module 7: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\harvester.js **********/
__modules[7] = function(module, exports) {
var harvester = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.store[RESOURCE_ENERGY] == 0) {
            var resource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r) => r.energy >= 50,
            });
            if (resource) {
                if (creep.pickup(resource) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(resource);
                }
            } else {
                creep.memory.target = creep.pos.findClosestByPath(
                    FIND_STRUCTURES,
                    {
                        filter: (s) =>
                            (s.structureType == STRUCTURE_STORAGE ||
                                s.structureType == STRUCTURE_CONTAINER) &&
                            s.store.energy >= 50,
                    }
                );
                if (
                    creep.withdraw(creep.memory.target, RESOURCE_ENERGY) ==
                    ERR_NOT_IN_RANGE
                ) {
                    creep.moveTo(creep.memory.target);
                }
            }
        }
        else {
            if (!creep.memory.target) {
                let target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: (s) =>
                        (s.structureType == STRUCTURE_SPAWN ||
                            s.structureType == STRUCTURE_EXTENSION) &&
                        s.energy < s.energyCapacity,
                });

                if (!target) {
                    target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) =>
                            s.structureType == STRUCTURE_TOWER &&
                            !Memory.rooms[creep.room.name].numberOfLogistics &&
                            s.energy <= s.energyCapacity * 0.95,
                    });
                }

                if (
                    !target &&
                    creep.room.storage &&
                    (!creep.room.storage.store[RESOURCE_ENERGY] ||
                        creep.room.storage.store[RESOURCE_ENERGY] <
                            creep.room.storage.storeCapacity)
                ) {
                    target = creep.room.storage;
                }
                if (!target) {
                    target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                        filter: (s) =>
                            s.structureType == STRUCTURE_LAB &&
                            s.energy < s.energyCapacity,
                    });
                }

                if (target) {
                    creep.memory.target = target.id;
                }
            }

            if (creep.memory.target) {
                const status = creep.transfer(
                    Game.getObjectById(creep.memory.target),
                    RESOURCE_ENERGY
                );
                if (status == ERR_NOT_IN_RANGE) {
                    creep.moveTo(Game.getObjectById(creep.memory.target));
                } else if (status == OK) {
                    creep.memory.target = null;
                } else {
                    creep.memory.target = null;
                    creep.say("💤");
                }
            }
        }
    },
    spawn: function (room) {
        var harvesters = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "harvester" && creep.room.name == room.name
        );

        if (harvesters.length < 4) {
            return true;
        }
    },
    spawnData: function (room) {
        let name = "Harvester" + Game.time;
        let body = [WORK, CARRY, MOVE];
        let memory = { role: "harvester" };

        return { name, body, memory };
    },
};

module.exports = harvester;

return module.exports;
}
/********** End of module 7: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\harvester.js **********/
/********** Start module 8: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\upgrader.js **********/
__modules[8] = function(module, exports) {
var roleUpgrader = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.invokeState()) {
            return;
        }
        if (creep.store[RESOURCE_ENERGY] == 0) {
            let resource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r) => r.energy >= 200,
            });
            if (resource) {
                creep.pushState("GetEnergy", resource.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let structure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) =>
                    (s.structureType == STRUCTURE_STORAGE ||
                        s.structureType == STRUCTURE_CONTAINER) &&
                    s.store.energy >= 50,
            });

            if (structure) {
                creep.pushState("GetEnergy", structure.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }
            return;
        }
        else {
            let controller = creep.room.controller;

            creep.pushState("Upgrade", controller.id);

            if (!creep.invokeState()) {
                creep.say("zzz");
                return;
            }

            creep.say("zzz");
            return;
        }
    },
    spawn: function (room) {
        var upgraders = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "upgrader" && creep.room.name == room.name
        );

        if (upgraders.length < 3) {
            return true;
        }
    },
    spawnData: function (room) {
        let name = "Upgrader" + Game.time;
        let body = [WORK, CARRY, MOVE];
        let memory = { role: "upgrader" };

        return { name, body, memory };
    },
};

module.exports = roleUpgrader;

return module.exports;
}
/********** End of module 8: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\upgrader.js **********/
/********** Start module 9: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\builder.js **********/
__modules[9] = function(module, exports) {
var builder = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.invokeState()) {
            return;
        }
        if (creep.store[RESOURCE_ENERGY] == 0) {
            let resource = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
                filter: (r) => r.energy >= 200,
            });
            if (resource) {
                creep.pushState("GetEnergy", resource.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let structure = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                filter: (s) =>
                    (s.structureType == STRUCTURE_STORAGE ||
                        s.structureType == STRUCTURE_CONTAINER) &&
                    s.store.energy >= 50,
            });

            if (structure) {
                creep.pushState("GetEnergy", structure.id);

                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }
            return;
        }
        else {
            let repairTargets = creep.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.structureType != STRUCTURE_CONTROLLER &&
                    s.structureType != STRUCTURE_WALL &&
                    s.hits < s.hitsMax &&
                    (s.structureType != STRUCTURE_RAMPART ||
                        s.hits < 0.01 * s.hitsMax),
            });

            if (repairTargets.length) {
                repairTargets = _.sortBy(
                    repairTargets,
                    (s) => s.hits / s.hitsMax
                );

                var repairTarget = repairTargets[0];

                if (repairTargets[0].hits / repairTargets[0].hitsMax < 0.3) {
                    creep.pushState("Build", repairTarget.id);
                    if (!creep.invokeState()) {
                        creep.say("zzz");
                    }
                    return;
                }
            }

            var targetConstructionSite = creep.pos.findClosestByPath(
                FIND_MY_CONSTRUCTION_SITES
            );

            if (targetConstructionSite) {
                creep.pushState("Build", targetConstructionSite.id);
                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            if (repairTarget) {
                creep.pushState("Build", repairTarget.id);
                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let damagedRamparts = creep.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.hits < s.hitsMax && s.structureType == STRUCTURE_RAMPART,
            });

            if (damagedRamparts.length) {
                damagedRamparts = _.sortBy(
                    damagedRamparts,
                    (s) => s.hits / s.hitsMax
                );

                creep.pushState("Build", damagedRamparts[0].id);
                if (!creep.invokeState()) {
                    creep.say("zzz");
                }
                return;
            }

            let controller = creep.room.controller;

            creep.pushState("Upgrade", controller.id);

            if (!creep.invokeState()) {
                creep.say("zzz");
                return;
            }

            creep.say("zzz");
            return;
        }
    },
    spawn: function (room) {
        var builders = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "builder" && creep.room.name == room.name
        );
        var constructionSites = _.filter(
            Game.constructionSites,
            (cs) => cs.room && cs.room.name == room.name
        ).length;

        const wantedBuilders = 2; // Math.ceil(constructionSites / 5);

        if (builders.length < wantedBuilders) {
            return true;
        }
    },
    spawnData: function (room) {
        let name = "Builder" + Game.time;
        let body = [WORK, CARRY, MOVE];
        let memory = { role: "builder" };

        return { name, body, memory };
    },
};

module.exports = builder;

return module.exports;
}
/********** End of module 9: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\builder.js **********/
/********** Start module 10: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\scout.js **********/
__modules[10] = function(module, exports) {
var scout = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (!Memory.rooms[creep.room.name]) {
            Memory.rooms[creep.room.name] = {};
        }
        if (
            creep.memory.targetRoom &&
            creep.memory.targetRoom != creep.room.name &&
            creep.memory.target
        ) {
            if (
                creep.moveTo(
                    creep.memory.target.x,
                    creep.memory.target.y,
                    creep.memory.targetRoom
                ) == 0
            ) {
                return true;
            } else {
                creep.memory.targetRoom = undefined;
                creep.memory.target = undefined;
            }
        }

        if (
            !creep.memory.targetRoom ||
            creep.memory.targetRoom == creep.room.name ||
            !creep.memory.target
        ) {
            let minLastVisit = Infinity;
            let targetRoom = null;

            for (const roomName of Object.values(
                Memory.rooms[creep.room.name].exits
            )) {
                if (
                    !Memory.rooms[roomName] ||
                    !Memory.rooms[roomName].lastVisit
                ) {
                    targetRoom = roomName;
                    break;
                }

                const lastVisit = Memory.rooms[roomName].lastVisit;
                if (lastVisit < minLastVisit) {
                    minLastVisit = lastVisit;
                    targetRoom = roomName;
                }
            }

            creep.memory.targetRoom = targetRoom;
            const exitDirection = Game.map.findExit(creep.room, targetRoom);
            const exitTile = creep.pos.findClosestByRange(exitDirection);

            if (creep.moveTo(exitTile) == 0) {
                creep.memory.target = exitTile;
                return true;
            }

            creep.memory.target = undefined;
            creep.memory.targetRoom = undefined;
        }
    },
    spawn: function (room) {
        var scouts = _.filter(
            Game.creeps,
            (creep) =>
                creep.memory.role == "scout" && creep.memory.room == room.name
        );

        if (scouts.length < 1) {
            return true;
        }
    },
    spawnData: function (room) {
        let name = "Scout" + Game.time;
        let body = [MOVE, MOVE];
        let memory = {
            role: "scout",
            targetRoom: undefined,
            target: undefined,
            room: room.name,
        };

        return { name, body, memory };
    },
};

module.exports = scout;

return module.exports;
}
/********** End of module 10: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\roles\scout.js **********/
/********** Start module 11: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\structures\tower.js **********/
__modules[11] = function(module, exports) {
var tower = {
    /** @param {Structure} tower **/
    run: function (tower) {
        let hostiles = tower.room.find(FIND_HOSTILE_CREEPS, {
            filter: (c) =>
                _.some(
                    c.body,
                    (b) =>
                        [ATTACK, RANGED_ATTACK, WORK, HEAL, CLAIM].includes(
                            b.type
                        ) &&
                        c.pos.x != 49 &&
                        c.pos.x != 0 &&
                        c.pos.y != 49 &&
                        c.pos.y != 49
                ),
        });

        hostiles = _.sortBy(hostiles, (s) => s.hits);

        let closestHostile = _.sortBy(
            hostiles,
            (s) => s.pos.findPathTo(tower).length
        )[0];

        if (!closestHostile) {
            let hostiles = tower.room.find(FIND_HOSTILE_CREEPS, {
                filter: (c) =>
                    _.some(
                        c.body,
                        (b) =>
                            [
                                ATTACK,
                                WORK,
                                RANGED_ATTACK,
                                CARRY,
                                CLAIM,
                            ].includes(b.type) &&
                            c.pos.x != 49 &&
                            c.pos.x != 0 &&
                            c.pos.y != 49 &&
                            c.pos.y != 49
                    ),
            });

            hostiles = _.sortBy(hostiles, (s) => s.hits);

            let closestHostile = _.sortBy(
                hostiles,
                (s) => s.pos.findPathTo(tower).length
            )[0];
        }

        if (closestHostile) {
            tower.attack(closestHostile);
        } else if (Memory.rooms[tower.room.name].numberOfMiners) {
            if (
                tower.store.energy >=
                0.7 * tower.store.getCapacity(RESOURCE_ENERGY)
            ) {
                let damagedStructures = tower.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.hits < structure.hitsMax &&
                        ((structure.structureType != STRUCTURE_WALL &&
                            structure.structureType != STRUCTURE_RAMPART) ||
                            structure.hits < 1000),
                });

                let target = _.sortBy(damagedStructures, (s) => s.hits)[0];

                if (target) {
                    tower.repair(target);
                }
            }

            if (
                tower.store.energy >=
                0.9 * tower.store.getCapacity(RESOURCE_ENERGY)
            ) {
                let damagedStructures = tower.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.hits < structure.hitsMax &&
                        structure.structureType != STRUCTURE_RAMPART &&
                        structure.structureType != STRUCTURE_WALL,
                });

                let target = _.sortBy(damagedStructures, (s) => s.hits)[0];
                if (target) {
                    tower.repair(target);
                }
            }

            if (
                tower.store.energy >=
                0.85 * tower.store.getCapacity(RESOURCE_ENERGY)
            ) {
                let damagedStructures = tower.room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        ((tower.room.controller.level == 8 &&
                            structure.hits < structure.hitsMax) ||
                            (structure.hits < 0.05 * structure.hitsMax &&
                                !structure.room.find(
                                    FIND_MY_CONSTRUCTION_SITES
                                )[0]) ||
                            structure.hits < 0.01 * structure.hitsMax) &&
                        (structure.structureType == STRUCTURE_RAMPART ||
                            structure.structureType == STRUCTURE_WALL),
                });
                let target = _.sortBy(damagedStructures, (s) => s.hits)[0];
                if (target) {
                    tower.repair(target);
                }
            }
        }
    },
};

module.exports = tower;

return module.exports;
}
/********** End of module 11: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\structures\tower.js **********/
/********** Start module 12: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\structures\link.js **********/
__modules[12] = function(module, exports) {
var link = {
    /** @param {Structure} link **/
    run: function (link) {
        if (
            link.isCollector() &&
            link.store["energy"] >= 50 &&
            link.isActive()
        ) {
            let nonCollectorLinks = link.room.find(FIND_STRUCTURES, {
                filter: (s) =>
                    s.structureType == STRUCTURE_LINK && !s.isCollector(),
            });
            let target = _.sortBy(nonCollectorLinks, (s) =>
                s.store.getFreeCapacity()
            )[0];
            link.transferEnergy(target);
        }
    },
};

module.exports = link;

return module.exports;
}
/********** End of module 12: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\structures\link.js **********/
/********** Start module 13: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\spawning.js **********/
__modules[13] = function(module, exports) {
let creepLogic = __require(1,13);
let creepTypes = _.keys(creepLogic);

function spawnCreeps(room) {
    let creepTypeNeeded = _.find(creepTypes, function (type) {
        return creepLogic[type].spawn(room);
    });
    let creepSpawnData =
        creepLogic[creepTypeNeeded] &&
        creepLogic[creepTypeNeeded].spawnData(room);

    if (creepSpawnData) {
        let spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn) {
            return;
        }
        let result = spawn.spawnCreep(
            creepSpawnData.body,
            creepSpawnData.name,
            {
                memory: creepSpawnData.memory,
            }
        );
    }
}

module.exports = spawnCreeps;

return module.exports;
}
/********** End of module 13: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\spawning.js **********/
/********** Start module 14: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\intel.js **********/
__modules[14] = function(module, exports) {
function getIntel(room) {
    if (!Memory.rooms) {
        Memory.rooms = {};
    }
    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }
    Memory.myRooms = _.filter(Game.rooms, (r) => {
        return r.controller && r.controller.my;
    });

    if (!Memory.rooms[room.name].exits) {
        Memory.rooms[room.name].exits = Game.map.describeExits(room.name);

        for (let exit in Memory.rooms[room.name].exits) {
            if (!Memory.rooms[Memory.rooms[room.name].exits[exit]]) {
                Memory.rooms[Memory.rooms[room.name].exits[exit]] = {};
            }
        }
    }

    if (Memory.rooms[room.name].sourceNumber == undefined) {
        Memory.rooms[room.name].sourceNumber = room.find(FIND_SOURCES).length;
    }

    if (Memory.rooms[room.name].mineral == undefined) {
        let mineral = room.find(FIND_MINERALS)[0];
        Memory.rooms[room.name].mineral = mineral ? mineral.mineralType : null;
    }

    if (Memory.rooms[room.name].hasController == undefined) {
        Memory.rooms[room.name].hasController = room.controller ? true : false;
    }

    Memory.rooms[room.name].reservation = room.controller
        ? room.controller.reservation
        : undefined;

    Memory.rooms[room.name].my = room.controller
        ? room.controller.my
        : undefined;

    Memory.rooms[room.name].owner = room.controller
        ? room.controller.owner
        : undefined;

    Memory.rooms[room.name].enemies = room.find(FIND_HOSTILE_CREEPS).length;

    Memory.rooms[room.name].enemyStructures = room.find(
        FIND_HOSTILE_STRUCTURES,
        { filter: (s) => s.structureType != STRUCTURE_POWER_BANK }
    ).length;

    Memory.rooms[room.name].lastVisit = Game.time;

    if (!Memory.rooms[room.name].builds) {
        Memory.rooms[room.name].builds = {};
    }

    Memory.rooms[room.name].numberOfDefenders = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "defender" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfHarvesters = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "harvester" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfUpgraders = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "upgrader" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfBuilders = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "builder" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfRepairers = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "repairer" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfWallRepairers = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "wallRepairer" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfMiners = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "miner" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfTransporters = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "transporter" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfLogistics = _.sum(
        Game.creeps,
        (c) => c.memory.role == "logistic" && c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfClaimers = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "claimer" &&
            c.ticksToLive > 5 &&
            c.room.name == room.name
    );
    Memory.rooms[room.name].numberOfScouts = _.sum(
        Game.creeps,
        (c) =>
            c.memory.role == "scout" &&
            c.ticksToLive > 5 &&
            c.memory.home == room.name
    );

    Memory.rooms[room.name].numberOfLinks = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType == STRUCTURE_LINK,
    }).length;
    Memory.rooms[room.name].numberOfContainers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType == STRUCTURE_CONTAINER,
    }).length;

    Memory.rooms[room.name].numberOfTowers = room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType == STRUCTURE_TOWER,
    }).length;
    if (
        Memory.rooms[room.name].terrainMatrix == undefined &&
        Memory.rooms[room.name].my
    ) {
        console.log("Calculationg terrain matrix for room", room.name);
        const terrain = new Room.Terrain(room.name);
        const terrainMatrix = [];
        const walkMatrix = new PathFinder.CostMatrix();
        for (let x = 0; x < 50; x++) {
            terrainMatrix[x] = [];
            walkMatrix[x] = [];
            for (let y = 0; y < 50; y++) {
                const terrainType = terrain.get(x, y);
                terrainMatrix[x][y] = terrainType;
                if (terrainType == TERRAIN_MASK_WALL) {
                    walkMatrix.set(x, y, 255);
                }
            }
        }
        Memory.rooms[room.name].terrainMatrix = terrainMatrix;
        Memory.rooms[room.name].walkMatrix = walkMatrix;
    }
}

module.exports = getIntel;

return module.exports;
}
/********** End of module 14: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\intel.js **********/
/********** Start module 15: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\architect.js **********/
__modules[15] = function(module, exports) {
const mincut = __require(24,15);

let layoutKey = {
    A: STRUCTURE_SPAWN,
    N: STRUCTURE_NUKER,
    K: STRUCTURE_LINK,
    L: STRUCTURE_LAB,
    E: STRUCTURE_EXTENSION,
    S: STRUCTURE_STORAGE,
    T: STRUCTURE_TOWER,
    O: STRUCTURE_OBSERVER,
    M: STRUCTURE_TERMINAL,
    P: STRUCTURE_POWER_SPAWN,
    "?": STRUCTURE_ROAD,
    ".": STRUCTURE_ROAD,
    C: STRUCTURE_CONTAINER,
    R: STRUCTURE_RAMPART,
    W: STRUCTURE_WALL,
    F: STRUCTURE_FACTORY,
};
_.merge(layoutKey, _.invert(layoutKey));

function planCity(room) {
    const roomName = room.name;

    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    if (!Memory.rooms[room.name]) {
        Memory.rooms[room.name] = {};
    }

    if (Memory.rooms[roomName].buildings) {
        visualizeStructures(Memory.rooms[roomName].buildings, roomName);
    }

    if (
        Memory.rooms[room.name].planned &&
        !_.find(Game.constructionSites, (c) => {
            return c.room && c.room.name == room.name;
        })
    ) {
        createConstructionSites(room);
    }

    if (Memory.rooms[room.name].planned) {
        return;
    }

    if (Game.cpu.bucket < 500) {
        return;
    }

    const exits = getAllExitCoordinates(roomName);
    const floodFillMatrix = room.floodFill(exits);

    const planStep = Memory.rooms[room.name].planStep;

    let stamp = { structures: [], rcl: [] };

    if (!Memory.rooms[room.name].terrainMatrix) {
        return;
    }

    switch (planStep) {
        case undefined:
            Memory.rooms[roomName].buildings = [];
            Memory.rooms[roomName].mincutBoundries = [];
            const containersAndLinks = getContainerLocations(
                roomName,
                floodFillMatrix
            );
            addBuildings(roomName, containersAndLinks, true);
            Memory.rooms[roomName].planStep = 1;
            break;
        case 1:
            stamp = {
                structures: ["  .  ", " .E. ", ".EAE.", " .E. ", "  .  "],
                rcl: ["  2  ", " 222 ", "22122", " 222 ", "  2  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            const spawn = room.find(FIND_MY_STRUCTURES, {
                filter: { structureType: STRUCTURE_SPAWN },
            })[0];

            if (spawn) {
                addStamp(
                    roomName,
                    stamp,
                    floodFillMatrix,
                    spawn.pos.x,
                    spawn.pos.y
                );
            } else {
                addStamp(roomName, stamp, floodFillMatrix);
            }

            Memory.rooms[roomName].planStep++;
            break;
        case 2:
            stamp = {
                structures: ["  .  ", " .S. ", ".M.F.", " .K. ", "  .  "],
                rcl: ["  4  ", " 444 ", "46474", " 454 ", "  4  "],
                ramparts: ["     ", "  5  ", " 7 8 ", "     ", "     "],
            };

            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;

        case 3:
            stamp = {
                structures: ["  .  ", " .E. ", ".ETE.", " .E. ", "  .  "],
                rcl: ["  2  ", " 222 ", "23332", " 232 ", "  2  "],
                ramparts: ["     ", "     ", "  4  ", "     ", "     "],
            };

            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 4:
            stamp = {
                structures: [
                    " ?? ? ",
                    "?LL.L?",
                    "?L.L. ",
                    " .L.L?",
                    "?L.LL?",
                    " ? ?? ",
                ],
                rcl: [
                    " 66 6 ",
                    "666686",
                    "66686 ",
                    " 68676",
                    "686776",
                    " 6 66 ",
                ],
                ramparts: [
                    "      ",
                    " 88 8 ",
                    " 8 8  ",
                    "  8 8 ",
                    " 8 88 ",
                    "     ",
                ],
            };
            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;

        case 5:
            stamp = {
                structures: ["  .  ", " .E. ", ".EAE.", " .E. ", "  .  "],
                rcl: ["  3  ", " 333 ", "34743", " 333 ", "  3  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;

        case 6:
            stamp = {
                structures: ["  .  ", " .E. ", ".EAE.", " .E. ", "  .  "],
                rcl: ["  4  ", " 444 ", "44844", " 444 ", "  4  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;

        case 7:
            stamp = {
                structures: ["  .  ", " .E. ", ".EPE.", " .E. ", "  .  "],
                rcl: ["  4  ", " 444 ", "44844", " 444 ", "  4  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;
        case 8:
            var countExtensions = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_EXTENSION
            ).length;

            var planRCL = Math.floor(countExtensions / 10) + 3;

            stamp = {
                structures: ["  ?  ", " .E. ", "?EEE?", " .E. ", "  ?  "],
                rcl: ["  x  ", " xxx ", "xxxxx", " xxx ", "  x  "].map((str) =>
                    str.replace(/x/g, planRCL)
                ),
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            addStamp(roomName, stamp, floodFillMatrix);

            if (countExtensions >= 49) {
                Memory.rooms[roomName].planStep++;
            }
            break;

        case 9:
            var countExtensions = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_EXTENSION
            ).length;

            var planRCL = Math.floor(countExtensions / 10) + 3;

            stamp = {
                structures: [" ? ", "?E?", " ? "],
                rcl: [" x ", "xxx", " x "].map((str) =>
                    str.replace(/x/g, planRCL)
                ),
                ramparts: ["   ", "   ", "   "],
            };
            addStamp(roomName, stamp, floodFillMatrix);

            if (countExtensions >= 59) {
                Memory.rooms[roomName].planStep++;
            }
            break;

        case 10:
            stamp = {
                structures: [" . ", ".N.", " . "],
                rcl: [" 8 ", "888", " 8 "],
                ramparts: ["   ", " 8 ", "   "],
            };
            addStamp(roomName, stamp, floodFillMatrix);
            Memory.rooms[roomName].planStep++;
            break;

        case 11:
            stamp = {
                structures: [" . ", ".O.", " . "],
                rcl: [" 8 ", "888", " 8 "],
                ramparts: ["   ", " 8 ", "   "],
            };
            addStamp(roomName, stamp, floodFillMatrix);

            Memory.rooms[roomName].planStep++;
            break;

        case 12:
            const containers = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_CONTAINER
            );
            const anchorSpawm = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_SPAWN
            )[0];
            const roadPos = { x: anchorSpawm.x + 1, y: anchorSpawm.y - 1 };
            let newRoads = [];
            for (container of containers) {
                newRoads = getShortestPath(
                    roomName,
                    roadPos.x,
                    roadPos.y,
                    container.x,
                    container.y
                );
                addBuildings(roomName, newRoads, true);
            }

            const pathsToAdjacentRooms = getShortestPathToAdjacentRooms(
                roomName,
                roadPos.x,
                roadPos.y
            );

            Memory.rooms[roomName].buildings =
                Memory.rooms[roomName].buildings.concat(pathsToAdjacentRooms);

            Memory.rooms[roomName].planStep++;
            break;
        case 13:
            const cutTiles = mincut.GetCutTiles(
                roomName,
                Memory.rooms[roomName].mincutBoundries
            );
            const ramparts = [];
            for (const tile of cutTiles) {
                ramparts.push({
                    x: tile.x,
                    y: tile.y,
                    structureType: STRUCTURE_RAMPART,
                    minimalRCL: 3,
                });
            }
            Memory.rooms[roomName].buildings =
                Memory.rooms[roomName].buildings.concat(ramparts);
            Memory.rooms[roomName].planStep++;
            break;
        case 14:
            const structures = Memory.rooms[roomName].buildings.filter(
                (building) =>
                    building.structureType !== STRUCTURE_ROAD &&
                    building.structureType !== STRUCTURE_RAMPART &&
                    building.structureType !== STRUCTURE_CONTAINER &&
                    building.structureType !== STRUCTURE_LINK &&
                    building.structureType !== STRUCTURE_EXTRACTOR
            );
            const blockRamparts = Memory.rooms[roomName].buildings.filter(
                (building) =>
                    building.structureType == STRUCTURE_RAMPART &&
                    building.minimalRCL == 3
            );

            const floodFillMatrixBlocked = room.floodFill(
                structures,
                blockRamparts,
                (visualize = true)
            );

            const secondTowerPos = findNextTowerLocation(
                floodFillMatrixBlocked,
                blockRamparts,
                roomName
            );
            addBuildings(
                roomName,
                [
                    {
                        x: secondTowerPos.x,
                        y: secondTowerPos.y,
                        structureType: STRUCTURE_TOWER,
                        minimalRCL: 5,
                    },
                    {
                        x: secondTowerPos.x,
                        y: secondTowerPos.y,
                        structureType: STRUCTURE_RAMPART,
                        minimalRCL: 5,
                    },
                ],
                false
            );

            const thirdTowerPos = findNextTowerLocation(
                floodFillMatrixBlocked,
                blockRamparts,
                roomName
            );

            addBuildings(
                roomName,
                [
                    {
                        x: thirdTowerPos.x,
                        y: thirdTowerPos.y,
                        structureType: STRUCTURE_TOWER,
                        minimalRCL: 7,
                    },
                    {
                        x: thirdTowerPos.x,
                        y: thirdTowerPos.y,
                        structureType: STRUCTURE_RAMPART,
                        minimalRCL: 7,
                    },
                ],
                false
            );

            for (let ix = 0; ix < 3; ix++) {
                const newTowerPos = findNextTowerLocation(
                    floodFillMatrixBlocked,
                    blockRamparts,
                    roomName
                );
                addBuildings(
                    roomName,
                    [
                        {
                            x: newTowerPos.x,
                            y: newTowerPos.y,
                            structureType: STRUCTURE_TOWER,
                            minimalRCL: 8,
                        },
                        {
                            x: newTowerPos.x,
                            y: newTowerPos.y,
                            structureType: STRUCTURE_RAMPART,
                            minimalRCL: 8,
                        },
                    ],
                    false
                );
            }

            Memory.rooms[roomName].planStep++;
            Memory.rooms[room.name].planned = true;
            break;
    }
}

function createConstructionSites(room) {
    let index = Memory.rooms[room.name].constructionIndex;
    if (
        index == undefined ||
        index >= Memory.rooms[room.name].buildings.length
    ) {
        index = 0;
    }

    if (!room.controller) {
        return;
    }

    const rcl = room.controller.level;
    const building = Memory.rooms[room.name].buildings[index];
    const buildingPos = new RoomPosition(building.x, building.y, room.name);
    if (
        rcl >= building.minimalRCL &&
        !buildingPos.findInRange(FIND_STRUCTURES, 0, {
            filter: (s) => s.structureType == building.structureType,
        })[0]
    ) {
        buildingPos.createConstructionSite(building.structureType);
    }

    Memory.rooms[room.name].constructionIndex = index + 1;
}

function findFirstTowerLocation(
    floodFillMatrix,
    structures,
    roomName,
    rampartDistance = 1
) {
    const adjacentOffsets = [
        { dx: 0, dy: -1 * rampartDistance }, // Top
        { dx: 0, dy: 1 * rampartDistance }, // Bottom
        { dx: -1 * rampartDistance, dy: 0 }, // Left
        { dx: 1 * rampartDistance, dy: 0 }, // Right,
        { dx: -1 * rampartDistance, dy: -1 * rampartDistance }, // Top Left
        { dx: 1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Right
        { dx: -1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Left
        { dx: 1 * rampartDistance, dy: -1 * rampartDistance }, // Top Right
    ];
    let minVal = Infinity;
    let targetPosition = null;

    structures.forEach((structure) => {
        const { x, y } = structure;

        adjacentOffsets.forEach((offset) => {
            const adjacentX = x + offset.dx;
            const adjacentY = y + offset.dy;

            if (
                floodFillMatrix.get(adjacentX, adjacentY) < minVal &&
                floodFillMatrix.get(adjacentX, adjacentY) > 0 &&
                !Memory.rooms[roomName].buildings.find(
                    (building) =>
                        building.x === adjacentX && building.y === adjacentY
                )
            ) {
                minVal = floodFillMatrix.get(adjacentX, adjacentY);
                targetPosition = { x: adjacentX, y: adjacentY };
            } else {
            }
        });
    });

    if (targetPosition == null) {
        targetPosition = findFirstTowerLocation(
            floodFillMatrix,
            structures,
            roomName,
            rampartDistance + 1
        );
    }

    return targetPosition;
}

function findNextTowerLocation(
    floodFillMatrix,
    structures,
    roomName,
    rampartDistance = 1
) {
    const adjacentOffsets = [
        { dx: 0, dy: -1 * rampartDistance }, // Top
        { dx: 0, dy: 1 * rampartDistance }, // Bottom
        { dx: -1 * rampartDistance, dy: 0 }, // Left
        { dx: 1 * rampartDistance, dy: 0 }, // Right,
        { dx: -1 * rampartDistance, dy: -1 * rampartDistance }, // Top Left
        { dx: 1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Right
        { dx: -1 * rampartDistance, dy: 1 * rampartDistance }, // Bottom Left
        { dx: 1 * rampartDistance, dy: -1 * rampartDistance }, // Top Right
    ];
    let maxVal = -Infinity;
    let targetPosition = null;

    structures.forEach((structure) => {
        const { x, y } = structure;

        adjacentOffsets.forEach((offset) => {
            const adjacentX = x + offset.dx;
            const adjacentY = y + offset.dy;

            const currentTowers = Memory.rooms[roomName].buildings.filter(
                (building) => building.structureType === STRUCTURE_TOWER
            );

            const totalDistance = currentTowers.reduce((sum, tower) => {
                const distance =
                    ((tower.x - adjacentX) ** 2 + (tower.y - adjacentY) ** 2) **
                    (1 / 16);
                return sum + distance;
            }, 0);

            const averageDistance = totalDistance / currentTowers.length;

            if (
                floodFillMatrix.get(adjacentX, adjacentY) > 0 &&
                averageDistance > maxVal &&
                !Memory.rooms[roomName].buildings.find(
                    (building) =>
                        building.x === adjacentX && building.y === adjacentY
                )
            ) {
                maxVal = averageDistance;
                targetPosition = { x: adjacentX, y: adjacentY };
            }
        });
    });

    if (targetPosition == null) {
        targetPosition = findNextTowerLocation(
            floodFillMatrix,
            structures,
            roomName,
            rampartDistance + 1
        );
    }

    return targetPosition;
}

function getContainerLocations(roomName, floodFillMatrix) {
    const sources = Game.rooms[roomName].find(FIND_SOURCES);

    const locations = [];

    for (const source of sources) {
        let location = undefined;
        let maxVal = -Infinity;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const coordX = source.pos.x + i;
                const coordY = source.pos.y + j;
                if (
                    floodFillMatrix.get(coordX, coordY) > maxVal &&
                    Memory.rooms[roomName].terrainMatrix[coordX][coordY] !==
                        TERRAIN_MASK_WALL &&
                    !Game.rooms[roomName].find(FIND_STRUCTURES, {
                        filter: (s) =>
                            s.pos &&
                            s.pos.x === coordX &&
                            s.pos.y === coordY &&
                            s.structureType !== STRUCTURE_CONTAINER &&
                            s.structureType !== STRUCTURE_ROAD,
                    })[0] &&
                    (i !== 0 || j !== 0)
                ) {
                    location = {
                        x: coordX,
                        y: coordY,
                        structureType: STRUCTURE_CONTAINER,
                        minimalRCL: 1,
                    };
                    maxVal = floodFillMatrix.get(coordX, coordY);
                }
            }
        }
        if (location) {
            locations.push(location);
        }
    }
    const minerals = Game.rooms[roomName].find(FIND_MINERALS);

    for (const mineral of minerals) {
        let location = undefined;
        let maxVal = -Infinity;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const coordX = mineral.pos.x + i;
                const coordY = mineral.pos.y + j;
                if (
                    floodFillMatrix.get(coordX, coordY) > maxVal &&
                    Memory.rooms[roomName].terrainMatrix[coordX][coordY] !==
                        TERRAIN_MASK_WALL &&
                    !Game.rooms[roomName].find(FIND_STRUCTURES, {
                        filter: (s) =>
                            s.pos &&
                            s.pos.x === coordX &&
                            s.pos.y === coordY &&
                            s.structureType !== STRUCTURE_CONTAINER &&
                            s.structureType !== STRUCTURE_ROAD,
                    })[0] &&
                    (i !== 0 || j !== 0)
                ) {
                    location = {
                        x: coordX,
                        y: coordY,
                        structureType: STRUCTURE_CONTAINER,
                        minimalRCL: 6,
                    };
                    maxVal = floodFillMatrix.get(coordX, coordY);
                }
            }
        }
        if (location) {
            locations.push(location);
        }
    }
    const linkLocations = [];

    for (const container of locations) {
        let locationFound = false;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue; // Skip the original position

                if (locationFound) {
                    break;
                }

                const posX = container.x + dx;
                const posY = container.y + dy;
                if (
                    Memory.rooms[roomName].terrainMatrix[posX][posY] ==
                    TERRAIN_MASK_WALL
                ) {
                    continue; // Skip if there is a wall
                }
                if (
                    floodFillMatrix.get(posX, posY) > 3 &&
                    posX >= 0 &&
                    posX < 50 &&
                    posY >= 0 &&
                    posY < 50
                ) {
                    const rcl =
                        linkLocations.length == 0
                            ? 5
                            : linkLocations.length == 1
                            ? 6
                            : 8;
                    linkLocations.push({
                        x: posX,
                        y: posY,
                        structureType: STRUCTURE_LINK,
                        minimalRCL: rcl,
                    }); // Return the link spot
                    locationFound = true;
                }
            }
        }
    }

    for (const mineral of minerals) {
        locations.push({
            x: mineral.pos.x,
            y: mineral.pos.y,
            structureType: STRUCTURE_EXTRACTOR,
            minimalRCL: 6,
        });
    }

    return locations.concat(linkLocations);
}

function addStamp(
    roomName,
    stamp,
    floodFillMatrix,
    spawnX = null,
    spawnY = null
) {
    const newBuildings = findStampLocation(
        roomName,
        stamp,
        floodFillMatrix,
        spawnX,
        spawnY
    );

    addBuildings(roomName, newBuildings, floodFillMatrix);
}

function addBuildings(roomName, newBuildings, shouldProtect = true) {
    Memory.rooms[roomName].buildings =
        Memory.rooms[roomName].buildings.concat(newBuildings);
    if (shouldProtect) {
        for (const b of newBuildings) {
            Memory.rooms[roomName].mincutBoundries.push({
                x1: b.x - 1,
                y1: b.y - 1,
                x2: b.x + 1,
                y2: b.y + 1,
            });
        }
    }
}

function findStampLocation(
    roomName,
    stamp,
    floodFillMatrix,
    spawnX = null,
    spawnY = null
) {
    const room = Game.rooms[roomName];

    const storageLocation = _.find(Memory.rooms[roomName].buildings, (b) => {
        return b.structureType == STRUCTURE_STORAGE;
    });
    if (!room) {
        console.log(`Room ${roomName} not found.`);
        return [];
    }

    const terrainMatrix = Memory.rooms[room.name].terrainMatrix;
    const stampHeight = stamp["structures"].length;
    const stampWidth = stamp["structures"][0].length;

    let bestVal = -1;
    let bestAdjacentRoads = -1;
    let bestStorageDistance = Infinity;
    let buildings = [];
    for (let coordX = 1; coordX < 50 - stampWidth; coordX++) {
        for (let coordY = 1; coordY < 50 - stampHeight; coordY++) {
            let isValid = true;

            let value = 0;
            let storageDistance = 0;

            let adjacentRoads = 0;
            let tmpBuildings = [];
            for (let stampY = 0; stampY < stampHeight; stampY++) {
                for (let stampX = 0; stampX < stampWidth; stampX++) {
                    const stampStructure = stamp["structures"][stampY][stampX];

                    if (
                        stampStructure === "A" &&
                        spawnX &&
                        spawnY &&
                        (spawnX !== coordX + stampX ||
                            spawnY !== coordY + stampY)
                    ) {
                        isValid = false;
                        break;
                    }

                    if (
                        stampStructure !== " " &&
                        stampStructure !== "?" &&
                        floodFillMatrix.get(coordX + stampX, coordY + stampY) <
                            3
                    ) {
                        isValid = false;
                        break;
                    }
                    const existingBuilding = Memory.rooms[
                        room.name
                    ].buildings.find(
                        ({ x, y, structureType }) =>
                            x === coordX + stampX &&
                            y === coordY + stampY &&
                            stampStructure !== " " &&
                            !(
                                structureType === STRUCTURE_ROAD &&
                                layoutKey[stampStructure] === STRUCTURE_ROAD
                            ) &&
                            !(
                                structureType === STRUCTURE_CONTAINER &&
                                stampStructure === "?"
                            )
                    );

                    if (existingBuilding) {
                        isValid = false;
                        break;
                    }
                    value += floodFillMatrix.get(coordX, coordY);

                    if (storageLocation) {
                        storageDistance +=
                            ((coordX + stampX - storageLocation.x) ** 2 +
                                (coordY + stampY - storageLocation.y) ** 2) **
                            (1 / 16);
                    }
                    if (
                        (stampStructure === "." || stampStructure === "?") &&
                        Memory.rooms[roomName].buildings.some(
                            (building) =>
                                building.x === coordX + stampX &&
                                building.y === coordY + stampY &&
                                building.structureType === STRUCTURE_ROAD
                        )
                    ) {
                        adjacentRoads += 1;
                    }
                    if (
                        stampStructure !== " " &&
                        !Memory.rooms[room.name].buildings.some(
                            ({ x, y, structureType }) =>
                                x === coordX + stampX &&
                                y === coordY + stampY &&
                                structureType === layoutKey[stampStructure]
                        ) &&
                        terrainMatrix[coordX + stampX][coordY + stampY] !=
                            TERRAIN_MASK_WALL
                    ) {
                        tmpBuildings.push({
                            x: coordX + stampX,
                            y: coordY + stampY,
                            structureType: layoutKey[stampStructure],
                            minimalRCL: stamp["rcl"][stampY][stampX],
                        });

                        if (stamp["ramparts"][stampY][stampX] != " ") {
                            tmpBuildings.push({
                                x: coordX + stampX,
                                y: coordY + stampY,
                                structureType: STRUCTURE_RAMPART,
                                minimalRCL: stamp["ramparts"][stampY][stampX],
                            });
                        }
                    }
                }

                if (!isValid) {
                    break;
                }
            }
            if (
                isValid &&
                (adjacentRoads > bestAdjacentRoads ||
                    (value > bestVal && adjacentRoads == bestAdjacentRoads) ||
                    (storageDistance < bestStorageDistance &&
                        adjacentRoads === bestAdjacentRoads))
            ) {
                bestVal = value;
                bestStorageDistance = storageDistance;
                bestAdjacentRoads = adjacentRoads;
                buildings = tmpBuildings;
            }
        }
    }

    return buildings;
}

function getAllExitCoordinates(roomName) {
    const exits = [];
    const terrain = Game.map.getRoomTerrain(roomName);
    for (let x = 0; x < 50; x++) {
        if (terrain.get(x, 0) !== TERRAIN_MASK_WALL) {
            exits.push({ x: x, y: 0 });
        }
    }
    for (let x = 0; x < 50; x++) {
        if (terrain.get(x, 49) !== TERRAIN_MASK_WALL) {
            exits.push({ x: x, y: 49 });
        }
    }
    for (let y = 1; y < 49; y++) {
        if (terrain.get(0, y) !== TERRAIN_MASK_WALL) {
            exits.push({ x: 0, y: y });
        }
    }
    for (let y = 1; y < 49; y++) {
        if (terrain.get(49, y) !== TERRAIN_MASK_WALL) {
            exits.push({ x: 49, y: y });
        }
    }

    return exits;
}

function visualizeStructures(structures, roomName, showRCL = false) {
    const roomVisual = new RoomVisual(roomName);

    for (const structure of structures) {
        const { x, y, structureType, minimalRCL } = structure;

        roomVisual.structure(x, y, structureType, {
            opacity: 0.15,
        });

        if (showRCL) {
            roomVisual.text(minimalRCL, x, y, {
                opacity: 0.4,
            });
        }
    }
}

function getShortestPathToAdjacentRooms(roomName, x, y) {
    const exits = Game.map.describeExits(roomName);
    let adjacentPaths = [];

    for (const direction in exits) {
        const adjacentRoomName = exits[direction];
        const exit = new RoomPosition(x, y, roomName).findClosestByPath(
            parseInt(direction)
        );

        if (exit !== null) {
            const path = getShortestPath(roomName, x, y, exit.x, exit.y);
            adjacentPaths = adjacentPaths.concat(path);
        }
    }

    return adjacentPaths;
}

function getShortestPath(roomName, x1, y1, x2, y2) {
    const room = Game.rooms[roomName];
    const buildings = Memory.rooms[roomName].buildings;

    if (buildings === undefined) {
        return [];
    }

    const matrix = new PathFinder.CostMatrix();
    buildings.forEach((building) => {
        if (
            building.structureType !== STRUCTURE_ROAD &&
            building.structureType !== STRUCTURE_RAMPART
        ) {
            matrix.set(building.x, building.y, 255); // Impassable terrain
        }
    });

    const origin = new RoomPosition(x1, y1, roomName);
    const target = new RoomPosition(x2, y2, roomName);

    const path = PathFinder.search(
        origin,
        { pos: target, range: 1 },
        {
            roomCallback: (roomName) => {
                if (roomName === room.name) {
                    return matrix;
                }
                return false; // Ignore paths to adjacent rooms
            },
        }
    );

    const filteredPath = path.path.filter((step) => {
        return (
            step.roomName === roomName &&
            !buildings.some(
                (building) =>
                    building.structureType === STRUCTURE_ROAD &&
                    building.x === step.x &&
                    building.y === step.y
            )
        );
    });
    const visual = new RoomVisual(roomName);
    filteredPath.forEach((step, index) => {
        visual.circle(step.x, step.y, {
            radius: 0.3,
            fill: "#ffffff",
            opacity: 0.5,
        });
        if (index > 0) {
            const prevStep = filteredPath[index - 1];
            visual.line(prevStep.x, prevStep.y, step.x, step.y, {
                width: 0.1,
                color: "#ffffff",
            });
        }
    });
    const roadElements = filteredPath.map((step) => ({
        x: step.x,
        y: step.y,
        structureType: STRUCTURE_ROAD,
        minimalRCL: 3,
    }));

    return roadElements;
}

module.exports = planCity;

return module.exports;
}
/********** End of module 15: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\rooms\architect.js **********/
/********** Start module 16: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\roomObject.js **********/
__modules[16] = function(module, exports) {
/** Call this to run the current state */
RoomObject.prototype.invokeState = function () {
    if (!this.memory.stack || !this.memory.stack.length) return false;
    var [[state, scope]] = this.memory.stack;
    var method = `run${state}`;
    if (!this[method]) return false;
    this[method](scope);
    return true;
};

/**
 * @param {string} [defaultState] - Fallback state if none defined.
 */
RoomObject.prototype.getState = function (defaultState = "I") {
    if (!this.memory.stack) return defaultState;
    return this.memory.stack[0][0] || defaultState;
};

/**
 * @param {string} state - Name of state to switch to.
 * @param {*} scope - Any data you want to supply to the state.
 */
RoomObject.prototype.setState = function (state, scope) {
    if (state == null) throw new TypeError("State can not be null");
    if (!this.memory.stack) this.memory.stack = [[]];
    this.memory.stack[0] = [state, scope];
    return state;
};

/**
 * @param {string} state - Name of state to push
 * @param {*} scope - Any data you want to supply to the state.
 */
RoomObject.prototype.pushState = function (state, scope = {}) {
    if (!this.memory.stack) this.memory.stack = [];
    var method = `run${state}`;
    if (this[method] == null)
        throw new Error(`No such state or action ${method}`);
    if (this.memory.stack.length >= 100)
        throw new Error("Automata stack limit exceeded");
    this.memory.stack.unshift([state, scope]);
    return state;
};

/** Pop the current state off the stack */
RoomObject.prototype.popState = function () {
    if (!this.memory.stack || !this.memory.stack.length) return;
    const [state] = this.memory.stack.shift();
    if (!this.memory.stack.length) this.memory.stack = undefined;
};

/** Clear the stack */
RoomObject.prototype.clearState = function () {
    this.memory.stack = undefined;
};
RoomObject.prototype.say = function (what) {
    this.room.visual
        .line(this.pos.x, this.pos.y, this.pos.x + 1 - 0.2, this.pos.y - 1, {
            color: "#eeeeee",
            opacity: 0.9,
            width: 0.1,
        })
        .circle(this.pos, {
            fill: "#aaffaa",
            opacity: 0.9,
        })
        .text(what, this.pos.x + 1, this.pos.y - 1, {
            color: "black",
            opacity: 0.9,
            align: "left",
            font: "bold 0.6 Arial",
            backgroundColor: "black",
            backgroundPadding: 0.3,
        })
        .text(what, this.pos.x + 1, this.pos.y - 1, {
            color: "black",
            opacity: 0.9,
            align: "left",
            font: "bold 0.6 Arial",
            backgroundColor: "#eeeeee",
            backgroundPadding: 0.2,
        });
};

return module.exports;
}
/********** End of module 16: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\roomObject.js **********/
/********** Start module 17: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\room.js **********/
__modules[17] = function(module, exports) {
const roomDimensions = 50;

/**
 * This is good for anything that isn't a diagonal, as searches all adjacent tiles when finding distance
 */
Room.prototype.distanceTransform = function (
    initialCM,
    enableVisuals,
    x1 = 0,
    y1 = 0,
    x2 = roomDimensions - 1,
    y2 = roomDimensions - 1
) {
    const room = this;

    const distanceCM = new PathFinder.CostMatrix();

    let x;
    let y;

    for (
        x = Math.max(x1 - 1, 0);
        x < Math.min(x2 + 1, roomDimensions - 1);
        x += 1
    ) {
        for (
            y = Math.max(y1 - 1, 0);
            y < Math.min(y2 + 1, roomDimensions - 1);
            y += 1
        ) {
            distanceCM.set(x, y, initialCM.get(x, y) === 255 ? 0 : 255);
        }
    }

    let top;
    let left;
    let topLeft;
    let topRight;
    let bottomLeft;

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            top = distanceCM.get(x, y - 1);
            left = distanceCM.get(x - 1, y);
            topLeft = distanceCM.get(x - 1, y - 1);
            topRight = distanceCM.get(x + 1, y - 1);
            bottomLeft = distanceCM.get(x - 1, y + 1);

            distanceCM.set(
                x,
                y,
                Math.min(
                    Math.min(top, left, topLeft, topRight, bottomLeft) + 1,
                    distanceCM.get(x, y)
                )
            );
        }
    }

    let bottom;
    let right;
    let bottomRight;

    for (x = x2; x >= x1; x -= 1) {
        for (y = y2; y >= y1; y -= 1) {
            bottom = distanceCM.get(x, y + 1);
            right = distanceCM.get(x + 1, y);
            bottomRight = distanceCM.get(x + 1, y + 1);
            topRight = distanceCM.get(x + 1, y - 1);
            bottomLeft = distanceCM.get(x - 1, y + 1);

            distanceCM.set(
                x,
                y,
                Math.min(
                    Math.min(bottom, right, bottomRight, topRight, bottomLeft) +
                        1,
                    distanceCM.get(x, y)
                )
            );
        }
    }

    if (enableVisuals) {

        for (x = x1; x <= x2; x += 1) {
            for (y = y1; y <= y2; y += 1) {
                const value = distanceCM.get(x, y);

                room.visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: `hsl(${200}${value * 10}, 100%, 60%)`,
                    opacity: 0.4,
                });

                room.visual.text(value.toString(), x, y, {
                    color: "white",
                    font: 0.5,
                    align: "center",
                    opacity: 0.8,
                });
            }
        }
    }

    return distanceCM;
};

/**
 * This is good for finding open diamond-shaped areas, as it voids adjacent diagonal tiles when finding distance
 */
Room.prototype.diagonalDistanceTransform = function (
    initialCM,
    enableVisuals,
    x1 = 0,
    y1 = 0,
    x2 = roomDimensions - 1,
    y2 = roomDimensions - 1
) {
    const room = this;

    const distanceCM = new PathFinder.CostMatrix();

    let x;
    let y;

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            distanceCM.set(x, y, initialCM.get(x, y) === 255 ? 0 : 255);
        }
    }

    let top;
    let left;

    for (x = x1; x <= x2; x += 1) {
        for (y = y1; y <= y2; y += 1) {
            top = distanceCM.get(x, y - 1);
            left = distanceCM.get(x - 1, y);

            distanceCM.set(
                x,
                y,
                Math.min(Math.min(top, left) + 1, distanceCM.get(x, y))
            );
        }
    }

    let bottom;
    let right;

    for (x = x2; x >= x1; x -= 1) {
        for (y = y2; y >= y1; y -= 1) {
            bottom = distanceCM.get(x, y + 1);
            right = distanceCM.get(x + 1, y);

            distanceCM.set(
                x,
                y,
                Math.min(Math.min(bottom, right) + 1, distanceCM.get(x, y))
            );
        }
    }

    if (enableVisuals) {

        for (x = x1; x <= x2; x += 1) {
            for (y = y1; y <= y2; y += 1) {
                const value = distanceCM.get(x, y);

                room.visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: `hsl(${200}${value * 10}, 100%, 60%)`,
                    opacity: 0.4,
                });

                room.visual.text(value.toString(), x, y, {
                    color: "white",
                    font: 0.5,
                    align: "center",
                    opacity: 0.8,
                });
            }
        }
    }

    return distanceCM;
};

function findPositionsInsideRect(rect) {
    const positions = [];

    for (let x = rect.x1; x <= rect.x2; x++) {
        for (let y = rect.y1; y <= rect.y2; y++) {

            if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions)
                continue;

            positions.push({ x, y });
        }
    }

    return positions;
}

Room.prototype.floodFill = function (seeds, blocks = [], visualize = false) {
    const room = this;

    const floodCM = new PathFinder.CostMatrix(),

        terrain = room.getTerrain(),

        visitedCM = new PathFinder.CostMatrix();

    let depth = 0,
        thisGeneration = seeds,
        nextGeneration = [];

    for (const pos of seeds) {

        visitedCM.set(pos.x, pos.y, 1);
    }

    while (thisGeneration.length) {

        nextGeneration = [];

        for (const pos of thisGeneration) {

            if (depth != 0) {
                if (
                    terrain.get(pos.x, pos.y) == TERRAIN_MASK_WALL ||
                    blocks.some((block) => block.x == pos.x && block.y == pos.y)
                )
                    continue;

                if (
                    Memory.rooms[room.name].buildings &&
                    Memory.rooms[room.name].buildings.some(
                        ({ x, y, structureType }) =>
                            x === pos.x &&
                            y === pos.y &&
                            structureType != STRUCTURE_ROAD
                    )
                )
                    continue;

                floodCM.set(pos.x, pos.y, depth);

                if (visualize) {
                    room.visual.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, {
                        fill: "hsl(" + 200 + depth * 2 + ", 100%, 60%)",
                        opacity: 0.4,
                    });
                    room.visual.text(depth, pos.x, pos.y, {
                        color: "white",
                        font: 0.5,
                        align: "center",
                        opacity: 0.8,
                    });
                }
            }

            const rect = {
                    x1: pos.x - 1,
                    y1: pos.y - 1,
                    x2: pos.x + 1,
                    y2: pos.y + 1,
                },
                adjacentPositions = findPositionsInsideRect(rect);

            for (const adjacentPos of adjacentPositions) {

                if (visitedCM.get(adjacentPos.x, adjacentPos.y) == 1) continue;

                visitedCM.set(adjacentPos.x, adjacentPos.y, 1);

                nextGeneration.push(adjacentPos);
            }
        }

        thisGeneration = nextGeneration;

        depth++;
    }

    return floodCM;
};

return module.exports;
}
/********** End of module 17: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\room.js **********/
/********** Start module 18: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\creep.js **********/
__modules[18] = function(module, exports) {
/** Example state - goto location */
Creep.prototype.runGoto = function (scope) {
    var { pos, range = 1 } = scope;
    var roomPos = _.create(RoomPosition.prototype, pos);
    if (this.moveTo(roomPos, { range: range }) === ERR_NO_PATH) this.popState();
};

/** Example state - goto room */
Creep.prototype.runGotoRoom = function (scope) {
    if (this.moveToRoom(scope) === ERR_NO_PATH) this.popState();
};

/** Example state - goto room */
Creep.prototype.runGetEnergy = function (scope) {
    let target = Game.getObjectById(scope);
    if (!this.pos.isNearTo(target)) {
        const moveStatus = this.moveTo(target);
        if (moveStatus != OK && moveStatus != ERR_TIRED) {
            this.popState();
            return false;
        }
    }
    if (target instanceof Structure || target instanceof Ruin) {
        if (target.store && target.store[RESOURCE_ENERGY] > 0) {
            if (this.withdraw(target, RESOURCE_ENERGY) != OK) {
                this.popState();
                return false;
            }
        }
    } else if (target instanceof Resource) {
        if (target.resourceType === RESOURCE_ENERGY) {
            if (this.pickup(target) != OK) {
                this.popState();
                return false;
            }
        }
    }

    if (!this.store.getFreeCapacity()) {
        this.popState();
        return false;
    }
};

/** Example state - goto room */
Creep.prototype.runUpgrade = function (scope) {
    let target = Game.getObjectById(scope);

    const status = this.upgradeController(target);

    if (status == ERR_NOT_IN_RANGE) {
        const moveStatus = this.moveTo(target);
        if (moveStatus != OK && moveStatus != ERR_TIRED) {
            this.popState();
            return false;
        }
    }

    if (!this.store.getUsedCapacity()) {
        this.popState();
    }
};

/** Example state - goto room */
Creep.prototype.runMine = function (scope) {
    let target = Game.getObjectById(scope);

    const status = this.harvest(target);

    if (status == ERR_NOT_IN_RANGE) {
        let otherMiners = this.room.find(FIND_MY_CREEPS, {
            filter: (c) => c.memory && c.memory.role == "miner" && c != this,
        });

        let allContainers = this.room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType == STRUCTURE_CONTAINER,
        });

        let targets = [];

        for (let container in allContainers) {
            let available = true;
            for (let miner in otherMiners) {
                if (
                    otherMiners[miner].pos.isEqualTo(
                        allContainers[container].pos
                    )
                ) {
                    available = false;
                    break;
                }
            }
            if (available) {
                targets.push(allContainers[container]);
            }
        }

        target = _.sortBy(targets, (s) => this.pos.getRangeTo(s))[0];

        this.pushState("Move", target.id);
        return true;
    }

    let nearLink = this.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) =>
            s.structureType == STRUCTURE_LINK &&
            s.isCollector() &&
            s.energy < s.energyCapacity,
    })[0];

    if (
        nearLink &&
        this.store.getUsedCapacity() &&
        !this.store.getFreeCapacity()
    ) {
        this.transfer(nearLink, RESOURCE_ENERGY);
    } else {
        this.harvest(target);
    }
};

/** Example state - goto room */
Creep.prototype.runBuild = function (scope) {
    let target = Game.getObjectById(scope);
    if (target instanceof ConstructionSite) {
        let status = this.build(target);

        if (status == OK) {
        } else if (status == ERR_NOT_IN_RANGE) {
            this.moveTo(target);
        } else {
            this.popState();
            return false;
        }

        if (!this.store.getUsedCapacity) {
            this.popState();
        }

        return true;
    } else if (target instanceof Structure) {
        let status = this.repair(target);

        if (status == OK) {
        } else if (status == ERR_NOT_IN_RANGE) {
            this.moveTo(target);
        } else {
            this.popState();
            return false;
        }

        if (target.hits == target.hitsMax) {
            this.popState();
        }

        if (!this.store.getUsedCapacity()) {
            this.popState();
        }

        return true;
    } else {
        this.popState();
        return false;
    }
};

return module.exports;
}
/********** End of module 18: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\creep.js **********/
/********** Start module 19: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\link.js **********/
__modules[19] = function(module, exports) {
StructureLink.prototype.isCollector = function () {
    if (this.memory.isCollector == undefined) {
        this.memory.isCollector =
            this.pos.findInRange(FIND_SOURCES, 2)[0] !== undefined;
    }

    return this.memory.isCollector;
};

return module.exports;
}
/********** End of module 19: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\prototypes\link.js **********/
/********** Start module 20: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\memory.js **********/
__modules[20] = function(module, exports) {
"use strict";

module.exports = {
    wrap(fn) {
        let memory;
        let tick;

        if (tick && tick + 1 === Game.time && memory) {
            delete global.Memory;
            Memory = memory;
        } else {
            memory = Memory;
        }

        tick = Game.time;

        fn();

        if (tick % 10000 == 0) {
            global.GCStructureMemory();
        }
        RawMemory._parsed = Memory;
    },
};
if (!Memory.structures) {
    console.log("[Memory] Initializing structure memory");
    Memory.structures = {};
}
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

return module.exports;
}
/********** End of module 20: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\memory.js **********/
/********** Start module 21: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\profiler.js **********/
__modules[21] = function(module, exports) {
"use strict";

let usedOnStart = 0;
let enabled = false;
let depth = 0;

function AlreadyWrappedError() {
    this.name = "AlreadyWrappedError";
    this.message = "Error attempted to double wrap a function.";
    this.stack = new Error().stack;
}

function setupProfiler() {
    depth = 0; // reset depth, this needs to be done each tick.
    Game.profiler = {
        stream(duration, filter) {
            setupMemory("stream", duration || 10, filter);
        },
        email(duration, filter) {
            setupMemory("email", duration || 100, filter);
        },
        profile(duration, filter) {
            setupMemory("profile", duration || 100, filter);
        },
        background(filter) {
            setupMemory("background", false, filter);
        },
        monitor(filter) {
            setupMemory("monitor", false, filter);
        },
        restart() {
            if (Profiler.isProfiling()) {
                const filter = Memory.profiler.filter;
                let duration = false;
                if (!!Memory.profiler.disableTick) {
                    duration =
                        Memory.profiler.disableTick -
                        Memory.profiler.enabledTick +
                        1;
                }
                const type = Memory.profiler.type;
                setupMemory(type, duration, filter);
            }
        },
        reset: resetMemory,
        output: Profiler.output,
    };

    overloadCPUCalc();
}

function setupMemory(profileType, duration, filter) {
    resetMemory();
    const disableTick = Number.isInteger(duration)
        ? Game.time + duration
        : false;
    if (!Memory.profiler) {
        Memory.profiler = {
            map: {},
            totalTime: 0,
            enabledTick: Game.time + 1,
            disableTick,
            type: profileType,
            filter,
        };
    }
}

function resetMemory() {
    Memory.profiler = null;
}

function overloadCPUCalc() {
    if (Game.rooms.sim) {
        usedOnStart = 0; // This needs to be reset, but only in the sim.
        Game.cpu.getUsed = function getUsed() {
            return performance.now() - usedOnStart;
        };
    }
}

function getFilter() {
    return Memory.profiler.filter;
}

const functionBlackList = [
    "getUsed", // Let's avoid wrapping this... may lead to recursion issues and should be inexpensive.
    "constructor", // es6 class constructors need to be called with `new`
];

function wrapFunction(name, originalFunction) {
    if (originalFunction.profilerWrapped) {
        throw new AlreadyWrappedError();
    }
    function wrappedFunction() {
        if (Profiler.isProfiling()) {
            const nameMatchesFilter = name === getFilter();
            const start = Game.cpu.getUsed();
            if (nameMatchesFilter) {
                depth++;
            }
            const result = originalFunction.apply(this, arguments);
            if (depth > 0 || !getFilter()) {
                const end = Game.cpu.getUsed();
                Profiler.record(name, end - start);
            }
            if (nameMatchesFilter) {
                depth--;
            }
            return result;
        }

        return originalFunction.apply(this, arguments);
    }

    wrappedFunction.profilerWrapped = true;
    wrappedFunction.toString = () =>
        `// screeps-profiler wrapped function:\n${originalFunction.toString()}`;

    return wrappedFunction;
}

function hookUpPrototypes() {
    Profiler.prototypes.forEach((proto) => {
        profileObjectFunctions(proto.val, proto.name);
    });
}

function profileObjectFunctions(object, label) {
    const objectToWrap = object.prototype ? object.prototype : object;

    Object.getOwnPropertyNames(objectToWrap).forEach((functionName) => {
        const extendedLabel = `${label}.${functionName}`;

        const isBlackListed = functionBlackList.indexOf(functionName) !== -1;
        if (isBlackListed) {
            return;
        }

        const descriptor = Object.getOwnPropertyDescriptor(
            objectToWrap,
            functionName
        );
        if (!descriptor) {
            return;
        }

        const hasAccessor = descriptor.get || descriptor.set;
        if (hasAccessor) {
            const configurable = descriptor.configurable;
            if (!configurable) {
                return;
            }

            const profileDescriptor = {};

            if (descriptor.get) {
                const extendedLabelGet = `${extendedLabel}:get`;
                profileDescriptor.get = profileFunction(
                    descriptor.get,
                    extendedLabelGet
                );
            }

            if (descriptor.set) {
                const extendedLabelSet = `${extendedLabel}:set`;
                profileDescriptor.set = profileFunction(
                    descriptor.set,
                    extendedLabelSet
                );
            }

            Object.defineProperty(
                objectToWrap,
                functionName,
                profileDescriptor
            );
            return;
        }

        const isFunction = typeof descriptor.value === "function";
        if (!isFunction) {
            return;
        }
        const originalFunction = objectToWrap[functionName];
        objectToWrap[functionName] = profileFunction(
            originalFunction,
            extendedLabel
        );
    });

    return objectToWrap;
}

function profileFunction(fn, functionName) {
    const fnName = functionName || fn.name;
    if (!fnName) {
        console.log("Couldn't find a function name for - ", fn);
        console.log("Will not profile this function.");
        return fn;
    }

    return wrapFunction(fnName, fn);
}

const Profiler = {
    printProfile() {
        console.log(Profiler.output());
    },

    emailProfile() {
        Game.notify(Profiler.output(1000));
    },

    output(passedOutputLengthLimit) {
        const outputLengthLimit = passedOutputLengthLimit || 1000;
        if (!Memory.profiler || !Memory.profiler.enabledTick) {
            return "Profiler not active.";
        }

        const endTick = Math.min(
            Memory.profiler.disableTick || Game.time,
            Game.time
        );
        const startTick = Memory.profiler.enabledTick + 1;
        const elapsedTicks = endTick - startTick;
        const header = "calls\t\ttime\t\tavg\t\tfunction";
        const footer = [
            `Avg: ${(Memory.profiler.totalTime / elapsedTicks).toFixed(2)}`,
            `Total: ${Memory.profiler.totalTime.toFixed(2)}`,
            `Ticks: ${elapsedTicks}`,
        ].join("\t");

        const lines = [header];
        let currentLength = header.length + 1 + footer.length;
        const allLines = Profiler.lines();
        let done = false;
        while (!done && allLines.length) {
            const line = allLines.shift();
            if (currentLength + line.length + 1 < outputLengthLimit) {
                lines.push(line);
                currentLength += line.length + 1;
            } else {
                done = true;
            }
        }
        lines.push(footer);
        return lines.join("\n");
    },

    lines() {
        const stats = Object.keys(Memory.profiler.map)
            .map((functionName) => {
                const functionCalls = Memory.profiler.map[functionName];
                return {
                    name: functionName,
                    calls: functionCalls.calls,
                    totalTime: functionCalls.time,
                    averageTime: functionCalls.time / functionCalls.calls,
                };
            })
            .sort((val1, val2) => {
                return val2.totalTime - val1.totalTime;
            });

        const lines = stats.map((data) => {
            return [
                data.calls,
                data.totalTime.toFixed(1),
                data.averageTime.toFixed(3),
                data.name,
            ].join("\t\t");
        });

        return lines;
    },

    prototypes: [
        { name: "Game", val: Game },
        { name: "Room", val: Room },
        { name: "Structure", val: Structure },
        { name: "Spawn", val: Spawn },
        { name: "Creep", val: Creep },
        { name: "RoomPosition", val: RoomPosition },
        { name: "Source", val: Source },
        { name: "Flag", val: Flag },
    ],

    record(functionName, time) {
        if (!Memory.profiler.map[functionName]) {
            Memory.profiler.map[functionName] = {
                time: 0,
                calls: 0,
            };
        }
        Memory.profiler.map[functionName].calls++;
        Memory.profiler.map[functionName].time += time;
    },

    endTick() {
        if (Game.time >= Memory.profiler.enabledTick) {
            const cpuUsed = Game.cpu.getUsed();
            Memory.profiler.totalTime += cpuUsed;
            Profiler.report();
        }
    },

    report() {
        if (Profiler.shouldPrint()) {
            Profiler.printProfile();
        } else if (Profiler.shouldEmail()) {
            Profiler.emailProfile();
        }
    },

    isProfiling() {
        if (!enabled || !Memory.profiler) {
            return false;
        }
        return (
            !Memory.profiler.disableTick ||
            Game.time <= Memory.profiler.disableTick
        );
    },

    type() {
        return Memory.profiler.type;
    },

    shouldPrint() {
        const streaming = Profiler.type() === "stream";
        const profiling = Profiler.type() === "profile";
        const onEndingTick = Memory.profiler.disableTick === Game.time;
        return streaming || (profiling && onEndingTick);
    },

    shouldEmail() {
        return (
            Profiler.type() === "email" &&
            Memory.profiler.disableTick === Game.time
        );
    },
};

module.exports = {
    wrap(callback) {
        if (enabled) {
            setupProfiler();
        }

        if (Profiler.isProfiling()) {
            if (Memory.profiler.type == "monitor") {
                setupMemory(
                    Memory.profiler.type,
                    Memory.profiler.disableTick - Game.time,
                    Memory.profiler.filter
                );
            }
            usedOnStart = Game.cpu.getUsed();
            const returnVal = callback();
            Profiler.endTick();

            if (Memory.profiler.type == "monitor") {
            }
            return returnVal;
        }

        return callback();
    },

    enable() {
        enabled = true;
        hookUpPrototypes();
    },

    output: Profiler.output,

    registerObject: profileObjectFunctions,
    registerFN: profileFunction,
    registerClass: profileObjectFunctions,
};

return module.exports;
}
/********** End of module 21: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\profiler.js **********/
/********** Start module 22: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\visual-room.js **********/
__modules[22] = function(module, exports) {
const colors = {
    gray: "#555555",
    light: "#AAAAAA",
    road: "#666", // >:D
    energy: "#FFE87B",
    power: "#F53547",
    dark: "#181818",
    outline: "#8FBB93",
    speechText: "#000000",
    speechBackground: "#2ccf3b",
};

const speechSize = 0.5;
const speechFont = "Times New Roman";
function calculateFactoryLevelGapsPoly() {
    let x = -0.08;
    let y = -0.52;
    let result = [];

    let gapAngle = 16 * (Math.PI / 180);
    let c1 = Math.cos(gapAngle);
    let s1 = Math.sin(gapAngle);

    let angle = 72 * (Math.PI / 180);
    let c2 = Math.cos(angle);
    let s2 = Math.sin(angle);

    for (let i = 0; i < 5; ++i) {
        result.push([0.0, 0.0]);
        result.push([x, y]);
        result.push([x * c1 - y * s1, x * s1 + y * c1]);
        let tmpX = x * c2 - y * s2;
        y = x * s2 + y * c2;
        x = tmpX;
    }
    return result;
}
const factoryLevelGaps = calculateFactoryLevelGapsPoly();

RoomVisual.prototype.structure = function (x, y, type, opts = {}) {
    opts = Object.assign(
        {
            opacity: 1,
        },
        opts
    );
    switch (type) {
        case STRUCTURE_FACTORY: {
            const outline = [
                [-0.68, -0.11],
                [-0.84, -0.18],
                [-0.84, -0.32],
                [-0.44, -0.44],
                [-0.32, -0.84],
                [-0.18, -0.84],
                [-0.11, -0.68],

                [0.11, -0.68],
                [0.18, -0.84],
                [0.32, -0.84],
                [0.44, -0.44],
                [0.84, -0.32],
                [0.84, -0.18],
                [0.68, -0.11],

                [0.68, 0.11],
                [0.84, 0.18],
                [0.84, 0.32],
                [0.44, 0.44],
                [0.32, 0.84],
                [0.18, 0.84],
                [0.11, 0.68],

                [-0.11, 0.68],
                [-0.18, 0.84],
                [-0.32, 0.84],
                [-0.44, 0.44],
                [-0.84, 0.32],
                [-0.84, 0.18],
                [-0.68, 0.11],
            ];
            this.poly(
                outline.map((p) => [p[0] + x, p[1] + y]),
                {
                    fill: null,
                    stroke: colors.outline,
                    strokeWidth: 0.05,
                    opacity: opts.opacity,
                }
            );
            this.circle(x, y, {
                radius: 0.65,
                fill: "#232323",
                strokeWidth: 0.035,
                stroke: "#140a0a",
                opacity: opts.opacity,
            });
            const spikes = [
                [-0.4, -0.1],
                [-0.8, -0.2],
                [-0.8, -0.3],
                [-0.4, -0.4],
                [-0.3, -0.8],
                [-0.2, -0.8],
                [-0.1, -0.4],

                [0.1, -0.4],
                [0.2, -0.8],
                [0.3, -0.8],
                [0.4, -0.4],
                [0.8, -0.3],
                [0.8, -0.2],
                [0.4, -0.1],

                [0.4, 0.1],
                [0.8, 0.2],
                [0.8, 0.3],
                [0.4, 0.4],
                [0.3, 0.8],
                [0.2, 0.8],
                [0.1, 0.4],

                [-0.1, 0.4],
                [-0.2, 0.8],
                [-0.3, 0.8],
                [-0.4, 0.4],
                [-0.8, 0.3],
                [-0.8, 0.2],
                [-0.4, 0.1],
            ];
            this.poly(
                spikes.map((p) => [p[0] + x, p[1] + y]),
                {
                    fill: colors.gray,
                    stroke: "#140a0a",
                    strokeWidth: 0.04,
                    opacity: opts.opacity,
                }
            );
            this.circle(x, y, {
                radius: 0.54,
                fill: "#302a2a",
                strokeWidth: 0.04,
                stroke: "#140a0a",
                opacity: opts.opacity,
            });
            this.poly(
                factoryLevelGaps.map((p) => [p[0] + x, p[1] + y]),
                {
                    fill: "#140a0a",
                    stroke: null,
                    opacity: opts.opacity,
                }
            );
            this.circle(x, y, {
                radius: 0.42,
                fill: "#140a0a",
                opacity: opts.opacity,
            });
            this.rect(x - 0.24, y - 0.24, 0.48, 0.48, {
                fill: "#3f3f3f",
                opacity: opts.opacity,
            });
            break;
        }
        case STRUCTURE_EXTENSION:
            this.circle(x, y, {
                radius: 0.5,
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity,
            });
            this.circle(x, y, {
                radius: 0.35,
                fill: colors.gray,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_SPAWN:
            this.circle(x, y, {
                radius: 0.65,
                fill: colors.dark,
                stroke: "#CCCCCC",
                strokeWidth: 0.1,
                opacity: opts.opacity,
            });
            this.circle(x, y, {
                radius: 0.4,
                fill: colors.energy,
                opacity: opts.opacity,
            });

            break;
        case STRUCTURE_POWER_SPAWN:
            this.circle(x, y, {
                radius: 0.65,
                fill: colors.dark,
                stroke: colors.power,
                strokeWidth: 0.1,
                opacity: opts.opacity,
            });
            this.circle(x, y, {
                radius: 0.4,
                fill: colors.energy,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_LINK: {
            let osize = 0.3;
            let isize = 0.2;
            let outer = [
                [0.0, -0.5],
                [0.4, 0.0],
                [0.0, 0.5],
                [-0.4, 0.0],
            ];
            let inner = [
                [0.0, -0.3],
                [0.25, 0.0],
                [0.0, 0.3],
                [-0.25, 0.0],
            ];
            outer = relPoly(x, y, outer);
            inner = relPoly(x, y, inner);
            outer.push(outer[0]);
            inner.push(inner[0]);
            this.poly(outer, {
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity,
            });
            this.poly(inner, {
                fill: colors.gray,
                stroke: false,
                opacity: opts.opacity,
            });
            break;
        }
        case STRUCTURE_TERMINAL: {
            let outer = [
                [0.0, -0.8],
                [0.55, -0.55],
                [0.8, 0.0],
                [0.55, 0.55],
                [0.0, 0.8],
                [-0.55, 0.55],
                [-0.8, 0.0],
                [-0.55, -0.55],
            ];
            let inner = [
                [0.0, -0.65],
                [0.45, -0.45],
                [0.65, 0.0],
                [0.45, 0.45],
                [0.0, 0.65],
                [-0.45, 0.45],
                [-0.65, 0.0],
                [-0.45, -0.45],
            ];
            outer = relPoly(x, y, outer);
            inner = relPoly(x, y, inner);
            outer.push(outer[0]);
            inner.push(inner[0]);
            this.poly(outer, {
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity,
            });
            this.poly(inner, {
                fill: colors.light,
                stroke: false,
                opacity: opts.opacity,
            });
            this.rect(x - 0.45, y - 0.45, 0.9, 0.9, {
                fill: colors.gray,
                stroke: colors.dark,
                strokeWidth: 0.1,
                opacity: opts.opacity,
            });
            break;
        }
        case STRUCTURE_LAB:
            this.circle(x, y - 0.025, {
                radius: 0.55,
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity,
            });
            this.circle(x, y - 0.025, {
                radius: 0.4,
                fill: colors.gray,
                opacity: opts.opacity,
            });
            this.rect(x - 0.45, y + 0.3, 0.9, 0.25, {
                fill: colors.dark,
                stroke: false,
                opacity: opts.opacity,
            });
            {
                let box = [
                    [-0.45, 0.3],
                    [-0.45, 0.55],
                    [0.45, 0.55],
                    [0.45, 0.3],
                ];
                box = relPoly(x, y, box);
                this.poly(box, {
                    stroke: colors.outline,
                    strokeWidth: 0.05,
                    opacity: opts.opacity,
                });
            }
            break;
        case STRUCTURE_TOWER:
            this.circle(x, y, {
                radius: 0.6,
                fill: colors.dark,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity,
            });
            this.rect(x - 0.4, y - 0.3, 0.8, 0.6, {
                fill: colors.gray,
                opacity: opts.opacity,
            });
            this.rect(x - 0.2, y - 0.9, 0.4, 0.5, {
                fill: colors.light,
                stroke: colors.dark,
                strokeWidth: 0.07,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_ROAD:
            this.circle(x, y, {
                radius: 0.175,
                fill: colors.road,
                stroke: false,
                opacity: opts.opacity,
            });
            if (!this.roads) this.roads = [];
            this.roads.push([x, y]);
            break;
        case STRUCTURE_RAMPART:
            this.circle(x, y, {
                radius: 0.65,
                fill: "#434C43",
                stroke: "#5D735F",
                strokeWidth: 0.1,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_WALL:
            this.circle(x, y, {
                radius: 0.4,
                fill: colors.dark,
                stroke: colors.light,
                strokeWidth: 0.05,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_STORAGE:
            let outline1 = relPoly(x, y, [
                [-0.45, -0.55],
                [0, -0.65],
                [0.45, -0.55],
                [0.55, 0],
                [0.45, 0.55],
                [0, 0.65],
                [-0.45, 0.55],
                [-0.55, 0],
                [-0.45, -0.55],
            ]);
            this.poly(outline1, {
                stroke: colors.outline,
                strokeWidth: 0.05,
                fill: colors.dark,
                opacity: opts.opacity,
            });
            this.rect(x - 0.35, y - 0.45, 0.7, 0.9, {
                fill: colors.energy,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_OBSERVER:
            this.circle(x, y, {
                fill: colors.dark,
                radius: 0.45,
                stroke: colors.outline,
                strokeWidth: 0.05,
                opacity: opts.opacity,
            });
            this.circle(x + 0.225, y, {
                fill: colors.outline,
                radius: 0.2,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_NUKER:
            let outline = [
                [0, -1],
                [-0.47, 0.2],
                [-0.5, 0.5],
                [0.5, 0.5],
                [0.47, 0.2],
                [0, -1],
            ];
            outline = relPoly(x, y, outline);
            this.poly(outline, {
                stroke: colors.outline,
                strokeWidth: 0.05,
                fill: colors.dark,
                opacity: opts.opacity,
            });
            let inline = [
                [0, -0.8],
                [-0.4, 0.2],
                [0.4, 0.2],
                [0, -0.8],
            ];
            inline = relPoly(x, y, inline);
            this.poly(inline, {
                stroke: colors.outline,
                strokeWidth: 0.01,
                fill: colors.gray,
                opacity: opts.opacity,
            });
            break;
        case STRUCTURE_CONTAINER:
            this.rect(x - 0.225, y - 0.3, 0.45, 0.6, {
                fill: colors.gray,
                opacity: opts.opacity,
                stroke: colors.dark,
                strokeWidth: 0.09,
            });
            this.rect(x - 0.17, y + 0.07, 0.34, 0.2, {
                fill: colors.energy,
                opacity: opts.opacity,
            });
            break;
        default:
            this.circle(x, y, {
                fill: colors.light,
                radius: 0.35,
                stroke: colors.dark,
                strokeWidth: 0.2,
                opacity: opts.opacity,
            });
            break;
    }

    return this;
};

const dirs = [
    [],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
];

RoomVisual.prototype.connectRoads = function (opts = {}) {
    let color = opts.color || colors.road || "white";
    if (!this.roads) return;
    this.roads.forEach((r) => {
        for (let i = 1; i <= 4; i++) {
            let d = dirs[i];
            let c = [r[0] + d[0], r[1] + d[1]];
            let rd = _.some(this.roads, (r) => r[0] == c[0] && r[1] == c[1]);
            if (rd) {
                this.line(r[0], r[1], c[0], c[1], {
                    color: color,
                    width: 0.35,
                    opacity: opts.opacity || 1,
                });
            }
        }
    });

    return this;
};

RoomVisual.prototype.speech = function (text, x, y, opts = {}) {
    var background = !!opts.background
        ? opts.background
        : colors.speechBackground;
    var textcolor = !!opts.textcolor ? opts.textcolor : colors.speechText;
    var textstyle = !!opts.textstyle ? opts.textstyle : false;
    var textsize = !!opts.textsize ? opts.textsize : speechSize;
    var textfont = !!opts.textfont ? opts.textfont : speechFont;
    var opacity = !!opts.opacity ? opts.opacity : 1;

    var fontstring = "";
    if (textstyle) {
        fontstring = textstyle + " ";
    }
    fontstring += textsize + " " + textfont;

    let pointer = [
        [-0.2, -0.8],
        [0.2, -0.8],
        [0, -0.3],
    ];
    pointer = relPoly(x, y, pointer);
    pointer.push(pointer[0]);

    this.poly(pointer, {
        fill: background,
        stroke: background,
        opacity: opacity,
        strokeWidth: 0.0,
    });

    this.text(text, x, y - 1, {
        color: textcolor,
        backgroundColor: background,
        backgroundPadding: 0.1,
        opacity: opacity,
        font: fontstring,
    });

    return this;
};

RoomVisual.prototype.animatedPosition = function (x, y, opts = {}) {
    let color = !!opts.color ? opts.color : "blue";
    let opacity = !!opts.opacity ? opts.opacity : 0.5;
    let radius = !!opts.radius ? opts.radius : 0.75;
    let frames = !!opts.frames ? opts.frames : 6;

    let angle = (((Game.time % frames) * 90) / frames) * (Math.PI / 180);
    let s = Math.sin(angle);
    let c = Math.cos(angle);

    let sizeMod = Math.abs((Game.time % frames) - frames / 2) / 10;
    radius += radius * sizeMod;

    let points = [
        rotate(0, -radius, s, c, x, y),
        rotate(radius, 0, s, c, x, y),
        rotate(0, radius, s, c, x, y),
        rotate(-radius, 0, s, c, x, y),
        rotate(0, -radius, s, c, x, y),
    ];

    this.poly(points, { stroke: color, opacity: opacity });

    return this;
};

function rotate(x, y, s, c, px, py) {
    let xDelta = x * c - y * s;
    let yDelta = x * s + y * c;
    return { x: px + xDelta, y: py + yDelta };
}

function relPoly(x, y, poly) {
    return poly.map((p) => {
        p[0] += x;
        p[1] += y;
        return p;
    });
}

RoomVisual.prototype.test = function test() {
    let demopos = [19, 24];
    this.clear();
    this.structure(demopos[0] + 0, demopos[1] + 0, STRUCTURE_LAB);
    this.structure(demopos[0] + 1, demopos[1] + 1, STRUCTURE_TOWER);
    this.structure(demopos[0] + 2, demopos[1] + 0, STRUCTURE_LINK);
    this.structure(demopos[0] + 3, demopos[1] + 1, STRUCTURE_TERMINAL);
    this.structure(demopos[0] + 4, demopos[1] + 0, STRUCTURE_EXTENSION);
    this.structure(demopos[0] + 5, demopos[1] + 1, STRUCTURE_SPAWN);

    return this;
};
const ColorSets = {
    white: ["#ffffff", "#4c4c4c"],
    grey: ["#b4b4b4", "#4c4c4c"],
    red: ["#ff7b7b", "#592121"],
    yellow: ["#fdd388", "#5d4c2e"],
    green: ["#00f4a2", "#236144"],
    blue: ["#50d7f9", "#006181"],
    purple: ["#a071ff", "#371383"],
};
const ResourceColors = {
    [RESOURCE_ENERGY]: ColorSets.yellow,
    [RESOURCE_POWER]: ColorSets.red,

    [RESOURCE_HYDROGEN]: ColorSets.grey,
    [RESOURCE_OXYGEN]: ColorSets.grey,
    [RESOURCE_UTRIUM]: ColorSets.blue,
    [RESOURCE_LEMERGIUM]: ColorSets.green,
    [RESOURCE_KEANIUM]: ColorSets.purple,
    [RESOURCE_ZYNTHIUM]: ColorSets.yellow,
    [RESOURCE_CATALYST]: ColorSets.red,
    [RESOURCE_GHODIUM]: ColorSets.white,

    [RESOURCE_HYDROXIDE]: ColorSets.grey,
    [RESOURCE_ZYNTHIUM_KEANITE]: ColorSets.grey,
    [RESOURCE_UTRIUM_LEMERGITE]: ColorSets.grey,

    [RESOURCE_UTRIUM_HYDRIDE]: ColorSets.blue,
    [RESOURCE_UTRIUM_OXIDE]: ColorSets.blue,
    [RESOURCE_KEANIUM_HYDRIDE]: ColorSets.purple,
    [RESOURCE_KEANIUM_OXIDE]: ColorSets.purple,
    [RESOURCE_LEMERGIUM_HYDRIDE]: ColorSets.green,
    [RESOURCE_LEMERGIUM_OXIDE]: ColorSets.green,
    [RESOURCE_ZYNTHIUM_HYDRIDE]: ColorSets.yellow,
    [RESOURCE_ZYNTHIUM_OXIDE]: ColorSets.yellow,
    [RESOURCE_GHODIUM_HYDRIDE]: ColorSets.white,
    [RESOURCE_GHODIUM_OXIDE]: ColorSets.white,

    [RESOURCE_UTRIUM_ACID]: ColorSets.blue,
    [RESOURCE_UTRIUM_ALKALIDE]: ColorSets.blue,
    [RESOURCE_KEANIUM_ACID]: ColorSets.purple,
    [RESOURCE_KEANIUM_ALKALIDE]: ColorSets.purple,
    [RESOURCE_LEMERGIUM_ACID]: ColorSets.green,
    [RESOURCE_LEMERGIUM_ALKALIDE]: ColorSets.green,
    [RESOURCE_ZYNTHIUM_ACID]: ColorSets.yellow,
    [RESOURCE_ZYNTHIUM_ALKALIDE]: ColorSets.yellow,
    [RESOURCE_GHODIUM_ACID]: ColorSets.white,
    [RESOURCE_GHODIUM_ALKALIDE]: ColorSets.white,

    [RESOURCE_CATALYZED_UTRIUM_ACID]: ColorSets.blue,
    [RESOURCE_CATALYZED_UTRIUM_ALKALIDE]: ColorSets.blue,
    [RESOURCE_CATALYZED_KEANIUM_ACID]: ColorSets.purple,
    [RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: ColorSets.purple,
    [RESOURCE_CATALYZED_LEMERGIUM_ACID]: ColorSets.green,
    [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]: ColorSets.green,
    [RESOURCE_CATALYZED_ZYNTHIUM_ACID]: ColorSets.yellow,
    [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: ColorSets.yellow,
    [RESOURCE_CATALYZED_GHODIUM_ACID]: ColorSets.white,
    [RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: ColorSets.white,
};

const MINERALS = [
    RESOURCE_CATALYST,
    RESOURCE_HYDROGEN,
    RESOURCE_OXYGEN,
    RESOURCE_LEMERGIUM,
    RESOURCE_UTRIUM,
    RESOURCE_ZYNTHIUM,
    RESOURCE_KEANIUM,
];

if (global.SYMBOLS) {
    const SYMBOL_MAP = {
        [RESOURCE_SYMBOL_ALEPH]: "𐤀",
        [RESOURCE_SYMBOL_BETH]: "𐤁",
        [RESOURCE_SYMBOL_GIMMEL]: "𐤂",
        [RESOURCE_SYMBOL_DALETH]: "𐤃",
        [RESOURCE_SYMBOL_HE]: "𐤄",
        [RESOURCE_SYMBOL_WAW]: "𐤅",
        [RESOURCE_SYMBOL_ZAYIN]: "𐤆",
        [RESOURCE_SYMBOL_HETH]: "𐤇",
        [RESOURCE_SYMBOL_TETH]: "𐤈",
        [RESOURCE_SYMBOL_YODH]: "𐤉",
        [RESOURCE_SYMBOL_KAPH]: "𐤊",
        [RESOURCE_SYMBOL_LAMEDH]: "𐤋",
        [RESOURCE_SYMBOL_MEM]: "𐤌",
        [RESOURCE_SYMBOL_NUN]: "𐤍",
        [RESOURCE_SYMBOL_SAMEKH]: "𐤎",
        [RESOURCE_SYMBOL_AYIN]: "𐤏",
        [RESOURCE_SYMBOL_PE]: "𐤐",
        [RESOURCE_SYMBOL_TSADE]: "𐤑",
        [RESOURCE_SYMBOL_QOPH]: "𐤒",
        [RESOURCE_SYMBOL_RES]: "𐤓",
        [RESOURCE_SYMBOL_SIN]: "𐤔",
        [RESOURCE_SYMBOL_TAW]: "𐤕",
    };

    const SYMBOL_COLORS = {
        [RESOURCE_SYMBOL_ALEPH]: "#C63946",
        [RESOURCE_SYMBOL_BETH]: "#B72E6F",
        [RESOURCE_SYMBOL_GIMMEL]: "#B72FA5",
        [RESOURCE_SYMBOL_DALETH]: "#A334B7",
        [RESOURCE_SYMBOL_HE]: "#9D41ED",
        [RESOURCE_SYMBOL_WAW]: "#8441ED",
        [RESOURCE_SYMBOL_ZAYIN]: "#6E49FF",
        [RESOURCE_SYMBOL_HETH]: "#4E71FF",
        [RESOURCE_SYMBOL_TETH]: "#5088F4",
        [RESOURCE_SYMBOL_YODH]: "#3DA1EA",
        [RESOURCE_SYMBOL_KAPH]: "#38A9C7",
        [RESOURCE_SYMBOL_LAMEDH]: "#35B7B5",
        [RESOURCE_SYMBOL_MEM]: "#36B79A",
        [RESOURCE_SYMBOL_NUN]: "#33B75D",
        [RESOURCE_SYMBOL_SAMEKH]: "#3FB147",
        [RESOURCE_SYMBOL_AYIN]: "#69A239",
        [RESOURCE_SYMBOL_PE]: "#7EA232",
        [RESOURCE_SYMBOL_TSADE]: "#9FA23B",
        [RESOURCE_SYMBOL_QOPH]: "#BB933A",
        [RESOURCE_SYMBOL_RES]: "#D88942",
        [RESOURCE_SYMBOL_SIN]: "#DC763D",
        [RESOURCE_SYMBOL_TAW]: "#D64B3D",
    };
    RoomVisual.prototype._symbol = function (type, x, y, size = 0.25) {
        const outline = [
            [64, 128],
            [24.45, 121.78],
            [6.31, 86.07],
            [0, 46.52],
            [28.35, 18.23],
            [64, 0],
            [99.65, 18.23],
            [128, 46.52],
            [121.69, 86.07],
            [103.55, 121.78],
            [64, 128],
        ]
            .map(([x, y]) => [x - 64, y - 64])
            .map(([x, y]) => [x / 128, y / 128]);
        this.poly(relPoly(x, y, outline, size), {
            opacity: 1,
            fill: SYMBOL_COLORS[type],
            stroke: "transparent",
        });
        this.text(SYMBOL_MAP[type], x, y + size * 0.35, {
            font: `bold ${size * 0.8} arial`,
            color: "black",
        });
        return this;
    };
}
RoomVisual.prototype.resource = function (type, x, y, size = 0.25) {
    if (type == RESOURCE_ENERGY || type == RESOURCE_POWER)
        this._fluid(type, x, y, size);
    else if (MINERALS.includes(type)) this._mineral(type, x, y, size);
    else if (ResourceColors[type] != undefined)
        this._compound(type, x, y, size);
    else if (global.SYMBOLS && SYMBOLS.includes(type))
        this._symbol(type, x, y, size);
    else return ERR_INVALID_ARGS;
    return OK;
};
RoomVisual.prototype._fluid = function (type, x, y, size = 0.25) {
    this.circle(x, y, {
        radius: size,
        fill: ResourceColors[type][0],
        opacity: 1,
    });
    this.text(type[0], x, y - size * 0.1, {
        font: size * 1.5,
        color: ResourceColors[type][1],
        backgroundColor: ResourceColors[type][0],
        backgroundPadding: 0,
    });
};
RoomVisual.prototype._mineral = function (type, x, y, size = 0.25) {
    this.circle(x, y, {
        radius: size,
        fill: ResourceColors[type][0],
        opacity: 1,
    });
    this.circle(x, y, {
        radius: size * 0.8,
        fill: ResourceColors[type][1],
        opacity: 1,
    });
    this.text(type, x, y + size * 0.03, {
        font: "bold " + size * 1.25 + " arial",
        color: ResourceColors[type][0],
        backgroundColor: ResourceColors[type][1],
        backgroundPadding: 0,
    });
};
RoomVisual.prototype._compound = function (type, x, y, size = 0.25) {
    let label = type.replace("2", "₂");

    this.text(label, x, y, {
        font: "bold " + size * 1 + " arial",
        color: ResourceColors[type][1],
        backgroundColor: ResourceColors[type][0],
        backgroundPadding: 0.3 * size,
    });
};

return module.exports;
}
/********** End of module 22: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\visual-room.js **********/
/********** Start module 23: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\stats.js **********/
__modules[23] = function(module, exports) {
// Call this function at the end of your main loop

function exportStats() {
    Memory.stats = {
        gcl: {},
        rooms: {},
        cpu: {},
    };

    Memory.stats.time = Game.time;
    for (let roomName in Game.rooms) {
        let room = Game.rooms[roomName];
        let isMyRoom = room.controller ? room.controller.my : false;
        if (isMyRoom) {
            let roomStats = (Memory.stats.rooms[roomName] = {});
            roomStats.storageEnergy = room.storage
                ? room.storage.store.energy
                : 0;
            roomStats.terminalEnergy = room.terminal
                ? room.terminal.store.energy
                : 0;
            roomStats.energyAvailable = room.energyAvailable;
            roomStats.energyCapacityAvailable = room.energyCapacityAvailable;
            roomStats.controllerProgress = room.controller.progress;
            roomStats.controllerProgressTotal = room.controller.progressTotal;
            roomStats.controllerLevel = room.controller.level;
        }
    }
    Memory.stats.gcl.progress = Game.gcl.progress;
    Memory.stats.gcl.progressTotal = Game.gcl.progressTotal;
    Memory.stats.gcl.level = Game.gcl.level;
    Memory.stats.cpu.bucket = Game.cpu.bucket;
    Memory.stats.cpu.limit = Game.cpu.limit;
    Memory.stats.cpu.used = Game.cpu.getUsed();
}

module.exports = exportStats;

return module.exports;
}
/********** End of module 23: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\stats.js **********/
/********** Start module 24: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\mincut.js **********/
__modules[24] = function(module, exports) {
/**
 * Posted 10 may 2018 by @saruss
 *
 * Code for calculating the minCut in a room, written by Saruss
 * adapted (for Typescript by Chobobobo , is it somewhere?)
 * some readability added by Chobobobo @typescript was included here
 * (15Aug2019) Updated Game.map.getTerrainAt to Game.map.getRoomTerrain method -Shibdib
 */

const UNWALKABLE = -1;
const NORMAL = 0;
const PROTECTED = 1;
const TO_EXIT = 2;
const EXIT = 3;

/**
 * An Array with Terrain information: -1 not usable, 2 Sink (Leads to Exit)
 */
function room_2d_array(roomname, bounds = { x1: 0, y1: 0, x2: 49, y2: 49 }) {
    let room_2d = Array(50)
        .fill(0)
        .map((x) => Array(50).fill(UNWALKABLE)); // Array for room tiles
    let i = bounds.x1;
    const imax = bounds.x2;
    let j = bounds.y1;
    const jmax = bounds.y2;
    const terrain = Game.map.getRoomTerrain(roomname);
    for (; i <= imax; i++) {
        j = bounds.y1;
        for (; j <= jmax; j++) {
            if (terrain.get(i, j) !== TERRAIN_MASK_WALL) {
                room_2d[i][j] = NORMAL; // mark unwalkable
                if (
                    i === bounds.x1 ||
                    j === bounds.y1 ||
                    i === bounds.x2 ||
                    j === bounds.y2
                )
                    room_2d[i][j] = TO_EXIT; // Sink Tiles mark from given bounds
                if (i === 0 || j === 0 || i === 49 || j === 49)
                    room_2d[i][j] = EXIT; // Exit Tiles mark
            }
        }
    }

    /* OLD CODE
    let terrain_array=room.lookForAtArea(LOOK_TERRAIN,0,0,49,49,true);
    if (terrain_array.length == 0) {
        console.log('get_room_array in room_layout, look-at-for-Area Fehler');
    }
    let terrain='';
    let x_pos=0;
    let y_pos=0;
    let i=0;const imax=terrain_array.length;
    for (;i<imax;i++) { // Filling array with terrain information
        terrain=terrain_array[i];
        x_pos=terrain.x;
        y_pos=terrain.y;
        if (terrain.terrain==='wall') {
            room_2d[x_pos][y_pos]=-1; // mark unwalkable
        } else {
            if (x_pos===0 || y_pos===0 ||x_pos===49 || y_pos===49)
                room_2d[x_pos][y_pos]=3; // Exit Tiles mark
        }
    }
    ENDE OLD CODE */
    let y = 1;
    const max = 49;
    for (; y < max; y++) {
        if (room_2d[0][y - 1] === EXIT) room_2d[1][y] = TO_EXIT;
        if (room_2d[0][y] === EXIT) room_2d[1][y] = TO_EXIT;
        if (room_2d[0][y + 1] === EXIT) room_2d[1][y] = TO_EXIT;
        if (room_2d[49][y - 1] === EXIT) room_2d[48][y] = TO_EXIT;
        if (room_2d[49][y] === EXIT) room_2d[48][y] = TO_EXIT;
        if (room_2d[49][y + 1] === EXIT) room_2d[48][y] = TO_EXIT;
    }
    let x = 1;
    for (; x < max; x++) {
        if (room_2d[x - 1][0] === EXIT) room_2d[x][1] = TO_EXIT;
        if (room_2d[x][0] === EXIT) room_2d[x][1] = TO_EXIT;
        if (room_2d[x + 1][0] === EXIT) room_2d[x][1] = TO_EXIT;
        if (room_2d[x - 1][49] === EXIT) room_2d[x][48] = TO_EXIT;
        if (room_2d[x][49] === EXIT) room_2d[x][48] = TO_EXIT;
        if (room_2d[x + 1][49] === EXIT) room_2d[x][48] = TO_EXIT;
    }
    y = 1;
    for (; y < max; y++) {
        room_2d[0][y] == UNWALKABLE;
        room_2d[49][y] == UNWALKABLE;
    }
    x = 1;
    for (; x < max; x++) {
        room_2d[x][0] == UNWALKABLE;
        room_2d[x][49] == UNWALKABLE;
    }
    return room_2d;
}

function Graph(menge_v) {
    this.v = menge_v; // Vertex count
    this.level = Array(menge_v);
    this.edges = Array(menge_v)
        .fill(0)
        .map((x) => []); // Array: for every vertex an edge Array mit {v,r,c,f} vertex_to,res_edge,capacity,flow
    this.New_edge = function (u, v, c) {
        this.edges[u].push({ v: v, r: this.edges[v].length, c: c, f: 0 }); // Normal forward Edge
        this.edges[v].push({ v: u, r: this.edges[u].length - 1, c: 0, f: 0 }); // reverse Edge for Residal Graph
    };
    this.Bfs = function (s, t) {
        if (t >= this.v) return false;
        this.level.fill(-1); // reset old levels
        this.level[s] = 0;
        let q = []; // queue with s as starting point
        q.push(s);
        let u = 0;
        let edge = null;
        while (q.length) {
            u = q.splice(0, 1)[0];
            let i = 0;
            const imax = this.edges[u].length;
            for (; i < imax; i++) {
                edge = this.edges[u][i];
                if (this.level[edge.v] < 0 && edge.f < edge.c) {
                    this.level[edge.v] = this.level[u] + 1;
                    q.push(edge.v);
                }
            }
        }
        return this.level[t] >= 0; // return if theres a path to t -> no level, no path!
    };
    this.Dfsflow = function (u, f, t, c) {
        if (u === t)
            return f;
        let edge = null;
        let flow_till_here = 0;
        let flow_to_t = 0;
        while (c[u] < this.edges[u].length) {
            edge = this.edges[u][c[u]];
            if (this.level[edge.v] === this.level[u] + 1 && edge.f < edge.c) {
                flow_till_here = Math.min(f, edge.c - edge.f);
                flow_to_t = this.Dfsflow(edge.v, flow_till_here, t, c);
                if (flow_to_t > 0) {
                    edge.f += flow_to_t; // Add Flow to current edge
                    this.edges[edge.v][edge.r].f -= flow_to_t; // subtract from reverse Edge -> Residual Graph neg. Flow to use backward direction of BFS/DFS
                    return flow_to_t;
                }
            }
            c[u]++;
        }
        return 0;
    };
    this.Bfsthecut = function (s) {
        let e_in_cut = [];
        this.level.fill(-1);
        this.level[s] = 1;
        let q = [];
        q.push(s);
        let u = 0;
        let edge = null;
        while (q.length) {
            u = q.splice(0, 1)[0];
            let i = 0;
            const imax = this.edges[u].length;
            for (; i < imax; i++) {
                edge = this.edges[u][i];
                if (edge.f < edge.c) {
                    if (this.level[edge.v] < 1) {
                        this.level[edge.v] = 1;
                        q.push(edge.v);
                    }
                }
                if (edge.f === edge.c && edge.c > 0) {
                    edge.u = u;
                    e_in_cut.push(edge);
                }
            }
        }
        let min_cut = [];
        let i = 0;
        const imax = e_in_cut.length;
        for (; i < imax; i++) {
            if (this.level[e_in_cut[i].v] === -1)
                min_cut.push(e_in_cut[i].u);
        }
        return min_cut;
    };
    this.Calcmincut = function (s, t) {
        if (s == t) return -1;
        let returnvalue = 0;
        let count = [];
        let flow = 0;
        while (this.Bfs(s, t) === true) {
            count = Array(this.v + 1).fill(0);
            flow = 0;
            do {
                flow = this.Dfsflow(s, Number.MAX_VALUE, t, count);
                if (flow > 0) returnvalue += flow;
            } while (flow);
        }
        return returnvalue;
    };
}
var util_mincut = {
    create_graph: function (roomname, rect, bounds) {
        let room_array = room_2d_array(roomname, bounds); // An Array with Terrain information: -1 not usable, 2 Sink (Leads to Exit)
        let r = null;
        let j = 0;
        const jmax = rect.length;
        if (
            bounds.x1 >= bounds.x2 ||
            bounds.y1 >= bounds.y2 ||
            bounds.x1 < 0 ||
            bounds.y1 < 0 ||
            bounds.x2 > 49 ||
            bounds.y2 > 49
        )
            return console.log("ERROR: Invalid bounds", JSON.stringify(bounds));
        for (; j < jmax; j++) {
            r = rect[j];
            if (r.x1 >= r.x2 || r.y1 >= r.y2) {
                return console.log(
                    "ERROR: Rectangle Nr.",
                    j,
                    JSON.stringify(r),
                    "invalid."
                );
            } else if (
                r.x1 < bounds.x1 ||
                r.x2 > bounds.x2 ||
                r.y1 < bounds.y1 ||
                r.y2 > bounds.y2
            ) {
                return console.log(
                    "ERROR: Rectangle Nr.",
                    j,
                    JSON.stringify(r),
                    "out of bounds:",
                    JSON.stringify(bounds)
                );
            }

            let x = r.x1;
            const maxx = r.x2 + 1;
            let y = r.y1;
            const maxy = r.y2 + 1;
            for (; x < maxx; x++) {
                y = r.y1;
                for (; y < maxy; y++) {
                    if (x === r.x1 || x === r.x2 || y === r.y1 || y === r.y2) {
                        if (room_array[x][y] === NORMAL)
                            room_array[x][y] = PROTECTED;
                    } else room_array[x][y] = UNWALKABLE;
                }
            }
        }
        if (true) {
            let visual = new RoomVisual(roomname);
            let x = 0;
            let y = 0;
            const max = 50;
            for (; x < max; x++) {
                y = 0;
                for (; y < max; y++) {
                    if (room_array[x][y] === UNWALKABLE)
                        visual.circle(x, y, {
                            radius: 0.5,
                            fill: "#111166",
                            opacity: 0.3,
                        });
                    else if (room_array[x][y] === NORMAL)
                        visual.circle(x, y, {
                            radius: 0.5,
                            fill: "#e8e863",
                            opacity: 0.3,
                        });
                    else if (room_array[x][y] === PROTECTED)
                        visual.circle(x, y, {
                            radius: 0.5,
                            fill: "#75e863",
                            opacity: 0.3,
                        });
                    else if (room_array[x][y] === TO_EXIT)
                        visual.circle(x, y, {
                            radius: 0.5,
                            fill: "#b063e8",
                            opacity: 0.3,
                        });
                }
            }
        }
        let g = new Graph(2 * 50 * 50 + 2);
        let infini = Number.MAX_VALUE;
        let surr = [
            [0, -1],
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [0, 1],
            [1, 1],
            [1, 0],
            [1, -1],
        ];
        let source = 2 * 50 * 50;
        let sink = 2 * 50 * 50 + 1;
        let top = 0;
        let bot = 0;
        let dx = 0;
        let dy = 0;
        let x = 1;
        let y = 1;
        const max = 49;
        for (; x < max; x++) {
            y = 1;
            for (; y < max; y++) {
                top = y * 50 + x;
                bot = top + 2500;
                if (room_array[x][y] === NORMAL) {
                    g.New_edge(top, bot, 1);
                    for (let i = 0; i < 8; i++) {
                        dx = x + surr[i][0];
                        dy = y + surr[i][1];
                        if (
                            room_array[dx][dy] === NORMAL ||
                            room_array[dx][dy] === TO_EXIT
                        )
                            g.New_edge(bot, dy * 50 + dx, infini);
                    }
                } else if (room_array[x][y] === PROTECTED) {
                    g.New_edge(source, top, infini);
                    g.New_edge(top, bot, 1);
                    for (let i = 0; i < 8; i++) {
                        dx = x + surr[i][0];
                        dy = y + surr[i][1];
                        if (
                            room_array[dx][dy] === NORMAL ||
                            room_array[dx][dy] === TO_EXIT
                        )
                            g.New_edge(bot, dy * 50 + dx, infini);
                    }
                } else if (room_array[x][y] === TO_EXIT) {
                    g.New_edge(top, sink, infini);
                }
            }
        } // graph finished
        return g;
    },
    delete_tiles_to_dead_ends: function (roomname, cut_tiles_array) {
        let room_array = room_2d_array(roomname);
        for (let i = cut_tiles_array.length - 1; i >= 0; i--) {
            room_array[cut_tiles_array[i].x][cut_tiles_array[i].y] = UNWALKABLE;
        }
        let unvisited_pos = [];
        let y = 0;
        const max = 49;
        for (; y < max; y++) {
            if (room_array[1][y] === TO_EXIT) unvisited_pos.push(50 * y + 1);
            if (room_array[48][y] === TO_EXIT) unvisited_pos.push(50 * y + 48);
        }
        let x = 0;
        for (; x < max; x++) {
            if (room_array[x][1] === TO_EXIT) unvisited_pos.push(50 + x);
            if (room_array[x][48] === TO_EXIT) unvisited_pos.push(2400 + x); // 50*48=2400
        }
        let surr = [
            [0, -1],
            [-1, -1],
            [-1, 0],
            [-1, 1],
            [0, 1],
            [1, 1],
            [1, 0],
            [1, -1],
        ];
        let index, dx, dy;
        while (unvisited_pos.length > 0) {
            index = unvisited_pos.pop();
            x = index % 50;
            y = Math.floor(index / 50);
            for (let i = 0; i < 8; i++) {
                dx = x + surr[i][0];
                dy = y + surr[i][1];
                if (room_array[dx][dy] === NORMAL) {
                    unvisited_pos.push(50 * dy + dx);
                    room_array[dx][dy] = TO_EXIT;
                }
            }
        }
        let leads_to_exit = false;
        for (let i = cut_tiles_array.length - 1; i >= 0; i--) {
            leads_to_exit = false;
            x = cut_tiles_array[i].x;
            y = cut_tiles_array[i].y;
            for (let i = 0; i < 8; i++) {
                dx = x + surr[i][0];
                dy = y + surr[i][1];
                if (room_array[dx][dy] === TO_EXIT) {
                    leads_to_exit = true;
                }
            }
            if (!leads_to_exit) {
                cut_tiles_array.splice(i, 1);
            }
        }
    },
    GetCutTiles: function (
        roomname,
        rect,
        bounds = { x1: 0, y1: 0, x2: 49, y2: 49 },
        verbose = false
    ) {
        let graph = util_mincut.create_graph(roomname, rect, bounds);
        let source = 2 * 50 * 50; // Position Source / Sink in Room-Graph
        let sink = 2 * 50 * 50 + 1;
        let count = graph.Calcmincut(source, sink);
        if (verbose) console.log("NUmber of Tiles in Cut:", count);
        let positions = [];
        if (count > 0) {
            let cut_edges = graph.Bfsthecut(source);
            let u, x, y;
            let i = 0;
            const imax = cut_edges.length;
            for (; i < imax; i++) {
                u = cut_edges[i]; // x= v % 50  y=v/50 (math.floor?)
                x = u % 50;
                y = Math.floor(u / 50);
                positions.push({ x: x, y: y });
            }
        }
        let whole_room =
            bounds.x1 == 0 &&
            bounds.y1 == 0 &&
            bounds.x2 == 49 &&
            bounds.y2 == 49;
        if (positions.length > 0 && !whole_room)
            util_mincut.delete_tiles_to_dead_ends(roomname, positions);
        if (true && positions.length > 0) {
            let visual = new RoomVisual(roomname);
            for (let i = positions.length - 1; i >= 0; i--) {
                visual.circle(positions[i].x, positions[i].y, {
                    radius: 0.5,
                    fill: "#ff7722",
                    opacity: 0.9,
                });
            }
        }
        return positions;
    },
    test: function (roomname) {
        let cpu = Game.cpu.getUsed();
        let rect_array = [];
        rect_array.push({ x1: 20, y1: 6, x2: 28, y2: 27 });
        rect_array.push({ x1: 29, y1: 13, x2: 34, y2: 16 });
        let bounds = { x1: 0, y1: 0, x2: 49, y2: 49 };
        let positions = util_mincut.GetCutTiles(roomname, rect_array, bounds); // Positions is an array where to build walls/ramparts
        console.log("Positions returned", positions.length);
        cpu = Game.cpu.getUsed() - cpu;
        console.log("Needed", cpu, " cpu time");
        return "Finished";
    },
};

module.exports = util_mincut;

return module.exports;
}
/********** End of module 24: C:\Users\Eric\Documents\screeps\ScreepsMuszbot\src\utils\mincut.js **********/
/********** Footer **********/
if(typeof module === "object")
	module.exports = __require(0);
else
	return __require(0);
})();
/********** End of footer **********/
