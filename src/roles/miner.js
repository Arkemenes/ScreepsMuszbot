const { isRoomStable } = require("../utils/population");
const { hasLinkNetwork } = require("../utils/energy");
const census = require("../utils/census");
const { takeCover } = require("../utils/combat");
const { roomNeeds } = require("../rooms/needs");
const config = require("../utils/config");
const names = require("../utils/names");
const planStore = require("../utils/planStore");
const hauler = require("./hauler");

// Containers adjacent to the source, and the first one no other miner sits on.
function findContainerSeat(creep, source) {
    const containers = source
        ? source.pos.findInRange(FIND_STRUCTURES, 1, {
              filter: (s) => s.structureType === STRUCTURE_CONTAINER,
          })
        : [];
    const seat = _.find(containers, (container) => {
        const occupant = container.pos.lookFor(LOOK_CREEPS)[0];
        return (
            !occupant ||
            occupant.id === creep.id ||
            occupant.memory.role !== "miner"
        );
    });
    return { containers, seat };
}

// The container the creep is currently standing on, if any.
function containerUnder(creep) {
    return _.find(
        creep.pos.lookFor(LOOK_STRUCTURES),
        (s) => s.structureType === STRUCTURE_CONTAINER
    );
}

// The tile the source's container is planned to occupy, even when the
// structure itself isn't there (destroyed, or not built yet) - the plan's
// building list survives the container's death, so the miner still has a
// single predictable tile to camp instead of wherever `harvest`'s
// ERR_NOT_IN_RANGE fallback happens to walk it to.
function plannedContainerPos(roomName, source) {
    const plan = planStore.getPlan(roomName);
    if (!plan) return null;
    const building = _.find(
        plan.buildings,
        (b) =>
            b.structureType === STRUCTURE_CONTAINER &&
            Math.max(
                Math.abs(b.x - source.pos.x),
                Math.abs(b.y - source.pos.y)
            ) <= 1
    );
    return building ? new RoomPosition(building.x, building.y, roomName) : null;
}

// Push a creep off its tile into the first free adjacent tile.
function shoveAway(creep, avoidPos) {
    const terrain = creep.room.getTerrain();
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = creep.pos.x + dx;
            const y = creep.pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            if (avoidPos && x === avoidPos.x && y === avoidPos.y) continue;
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            if (creep.room.lookForAt(LOOK_CREEPS, x, y).length) continue;
            creep.move(creep.pos.getDirectionTo(x, y));
            return;
        }
    }
}

// Walk onto `target` (the container structure, or its planned RoomPosition
// while the structure is gone/not built yet), shoving off a non-miner
// squatter in the way first. Shared by the real-container and
// planned-position seat branches below.
function moveToSeat(creep, target) {
    const seatPos = target.pos || target;
    const squatter = seatPos.lookFor(LOOK_CREEPS)[0];
    const blocked = squatter && squatter.id !== creep.id;

    // clear anyone off the seat as we approach; `travel` treats a creep on
    // a container as "parked" and would route around it forever otherwise
    if (blocked && creep.pos.getRangeTo(seatPos) <= 2) {
        shoveAway(squatter, creep.pos);
    }

    if (blocked && creep.pos.isNearTo(seatPos)) {
        // step straight in - the squatter is being shoved
        creep.move(creep.pos.getDirectionTo(seatPos));
    } else {
        creep.moveTo(target, { range: 0, reusePath: 3 });
    }
}

// The body a fresh miner would get right now.
function minerBody(room) {
    const extensions = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTENSION },
    }).length;
    const miners = census.creepsByRole(room.name, "miner").length;

    let body = [MOVE, WORK, WORK, WORK, WORK, WORK];
    if (
        !isRoomStable(room) ||
        extensions < 5 ||
        (miners === 0 && room.energyAvailable < 550)
    ) {
        body = [MOVE, WORK, WORK];
    }
    // A CARRY part lets the miner steer its output into the link / adjacent
    // towers / the container instead of only dropping the overflow.
    if (
        hasLinkNetwork(room) ||
        (room.controller && room.controller.level >= 3)
    ) {
        body.push(CARRY);
    }
    return body;
}

// Where a miner assigned to this source ends up sitting.
function sourceMiningPos(source) {
    const container = source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    })[0];
    return container ? container.pos : source.pos;
}

// Ticks for `body` to walk from -> to, counting fatigue per tile: swamp costs
// 5x a plain tile, a road 1/2. Returns null if there is no path.
function pathTravelTicks(room, fromPos, toPos, body) {
    const moveParts = _.filter(body, (p) => p === MOVE).length || 1;
    const otherParts = body.length - moveParts;

    const roadTiles = new Set(
        room
            .find(FIND_STRUCTURES, {
                filter: (s) => s.structureType === STRUCTURE_ROAD,
            })
            .map((s) => s.pos.x + ":" + s.pos.y)
    );

    const costMatrix = new PathFinder.CostMatrix();
    roadTiles.forEach((key) => {
        const [x, y] = key.split(":").map(Number);
        costMatrix.set(x, y, 1);
    });

    const search = PathFinder.search(
        fromPos,
        { pos: toPos, range: 1 },
        {
            plainCost: 2,
            swampCost: 10,
            roomCallback: (rn) => (rn === room.name ? costMatrix : false),
        }
    );
    if (search.incomplete && !search.path.length) return null;

    const terrain = room.getTerrain();
    let ticks = 0;
    for (const pos of search.path) {
        let fatiguePerPart;
        if (roadTiles.has(pos.x + ":" + pos.y)) {
            fatiguePerPart = 1;
        } else if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_SWAMP) {
            fatiguePerPart = 10;
        } else {
            fatiguePerPart = 2;
        }
        // 1 move tick + the ticks spent waiting for fatigue to drain
        ticks +=
            1 +
            Math.ceil((fatiguePerPart * otherParts) / (2 * moveParts));
    }
    return ticks;
}

// Ticks between deciding to spawn a replacement and it reaching the mining
// spot: spawn time + fatigue-aware travel time. Cached per source and
// refreshed occasionally as the base layout changes.
function replacementLeadTime(room, source) {
    const mem = Memory.rooms[room.name];
    if (!mem.minerLead) mem.minerLead = {};
    const cached = mem.minerLead[source.id];
    if (cached && Game.time - cached.tick < 1500) {
        return cached.value;
    }

    const body = minerBody(room);
    const spawnTicks = body.length * CREEP_SPAWN_TIME;

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    let travelTicks = 150;
    if (spawn) {
        const t = pathTravelTicks(
            room,
            spawn.pos,
            sourceMiningPos(source),
            body
        );
        if (t !== null) travelTicks = t;
    }

    const value = spawnTicks + travelTicks + 5;
    mem.minerLead[source.id] = { value, tick: Game.time };
    return value;
}

// WORK parts committed to a source by miners that will still be alive once a
// replacement could arrive (dying miners no longer count -> spawn early).
function liveWorkForSource(roomMiners, sourceId, leadTime) {
    return _.sum(roomMiners, (c) => {
        if (c.memory.target !== sourceId) return 0;
        const ttl =
            c.ticksToLive === undefined ? CREEP_LIFE_TIME : c.ticksToLive;
        if (ttl <= leadTime) return 0;
        return _.filter(c.body, (p) => p.type === WORK).length;
    });
}

// Whether harvesting right now actually goes somewhere. No container yet at
// this source (early game, before one is built) - still worth it, the
// overflow drops on the ground for a hauler to scoop. With a container: fine
// as long as it still has room; once it's full, only keep mining if a
// collector link or a tower still has room to take the overflow (matches
// distribute()'s own surplus/top-off logic below - once the container is
// full and there's no link, a not-yet-full tower always ends up fed) -
// otherwise it would just spill on the ground and decay for nothing.
// `near` is the seat's adjacent structures (run() looks it up once and hands
// it to both this and distribute() - they used to each re-run their own
// findInRange for container/link/tower, four native calls a tick instead of
// one).
function hasDepositTarget(creep, near) {
    const container = _.find(
        near,
        (s) => s.structureType === STRUCTURE_CONTAINER
    );
    if (!container) return true;
    if (container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return true;

    const collectorLinks = _.filter(
        near,
        (s) => s.structureType === STRUCTURE_LINK && s.my && s.isCollector()
    );
    if (
        _.some(
            collectorLinks,
            (l) => l.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        )
    ) {
        return true;
    }

    const tower = _.find(
        near,
        (s) => s.structureType === STRUCTURE_TOWER && s.my
    );
    if (tower && tower.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return true;

    return false;
}

// Move the miner's output onward. The hauler never tops off a source-defense
// tower (hauler.js pickDeliver skips it - see isSourceDefenseTower there), so
// keeping it at its reserve level is this miner's unconditional priority,
// ahead of even the collector link / container - it's the only thing feeding
// that tower. Topping it off BEYOND reserve still waits for genuine surplus
// (buffers full, or spawn/ext already fed) so it doesn't rob creep production
// for the last few percent. Order: tower to reserve -> collector link ->
// container -> top the tower off (surplus only).
function distribute(creep, near) {
    // no CARRY -> nothing to forward (overflow drops straight into the container)
    if (creep.store.getCapacity(RESOURCE_ENERGY) === 0) return;

    const container = _.find(
        near,
        (s) => s.structureType === STRUCTURE_CONTAINER
    );
    const collectorLinks = _.filter(
        near,
        (s) => s.structureType === STRUCTURE_LINK && s.my && s.isCollector()
    );
    const roomiestLink = _.max(collectorLinks, (l) =>
        l.store.getFreeCapacity(RESOURCE_ENERGY)
    );
    const link =
        roomiestLink !== -Infinity &&
        roomiestLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            ? roomiestLink
            : null;
    const tower = _.find(
        near,
        (s) => s.structureType === STRUCTURE_TOWER && s.my
    );

    // pull adjacent drops / container overflow into the store so it can be
    // forwarded (only useful when a link or a hungry tower is next to us)
    if (
        creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        (link || tower)
    ) {
        const dropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
            filter: (r) => r.resourceType === RESOURCE_ENERGY,
        })[0];
        if (dropped) {
            creep.pickup(dropped);
        } else if (container && container.store[RESOURCE_ENERGY] > 0) {
            creep.withdraw(container, RESOURCE_ENERGY);
        }
    }

    if (creep.store[RESOURCE_ENERGY] === 0) return;

    if (hauler.shouldMinerFeedTower(creep.room, tower)) {
        creep.transfer(tower, RESOURCE_ENERGY);
    } else if (link) {
        creep.transfer(link, RESOURCE_ENERGY);
    } else if (
        container &&
        container.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    ) {
        creep.transfer(container, RESOURCE_ENERGY);
    }
}

var miner = {
    /** @param {Creep} creep **/
    run: function (creep) {
        if (takeCover(creep)) return;

        if (!creep.memory.target) {
            const roomMiners = census.creepsByRole(creep.room.name, "miner");
            for (const source of creep.room.find(FIND_SOURCES)) {
                const lead = replacementLeadTime(creep.room, source);
                if (liveWorkForSource(roomMiners, source.id, lead) < 2) {
                    creep.memory.target = source.id;
                    break;
                }
            }
        }

        const source = Game.getObjectById(creep.memory.target);

        // --- stay on the source container ---------------------------------
        // Re-check every tick (cheap): a lone miner that got shoved onto
        // another source-adjacent tile still harvests fine, so it would never
        // notice it had left its seat.
        let seekingSeat = false;
        if (source) {
            const seatMem = creep.memory.seat;
            const onSeat =
                seatMem &&
                creep.pos.x === seatMem[0] &&
                creep.pos.y === seatMem[1] &&
                containerUnder(creep);

            if (onSeat) {
                creep.memory.onContainer = true;
            } else {
                creep.memory.onContainer = false;
                const { containers, seat } = findContainerSeat(creep, source);

                if (seat) {
                    creep.memory.seat = [seat.pos.x, seat.pos.y];
                    if (creep.pos.isEqualTo(seat.pos)) {
                        creep.memory.onContainer = true;
                    } else {
                        seekingSeat = true;
                        moveToSeat(creep, seat);
                    }
                } else if (containers.length) {
                    // seats all taken by other miners - wait next to one
                    seekingSeat = true;
                    creep.moveTo(creep.pos.findClosestByRange(containers), {
                        range: 1,
                        reusePath: 5,
                    });
                } else {
                    // no container built at this source (destroyed, or not
                    // built yet) - still park on the plan's container tile
                    // when there is one, so the energy pile lands on one
                    // predictable spot for a hauler/the eventual rebuild
                    // instead of wherever the harvest fallback below happens
                    // to walk to.
                    const planned = plannedContainerPos(
                        creep.room.name,
                        source
                    );
                    if (planned) {
                        creep.memory.seat = [planned.x, planned.y];
                        if (creep.pos.isEqualTo(planned)) {
                            creep.memory.onContainer = true;
                        } else {
                            seekingSeat = true;
                            moveToSeat(creep, planned);
                        }
                    } else {
                        // no plan either - mine from the source tile
                        creep.memory.onContainer = true;
                        creep.memory.seat = null;
                    }
                }
            }
        }

        // don't mine into a full container with nobody else to feed - it
        // would just spill on the ground and decay away for nothing
        const near = creep.pos.findInRange(FIND_STRUCTURES, 1);
        if (hasDepositTarget(creep, near)) {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE && !seekingSeat) {
                creep.memory.onContainer = false;
                creep.moveTo(source, { reusePath: 5 });
            }
        }

        // --- distribute what we mined -----------------------------------
        distribute(creep, near);
    },
    // rough headcount for the population heuristic; the real per-source timing
    // lives in spawn() below
    wanted: function (room) {
        return roomNeeds(room).miner;
    },
    // checks if the room needs to spawn a creep. Per source: spawn when the
    // WORK committed by miners that will outlive a replacement's travel time
    // drops below 2 -> the replacement is on its way before the old one dies.
    spawn: function (room) {
        const roomMiners = census.creepsByRole(room.name, "miner");

        for (const source of room.find(FIND_SOURCES)) {
            const lead = replacementLeadTime(room, source);
            if (liveWorkForSource(roomMiners, source.id, lead) < 2) {
                return true;
            }
        }
    },
    // returns an object with the data to spawn a new creep
    spawnData: function (room) {
        let name = names.generate("miner");
        let body = minerBody(room);

        const roomMiners = census.creepsByRole(room.name, "miner");

        // assign the source whose live WORK is short, so the replacement can
        // pre-path to that container while the dying miner finishes
        let target = undefined;
        for (const source of room.find(FIND_SOURCES)) {
            const lead = replacementLeadTime(room, source);
            if (liveWorkForSource(roomMiners, source.id, lead) < 2) {
                target = source.id;
                break;
            }
        }

        let memory = { role: "miner", target: target };

        return { name, body, memory };
    },
};

module.exports = miner;
