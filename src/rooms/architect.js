const mincut = require("../utils/mincut");
const { terrainMatrix } = require("../utils/terrain");
const roomCache = require("../utils/roomCache");
const planStore = require("../utils/planStore");
const traffic = require("../utils/traffic");
const config = require("../utils/config");
const mapExits = require("../utils/mapExits");
const cpuMeter = require("../utils/cpuMeter");

// The plan's building list / mincut boxes for a room, or [] when unplanned.
function planBuildings(roomName) {
    const plan = planStore.getPlan(roomName);
    return plan ? plan.buildings : [];
}
function planBoundries(roomName) {
    const plan = planStore.getPlan(roomName);
    return plan ? plan.mincutBoundries : [];
}

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

// visualizeStructures()/createConstructionSites() both do a full scan of
// every planned building (300+ in a mature room) - cheap once, wasteful
// done unconditionally EVERY tick forever, even in a room that's fully
// built and hasn't changed since the last scan. planScanDue() skips the
// scan on quiet ticks via a cheap per-room fingerprint (two array lengths,
// both already cached by roomCache) and only pays the full cost again once
// that fingerprint actually changes - built or destroyed, by decay, an
// enemy, or the player via the UI, none of which fire an event we could
// hook, so re-reading current state is the only real source of truth.
// `forceInterval` bounds the fallback: even with no detected change, force
// a rescan periodically as a safety net for the rare "same counts,
// different tile" edge case (one structure destroyed, a different one of
// the same type appears the same tick).
let planScanState = {};
function planScanDue(key, room, forceInterval) {
    const fingerprint =
        (room.controller ? room.controller.level : 0) + ":" +
        roomCache.structures(room).length +
        ":" +
        roomCache.constructionSites(room).length;
    const cached = planScanState[key];
    const due =
        !cached ||
        cached.fingerprint !== fingerprint ||
        Game.time - cached.tick >= forceInterval;
    if (due) planScanState[key] = { fingerprint, tick: Game.time };
    return due;
}

// console: planVisual(50) sets the preview's forced-refresh interval
// (ticks) - it still redraws immediately on any real change regardless of
// this number (see planScanDue() above); planVisual(false) turns the
// preview off entirely; planVisual() resets to the default (50). Doesn't
// affect createConstructionSites()'s own (separate) forced interval -
// planner.scanForceInterval, config-only, no console toggle needed for
// that one.
global.planVisual = function (arg) {
    Memory.settings = Memory.settings || {};
    Memory.settings.planner = Memory.settings.planner || {};
    if (arg === false) {
        Memory.settings.planner.visualizeEnabled = false;
        console.log("[planVisual] disabled");
        return;
    }
    const interval = Number.isInteger(arg) && arg > 0 ? arg : 50;
    Memory.settings.planner.visualizeEnabled = true;
    Memory.settings.planner.visualizeForceInterval = interval;
    console.log("[planVisual] enabled, forceInterval=" + interval);
};

// `opts.preview`: plan a room we don't own yet, so planLayout() (console) /
// the scout's layout task (roles/scout.js) can show what the base layout
// WOULD look like once scouted, without owning it - same 13-step algorithm,
// the plan just never turns into real construction sites. If the room is
// later actually claimed, the preview plan already sitting in planStore
// becomes the real plan (replanRoom() to discard it instead).
function planCity(room, opts) {
    opts = opts || {};
    const roomName = room.name;

    if (Memory.rooms[room.name] == undefined) {
        Memory.rooms[room.name] = {};
    }

    const existingPlan = planStore.getPlan(roomName);
    if (
        existingPlan &&
        config.get("planner.visualizeEnabled", true) &&
        planScanDue(
            roomName + ":visualize",
            room,
            config.get("planner.visualizeForceInterval", 50)
        )
    ) {
        cpuMeter.span("plan.visualize", () => visualizeStructures(existingPlan.buildings, roomName));
    }

    // Start building once the core of the plan is down (spawn + core stamps),
    // not only after the whole 13-step plan finishes. Never for a preview -
    // there is nothing to build in a room we don't own.
    if (
        !opts.preview &&
        existingPlan &&
        (Memory.rooms[roomName].planned ||
            (Memory.rooms[roomName].planStep || 0) >= 3) &&
        planScanDue(
            roomName + ":build",
            room,
            config.get("planner.scanForceInterval", 50)
        )
    ) {
        cpuMeter.span("plan.build", () => createConstructionSites(room));
    }

    if (Memory.rooms[room.name].planned) {
        return;
    }

    if (Game.cpu.bucket < config.get("planner.minBucket", 500)) {
        return;
    }

    const exits = getAllExitCoordinates(roomName);
    const floodFillMatrix = room.floodFill(exits);

    const planStep = Memory.rooms[room.name].planStep;

    let stamp = { structures: [], rcl: [] };

    // Only plan rooms we actually own - unless this is an explicit preview.
    if (!opts.preview && !Memory.rooms[room.name].my) {
        return;
    }

    // Stall guard: a step that keeps running without finishing (e.g. a stamp
    // that can't fit anywhere) would otherwise loop forever. Force it forward
    // after a while so the plan always completes.
    const pm = Memory.rooms[roomName];
    if (pm.planStepSeen !== planStep) {
        pm.planStepSeen = planStep;
        pm.planStepTries = 0;
    }
    pm.planStepTries++;
    if (pm.planStepTries > 15) {
        console.log(
            `[architect] ${roomName}: step ${planStep} stalled, forcing advance`
        );
        pm.planStep = (planStep === undefined ? 0 : planStep) + 1;
        pm.planStepTries = 0;
        if (pm.planStep > 12) pm.planned = true;
        return;
    }

    switch (planStep) {
        case undefined:
            planStore.setPlan(roomName, planStore.emptyPlan());
            const containersAndLinks = getContainerLocations(
                roomName,
                floodFillMatrix
            );
            // shouldProtect=false: source/mineral containers, collector links,
            // and each source's defensive tower sit OUTSIDE the base perimeter.
            // getContainerLocations() gives them their own on-tile ramparts.
            addBuildings(roomName, containersAndLinks, false);
            Memory.rooms[roomName].planStep = 1;
            break;
        case 1:
            // Plan first spawn stamp
            stamp = {
                structures: ["  .  ", " .E. ", ".EAE.", " .E. ", "  .  "],
                rcl: ["  2  ", " 222 ", "22122", " 222 ", "  2  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            const spawn = room.find(FIND_MY_STRUCTURES, {
                filter: { structureType: STRUCTURE_SPAWN },
            })[0];

            stampStep(
                pm,
                roomName,
                stamp,
                floodFillMatrix,
                spawn ? spawn.pos.x : null,
                spawn ? spawn.pos.y : null
            );
            break;
        case 2:
            // Plan the core
            stamp = {
                structures: ["  .  ", " .S. ", ".M.F.", " .K. ", "  .  "],
                rcl: ["  4  ", " 444 ", "46474", " 454 ", "  4  "],
                ramparts: ["     ", "  5  ", " 7 8 ", "     ", "     "],
            };

            stampStep(pm, roomName, stamp, floodFillMatrix);
            break;

        case 3:
            // Plan the tower stamp - also the only nuker/observer (RCL8,
            // capped at 1 each in real Screeps, and this stamp is placed
            // exactly once, same as the tower itself). The 2 extensions this
            // used to carry (top/bottom of the cross) are made up for
            // organically by the solo-extension loop (case 9) later.
            stamp = {
                structures: ["  .  ", " .N. ", ".ETE.", " .O. ", "  .  "],
                rcl: ["  2  ", " 282 ", "23332", " 282 ", "  2  "],
                ramparts: ["     ", "     ", "  4  ", "     ", "     "],
            };

            stampStep(pm, roomName, stamp, floodFillMatrix);
            break;
        case 4:
            // Plan the Lab Stamp
            stamp = {
                structures: [
                    " ?? ? ",
                    "?LL.L?",
                    "?L.L. ",
                    " .L.L?",
                    "?L.LL?",
                    " ? ?? ",
                ],
                // ROADMAP 0111: labs in labSlots.js order - RCL6 builds the
                // two reaction inputs + first output, RCL7 the second pair,
                // RCL8 the tree's upper levels (see utils/labSlots.js).
                rcl: [
                    " 66 6 ",
                    "677666",
                    "67666 ",
                    " 66686",
                    "686886",
                    " 6 66 ",
                ],
                ramparts: [
                    "      ",
                    " 88 8 ",
                    " 8 8  ",
                    "  8 8 ",
                    " 8 88 ",
                    "      ",
                ],
                // structures: [" LL.", "LL.L", "L.LL", ".LL "],
                // rcl: [" 876", "8766", "7668", "668 "],
                // ramparts: [" 88 ", "88 8", "8 88", " 88 "],
            };
            stampStep(pm, roomName, stamp, floodFillMatrix);
            break;

        case 5:
            // Plan the second spawn stamp
            stamp = {
                structures: ["  .  ", " .E. ", ".EAE.", " .E. ", "  .  "],
                rcl: ["  3  ", " 333 ", "34743", " 333 ", "  3  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            stampStep(pm, roomName, stamp, floodFillMatrix);
            break;

        case 6:
            // Plan the third spawn stamp
            stamp = {
                structures: ["  .  ", " .E. ", ".EAE.", " .E. ", "  .  "],
                rcl: ["  4  ", " 444 ", "44844", " 444 ", "  4  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            stampStep(pm, roomName, stamp, floodFillMatrix);
            break;

        case 7:
            // Plan the power spawn stamp
            stamp = {
                structures: ["  .  ", " .E. ", ".EPE.", " .E. ", "  .  "],
                rcl: ["  4  ", " 444 ", "44844", " 444 ", "  4  "],
                ramparts: ["     ", "     ", "     ", "     ", "     "],
            };
            stampStep(pm, roomName, stamp, floodFillMatrix);
            break;
        case 8:
            // Plan the exensions position
            var countExtensions = planBuildings(roomName).filter(
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
            var placed8 = addStamp(roomName, stamp, floodFillMatrix);

            // advance once we have enough extensions, or as soon as no more fit
            if (countExtensions >= 49 || !placed8) {
                Memory.rooms[roomName].planStep++;
            }
            break;

        case 9:
            // Plan the exensions position
            var countExtensions = planBuildings(roomName).filter(
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
            var placed9 = addStamp(roomName, stamp, floodFillMatrix);

            if (countExtensions >= 59 || !placed9) {
                Memory.rooms[roomName].planStep++;
            }
            break;
        case 10:
            // Plan Roads
            const containers = planBuildings(roomName).filter(
                (building) => building.structureType === STRUCTURE_CONTAINER
            );
            const spawnBuilding = planBuildings(roomName).filter(
                (building) => building.structureType === STRUCTURE_SPAWN
            )[0];
            if (!spawnBuilding) {
                Memory.rooms[roomName].planStep++;
                break;
            }
            const anchor = roadAnchor(roomName, spawnBuilding);

            for (const container of containers) {
                const containerRoad = getShortestPath(
                    roomName,
                    anchor.x,
                    anchor.y,
                    container.x,
                    container.y
                );
                // roads to the source containers are not part of the protected
                // area - the perimeter only wraps the base itself
                addBuildings(roomName, containerRoad, false);
            }

            // anchor -> controller (the upgrader parks at range 3) - ROADMAP 0008
            const controller = Game.rooms[roomName] && Game.rooms[roomName].controller;
            if (controller) {
                const controllerRoad = getShortestPath(
                    roomName,
                    anchor.x,
                    anchor.y,
                    controller.pos.x,
                    controller.pos.y,
                    3
                );
                addBuildings(roomName, controllerRoad, false);
            }

            // traffic-guided extras: tiles creeps actually walk a lot, beyond
            // the baseline routes above - ROADMAP 0008
            const blockers = planBuildings(roomName);
            const hotTiles = traffic
                .hot(roomName)
                .filter(
                    (t) =>
                        !blockers.some(
                            (b) =>
                                b.x === t.x &&
                                b.y === t.y &&
                                b.structureType !== STRUCTURE_RAMPART
                        )
                );
            if (hotTiles.length) {
                addBuildings(
                    roomName,
                    hotTiles.map((t) => ({
                        x: t.x,
                        y: t.y,
                        structureType: STRUCTURE_ROAD,
                        minimalRCL: 3,
                    })),
                    false
                );
            }

            // roads to the edge of the map only toward a room that's mine or
            // already being remote-mined - never pave a road to an arbitrary
            // exit (ROADMAP 0008 / 0020)
            const roomMem = Memory.rooms[roomName];
            const exits = mapExits.known(roomName) || {};
            const remotes = (roomMem && roomMem.remotes) || [];
            for (const direction in exits) {
                const neighborName = exits[direction];
                const neighborMem = Memory.rooms[neighborName];
                const worthPaving =
                    remotes.indexOf(neighborName) !== -1 ||
                    (neighborMem && neighborMem.my === true);
                if (!worthPaving) continue;

                const exitTile = closestExitTile(
                    roomName,
                    anchor,
                    Number(direction)
                );
                if (!exitTile) continue;

                const edgeRoad = getShortestPath(
                    roomName,
                    anchor.x,
                    anchor.y,
                    exitTile.x,
                    exitTile.y,
                    0
                );
                addBuildings(roomName, edgeRoad, false);
            }

            Memory.rooms[roomName].planStep++;
            break;
        case 11:
            const cutTiles = mincut.GetCutTiles(
                roomName,
                planBoundries(roomName)
            );
            planStore.mutate(roomName, (plan) => {
                for (const tile of cutTiles) {
                    plan.buildings.push({
                        x: tile.x,
                        y: tile.y,
                        structureType: STRUCTURE_RAMPART,
                        minimalRCL: 3,
                    });
                }
            });
            Memory.rooms[roomName].planStep++;
            break;
        case 12:
            const structures = planBuildings(roomName).filter(
                (building) =>
                    building.structureType !== STRUCTURE_ROAD &&
                    building.structureType !== STRUCTURE_RAMPART &&
                    building.structureType !== STRUCTURE_CONTAINER &&
                    building.structureType !== STRUCTURE_LINK &&
                    building.structureType !== STRUCTURE_EXTRACTOR &&
                    !building.sourceDefense
            );
            const blockRamparts = planBuildings(roomName).filter(
                (building) =>
                    building.structureType == STRUCTURE_RAMPART &&
                    building.minimalRCL == 3 &&
                    !building.sourceDefense
            );

            const floodFillMatrixBlocked = room.floodFill(
                structures,
                blockRamparts,
                (visualize = true)
            );

            // Towers are capped at 6 (RCL 8). Each source cluster already took
            // one (see getContainerLocations); the base core stamp took one at
            // RCL 3. Fill the rest with perimeter towers at RCL 8.
            const towerCount = (t) =>
                planBuildings(roomName).filter(
                    (b) =>
                        b.structureType === STRUCTURE_TOWER &&
                        (t === "source" ? b.sourceDefense : !b.sourceDefense)
                ).length;

            const perimeterTowers = Math.max(
                0,
                6 - towerCount("base") - towerCount("source")
            );

            for (let ix = 0; ix < perimeterTowers; ix++) {
                // reuse an already-built tower before computing a brand new
                // spot - replanRoom() doesn't demolish anything, so without
                // this the perimeter towers drift to a different tile every
                // time the room is replanned
                const reused = unclaimedBuiltTowers(roomName)[0];
                const newTowerPos = reused
                    ? { x: reused.pos.x, y: reused.pos.y }
                    : findNextTowerLocation(
                          floodFillMatrixBlocked,
                          blockRamparts,
                          roomName
                      );
                if (!newTowerPos) break;
                addBuildings(
                    roomName,
                    [
                        {
                            x: newTowerPos.x,
                            y: newTowerPos.y,
                            structureType: STRUCTURE_TOWER,
                            minimalRCL: reused ? 1 : 8,
                        },
                        {
                            x: newTowerPos.x,
                            y: newTowerPos.y,
                            structureType: STRUCTURE_RAMPART,
                            minimalRCL: reused ? 1 : 8,
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

// Build order: economy-critical first, decoration (roads/ramparts) last.
const BUILD_PRIORITY = {
    [STRUCTURE_SPAWN]: 0,
    [STRUCTURE_EXTENSION]: 1,
    [STRUCTURE_TOWER]: 2,
    [STRUCTURE_STORAGE]: 3,
    [STRUCTURE_CONTAINER]: 4,
    [STRUCTURE_LINK]: 5,
    [STRUCTURE_TERMINAL]: 6,
    [STRUCTURE_EXTRACTOR]: 7,
    [STRUCTURE_FACTORY]: 8,
    [STRUCTURE_LAB]: 9,
    [STRUCTURE_POWER_SPAWN]: 10,
    [STRUCTURE_OBSERVER]: 11,
    [STRUCTURE_NUKER]: 12,
    [STRUCTURE_ROAD]: 20,
    [STRUCTURE_RAMPART]: 21,
    [STRUCTURE_WALL]: 22,
};

function createConstructionSites(room) {
    const plan = planStore.getPlan(room.name);
    if (!room.controller || !plan) return;

    const rcl = room.controller.level;
    const bootstrapStorage = require("../utils/bootstrapStorage");
    bootstrapStorage.cancelObsoleteSite(room);
    const current = roomCache.constructionSites(room);
    // How many construction sites we keep queued in a room at once.
    let budget = config.get("planner.maxSitesPerRoom", 8) - current.length;
    if (budget <= 0) return;

    // what already exists / is queued, keyed by tile+type
    const have = new Set();
    const counts = {};
    const bump = (t) => (counts[t] = (counts[t] || 0) + 1);
    for (const s of roomCache.structures(room)) {
        have.add(s.pos.x + ":" + s.pos.y + ":" + s.structureType);
        if (s.my || !s.owner) bump(s.structureType);
    }
    for (const s of current) {
        have.add(s.pos.x + ":" + s.pos.y + ":" + s.structureType);
        bump(s.structureType);
    }

    const capFor = (type) => {
        const table = CONTROLLER_STRUCTURES[type];
        if (!table) return Infinity;
        return table[rcl] || 0;
    };

    const priority = (type) =>
        BUILD_PRIORITY[type] === undefined ? 15 : BUILD_PRIORITY[type];

    const queue = bootstrapStorage.constructionBuildings(room, plan.buildings)
        .filter(
            (b) =>
                rcl >= (b.minimalRCL || 1) &&
                (b.structureType !== STRUCTURE_STORAGE || rcl >= 4) &&
                !have.has(b.x + ":" + b.y + ":" + b.structureType)
        )
        .sort((a, b) => {
            const pa = priority(a.structureType);
            const pb = priority(b.structureType);
            if (pa !== pb) return pa - pb;
            return (a.minimalRCL || 0) - (b.minimalRCL || 0);
        });

    for (const b of queue) {
        if (budget <= 0) break;
        if ((counts[b.structureType] || 0) >= capFor(b.structureType)) continue;

        const res = new RoomPosition(
            b.x,
            b.y,
            room.name
        ).createConstructionSite(b.structureType);

        if (res === OK) {
            budget--;
            bump(b.structureType);
            have.add(b.x + ":" + b.y + ":" + b.structureType);
        }
    }
}

function findNextTowerLocation(
    floodFillMatrix,
    structures,
    roomName,
    rampartDistance = 1
) {
    // Bail out instead of recursing forever when no valid tile exists
    // (e.g. the room has no perimeter ramparts yet, or every candidate is taken)
    if (rampartDistance > 25 || !structures || !structures.length) return null;

    // Define the adjacent positions
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

    // Find the minimum value in the floodFillMatrix that is adjacent to any structure
    let maxVal = -Infinity;
    let targetPosition = null;

    structures.forEach((structure) => {
        const { x, y } = structure;

        adjacentOffsets.forEach((offset) => {
            const adjacentX = x + offset.dx;
            const adjacentY = y + offset.dy;

            const currentTowers = planBuildings(roomName).filter(
                (building) =>
                    building.structureType === STRUCTURE_TOWER &&
                    !building.sourceDefense
            );

            const totalDistance = currentTowers.reduce((sum, tower) => {
                const distance =
                    ((tower.x - adjacentX) ** 2 + (tower.y - adjacentY) ** 2) **
                    (1 / 16);
                return sum + distance;
            }, 0);

            const averageDistance = currentTowers.length
                ? totalDistance / currentTowers.length
                : 0;

            if (
                floodFillMatrix.get(adjacentX, adjacentY) > 0 &&
                averageDistance > maxVal &&
                !planBuildings(roomName).find(
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

// room.find() does not guarantee the same order across ticks in real
// Screeps - anything that treats "the first result" as meaningful (which
// source/mineral is index 0 and gets the lower-RCL link/tower, which
// container wins when several sit in range) needs a canonical order instead,
// or the plan drifts between replans even though nothing else changed.
function byPosition(a, b) {
    return a.pos.x - b.pos.x || a.pos.y - b.pos.y;
}

// A real structure OR a queued construction site of `structureType` within
// `range` of `pos`. replanRoom() doesn't demolish - or un-queue - anything,
// so without this a fresh floodFill pick could land on a different tile than
// what's already standing (or already waiting to be built there). Reuse it
// instead of drifting away from it / queuing a second one nearby.
function existingBuiltNear(roomName, structureType, pos, range = 1) {
    const room = Game.rooms[roomName];
    const near = (s) =>
        s.structureType === structureType &&
        s.pos &&
        Math.max(Math.abs(s.pos.x - pos.x), Math.abs(s.pos.y - pos.y)) <= range;
    const built = room.find(FIND_STRUCTURES, { filter: near });
    const queued = room.find(FIND_MY_CONSTRUCTION_SITES, { filter: near });
    return built.concat(queued).sort(byPosition)[0];
}

function existingContainerNear(roomName, pos) {
    return existingBuiltNear(roomName, STRUCTURE_CONTAINER, pos, 1);
}

// Real towers - built or already queued as a construction site - that aren't
// yet part of the plan being assembled (identified by tile, so an
// already-planned tower - e.g. a source-defense one from earlier this same
// run - is never double-counted). Consumed before computing a brand-new
// perimeter tower position.
function unclaimedBuiltTowers(roomName) {
    const planned = new Set(
        planBuildings(roomName)
            .filter((b) => b.structureType === STRUCTURE_TOWER)
            .map((b) => b.x + ":" + b.y)
    );
    const room = Game.rooms[roomName];
    const isTower = { filter: (s) => s.structureType === STRUCTURE_TOWER };
    const built = room.find(FIND_MY_STRUCTURES, isTower);
    const queued = room.find(FIND_MY_CONSTRUCTION_SITES, isTower);
    return built
        .concat(queued)
        .filter((s) => !planned.has(s.pos.x + ":" + s.pos.y))
        .sort(byPosition);
}

function getContainerLocations(roomName, floodFillMatrix) {
    const sources = Game.rooms[roomName].find(FIND_SOURCES).sort(byPosition);
    const terrain = terrainMatrix(roomName);
    const inBounds = (x, y) => x >= 0 && x <= 49 && y >= 0 && y <= 49;

    const locations = [];

    for (const source of sources) {
        const built = existingContainerNear(roomName, source.pos);
        if (built) {
            locations.push({
                x: built.pos.x,
                y: built.pos.y,
                structureType: STRUCTURE_CONTAINER,
                minimalRCL: 1,
            });
            continue;
        }

        let location = undefined;
        let maxVal = -Infinity;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const coordX = source.pos.x + i;
                const coordY = source.pos.y + j;

                // Check if the terrain is not a wall and no other structure exists at the location
                if (
                    inBounds(coordX, coordY) &&
                    floodFillMatrix.get(coordX, coordY) > maxVal &&
                    terrain[coordX][coordY] !== TERRAIN_MASK_WALL &&
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
                    // Add the location to the list
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
    // everything pushed so far is a source container
    const nSourceContainers = locations.length;

    // Container for extractor
    const minerals = Game.rooms[roomName].find(FIND_MINERALS).sort(byPosition);

    for (const mineral of minerals) {
        const builtMineral = existingContainerNear(roomName, mineral.pos);
        if (builtMineral) {
            locations.push({
                x: builtMineral.pos.x,
                y: builtMineral.pos.y,
                structureType: STRUCTURE_CONTAINER,
                minimalRCL: 6,
            });
            continue;
        }

        let location = undefined;
        let maxVal = -Infinity;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const coordX = mineral.pos.x + i;
                const coordY = mineral.pos.y + j;
                // Check if the terrain is not a wall and no other structure exists at the location
                if (
                    inBounds(coordX, coordY) &&
                    floodFillMatrix.get(coordX, coordY) > maxVal &&
                    terrain[coordX][coordY] !== TERRAIN_MASK_WALL &&
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
                    // Add the location to the list
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

    // Allocate the range-1 tiles next to each source container in priority
    // order: primary collector link, then the defense tower (so the miner on
    // the container can always feed it), then the secondary link (RCL 8 - only
    // placed if a tile is still free at range 1). Mineral containers get one
    // link and no tower.
    const linkLocations = [];
    const towerTiles = {};
    const taken = new Set(locations.map((b) => b.x + ":" + b.y));
    let primaryLinkRcl = 0;

    const usableAdjacent = (container) => {
        const room = Game.rooms[roomName];
        const tiles = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = container.x + dx;
                const y = container.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                if (terrain[x][y] === TERRAIN_MASK_WALL) continue;
                if (floodFillMatrix.get(x, y) <= 3) continue;
                if (taken.has(x + ":" + y)) continue;
                if (room.lookForAt(LOOK_SOURCES, x, y).length) continue;
                if (room.lookForAt(LOOK_MINERALS, x, y).length) continue;
                tiles.push({ x, y, val: floodFillMatrix.get(x, y) });
            }
        }
        // deepest (best-protected) tile first
        return _.sortBy(tiles, (t) => -t.val);
    };

    // drop `pos` from a candidate-tile list (used after adopting an
    // already-built structure, so a later step can't also claim that tile)
    const without = (tiles, pos) =>
        tiles.filter((t) => t.x !== pos.x || t.y !== pos.y);

    locations.forEach((container, index) => {
        let tiles = usableAdjacent(container);
        const isSource = index < nSourceContainers;

        // Minerals never get a link - StructureLink only ever moves
        // RESOURCE_ENERGY (a hard engine restriction, not a policy choice),
        // so a link at the mineral cluster could never do anything there.
        // No tower/second link either, same as before (ROADMAP 0051 -
        // spotted while designing mineral hauling; ramparts still apply to
        // every cluster, source or mineral, in the section below).
        if (!isSource) return;

        // 1. primary link - reuse one that's already built next to this
        // container before picking a fresh tile
        const builtLink = existingBuiltNear(roomName, STRUCTURE_LINK, container, 1);
        if (builtLink) {
            taken.add(builtLink.pos.x + ":" + builtLink.pos.y);
            tiles = without(tiles, builtLink.pos);
            linkLocations.push({
                x: builtLink.pos.x,
                y: builtLink.pos.y,
                structureType: STRUCTURE_LINK,
                minimalRCL: 1,
            });
        } else if (tiles.length) {
            const t = tiles.shift();
            taken.add(t.x + ":" + t.y);
            const rcl =
                primaryLinkRcl === 0 ? 5 : primaryLinkRcl === 1 ? 6 : 8;
            primaryLinkRcl++;
            linkLocations.push({
                x: t.x,
                y: t.y,
                structureType: STRUCTURE_LINK,
                minimalRCL: rcl,
            });
        }

        // 2. defense tower - same reuse-first rule
        const builtTower = existingBuiltNear(roomName, STRUCTURE_TOWER, container, 1);
        if (builtTower) {
            taken.add(builtTower.pos.x + ":" + builtTower.pos.y);
            tiles = without(tiles, builtTower.pos);
            towerTiles[index] = { x: builtTower.pos.x, y: builtTower.pos.y };
        } else if (tiles.length) {
            const t = tiles.shift();
            taken.add(t.x + ":" + t.y);
            towerTiles[index] = { x: t.x, y: t.y };
        }

        // 3. secondary link - only if a range-1 tile is still free
        if (tiles.length) {
            const t = tiles.shift();
            taken.add(t.x + ":" + t.y);
            linkLocations.push({
                x: t.x,
                y: t.y,
                structureType: STRUCTURE_LINK,
                minimalRCL: 8,
            });
        }
    });

    // --- Per-cluster defense --------------------------------------------
    // Each source's container + collector links become their own hardened
    // point OUTSIDE the base perimeter: ramparts on every piece, plus one
    // adjacent tower per SOURCE cluster (minerals get ramparts, no tower).
    const SOURCE_TOWER_RCLS = [5, 7, 8, 8, 8];
    const defense = [];
    const used = new Set(
        locations.concat(linkLocations).map((b) => b.x + ":" + b.y)
    );
    const linksNear = (c) =>
        linkLocations.filter(
            (l) => Math.abs(l.x - c.x) <= 1 && Math.abs(l.y - c.y) <= 1
        );
    const rampartOn = (b) =>
        defense.push({
            x: b.x,
            y: b.y,
            structureType: STRUCTURE_RAMPART,
            minimalRCL: 3,
            sourceDefense: true,
        });

    locations.forEach((container, index) => {
        if (container.structureType !== STRUCTURE_CONTAINER) return;

        rampartOn(container);
        linksNear(container).forEach(rampartOn);

        // only real energy sources get a tower (tile reserved above)
        if (index >= nSourceContainers) return;

        const towerTile = towerTiles[index];
        if (towerTile) {
            used.add(towerTile.x + ":" + towerTile.y);
            defense.push({
                x: towerTile.x,
                y: towerTile.y,
                structureType: STRUCTURE_TOWER,
                minimalRCL: SOURCE_TOWER_RCLS[index] || 8,
                sourceDefense: true,
            });
            rampartOn(towerTile);
        }
    });

    for (const mineral of minerals) {
        // Add extractor for mineral
        locations.push({
            x: mineral.pos.x,
            y: mineral.pos.y,
            structureType: STRUCTURE_EXTRACTOR,
            minimalRCL: 6,
        });
    }

    return locations.concat(linkLocations).concat(defense);
}

function addStamp(
    roomName,
    stamp,
    floodFillMatrix,
    spawnX = null,
    spawnY = null,
    minDepth = 3
) {
    // Find the locations using the stamp and flood fill matrix
    const newBuildings = findStampLocation(
        roomName,
        stamp,
        floodFillMatrix,
        spawnX,
        spawnY,
        minDepth
    );

    addBuildings(roomName, newBuildings, floodFillMatrix);
    return newBuildings.length;
}

// Place `stamp` for the current plan step, retrying on later ticks with a
// looser flood-fill depth requirement, and skipping the step (with a log) if
// it still cannot be fitted after enough attempts.
function stampStep(pm, roomName, stamp, floodFillMatrix, spawnX, spawnY) {
    const tries = pm.planStepTries || 1;
    const minDepth = tries <= 4 ? 3 : tries <= 8 ? 2 : 1;

    const placed = addStamp(
        roomName,
        stamp,
        floodFillMatrix,
        spawnX,
        spawnY,
        minDepth
    );

    if (placed > 0) {
        pm.planStep++;
        return true;
    }
    if (tries >= 12) {
        console.log(
            `[architect] ${roomName}: step ${pm.planStep} - stamp could not ` +
                `be placed, skipping`
        );
        pm.planStep++;
    }
    return false;
}

function addBuildings(roomName, newBuildings, shouldProtect = true) {
    planStore.mutate(roomName, (plan) => {
        plan.buildings = plan.buildings.concat(newBuildings);

        // Add mincut boundries (for rampart positioning)
        if (shouldProtect) {
            for (const b of newBuildings) {
                plan.mincutBoundries.push({
                    x1: b.x - 1,
                    y1: b.y - 1,
                    x2: b.x + 1,
                    y2: b.y + 1,
                });
            }
        }
    });
}

function findStampLocation(
    roomName,
    stamp,
    floodFillMatrix,
    spawnX = null,
    spawnY = null,
    minDepth = 3
) {
    const room = Game.rooms[roomName];

    // Check if the room exists
    if (!room) {
        console.log(`Room ${roomName} not found.`);
        return [];
    }

    const planned = planBuildings(roomName);

    // Index the plan by tile once. This scan used to walk the whole buildings
    // array three times per stamp cell -> O(50*50 * cells * buildings).
    const byTile = {};
    for (const b of planned) {
        const key = b.x + ":" + b.y;
        (byTile[key] || (byTile[key] = [])).push(b);
    }
    const at = (x, y) => byTile[x + ":" + y] || [];

    const storageLocation = _.find(
        planned,
        (b) => b.structureType == STRUCTURE_STORAGE
    );

    const terrain = terrainMatrix(roomName);
    const stampHeight = stamp["structures"].length;
    const stampWidth = stamp["structures"][0].length;

    let bestVal = -1;
    let bestAdjacentRoads = -1;
    let bestStorageDistance = Infinity;
    let buildings = [];

    // Iterate over possible coordinates for stamp placement
    for (let coordX = 1; coordX < 50 - stampWidth; coordX++) {
        for (let coordY = 1; coordY < 50 - stampHeight; coordY++) {
            let isValid = true;

            let value = 0;
            let storageDistance = 0;

            let adjacentRoads = 0;
            let tmpBuildings = [];

            // Check stamp validity and calculate value and adjacent roads count
            for (let stampY = 0; stampY < stampHeight; stampY++) {
                for (let stampX = 0; stampX < stampWidth; stampX++) {
                    const stampStructure = stamp["structures"][stampY][stampX];
                    const tx = coordX + stampX;
                    const ty = coordY + stampY;
                    const tileEntries = at(tx, ty);

                    if (
                        stampStructure === "A" &&
                        spawnX &&
                        spawnY &&
                        (spawnX !== tx || spawnY !== ty)
                    ) {
                        isValid = false;
                        break;
                    }

                    if (
                        stampStructure !== " " &&
                        stampStructure !== "?" &&
                        floodFillMatrix.get(tx, ty) < minDepth
                    ) {
                        isValid = false;
                        break;
                    }

                    // Check if stamp overlaps with an incompatible plan entry
                    const existingBuilding =
                        stampStructure !== " " &&
                        tileEntries.some(
                            ({ structureType }) =>
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

                    // Calculate value based on flood fill matrix. Bug fix
                    // (0013): this used to add the STAMP ORIGIN's depth once
                    // per cell (value = depth(origin) * cellCount, so it barely
                    // discriminated between placements) - sum each covered
                    // tile's own depth instead, so placements that sit deeper
                    // inside the base score higher.
                    if (stampStructure !== " ") {
                        value += floodFillMatrix.get(tx, ty);
                    }

                    if (storageLocation) {
                        storageDistance +=
                            ((tx - storageLocation.x) ** 2 +
                                (ty - storageLocation.y) ** 2) **
                            (1 / 16);
                    }

                    // Count adjacent roads
                    if (
                        (stampStructure === "." || stampStructure === "?") &&
                        tileEntries.some(
                            (b) => b.structureType === STRUCTURE_ROAD
                        )
                    ) {
                        adjacentRoads += 1;
                    }

                    // Add new buildings to the temporary array
                    if (
                        stampStructure !== " " &&
                        !tileEntries.some(
                            (b) =>
                                b.structureType === layoutKey[stampStructure]
                        ) &&
                        terrain[tx][ty] != TERRAIN_MASK_WALL
                    ) {
                        tmpBuildings.push({
                            x: tx,
                            y: ty,
                            structureType: layoutKey[stampStructure],
                            minimalRCL: stamp["rcl"][stampY][stampX],
                        });

                        if (stamp["ramparts"][stampY][stampX] != " ") {
                            tmpBuildings.push({
                                x: tx,
                                y: ty,
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

            // Update best values and buildings if a better placement is found
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

    // Check top edge
    for (let x = 0; x < 50; x++) {
        if (terrain.get(x, 0) !== TERRAIN_MASK_WALL) {
            exits.push({ x: x, y: 0 });
        }
    }

    // Check bottom edge
    for (let x = 0; x < 50; x++) {
        if (terrain.get(x, 49) !== TERRAIN_MASK_WALL) {
            exits.push({ x: x, y: 49 });
        }
    }

    // Check left edge
    for (let y = 1; y < 49; y++) {
        if (terrain.get(0, y) !== TERRAIN_MASK_WALL) {
            exits.push({ x: 0, y: y });
        }
    }

    // Check right edge
    for (let y = 1; y < 49; y++) {
        if (terrain.get(49, y) !== TERRAIN_MASK_WALL) {
            exits.push({ x: 49, y: y });
        }
    }

    return exits;
}

function testSpawnPosition(roomName) {
    const room = Game.rooms[roomName];
    if (!room) return null;

    const stamp = ["  .  ", " .E. ", ".EAE.", " .E. ", "  .  "];
    const terrain = room.getTerrain();
    const distance = new PathFinder.CostMatrix();
    const exits = getAllExitCoordinates(roomName);
    const queue = exits.map((exit) => ({ x: exit.x, y: exit.y, depth: 0 }));
    const visited = new PathFinder.CostMatrix();

    for (const exit of exits) {
        visited.set(exit.x, exit.y, 1);
    }

    let queueIndex = 0;
    while (queueIndex < queue.length) {
        const position = queue[queueIndex++];
        if (
            position.depth > 0 &&
            terrain.get(position.x, position.y) !== TERRAIN_MASK_WALL
        ) {
            distance.set(position.x, position.y, position.depth);
        }

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = position.x + dx;
                const y = position.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (!visited.get(x, y)) {
                    visited.set(x, y, 1);
                    queue.push({ x, y, depth: position.depth + 1 });
                }
            }
        }
    }

    let best = null;
    for (let x = 1; x < 45; x++) {
        for (let y = 1; y < 45; y++) {
            let score = 0;
            let valid = true;

            for (let stampY = 0; stampY < stamp.length && valid; stampY++) {
                for (let stampX = 0; stampX < stamp[stampY].length; stampX++) {
                    if (stamp[stampY][stampX] === " ") continue;
                    const tileX = x + stampX;
                    const tileY = y + stampY;
                    if (
                        terrain.get(tileX, tileY) === TERRAIN_MASK_WALL ||
                        distance.get(tileX, tileY) < 3
                    ) {
                        valid = false;
                        break;
                    }
                    score += distance.get(tileX, tileY);
                }
            }

            if (valid && (!best || score > best.score)) {
                best = { x: x + 2, y: y + 2, score };
            }
        }
    }

    if (best) {
        const visual = new RoomVisual(roomName);
        visual.rect(best.x - 2.5, best.y - 2.5, 5, 5, {
            stroke: "#00ff88",
            strokeWidth: 0.15,
            fill: "#00ff88",
            opacity: 0.12,
        });
        visual.circle(best.x, best.y, {
            radius: 0.45,
            fill: "#00ff88",
            stroke: "#ffffff",
            strokeWidth: 0.1,
        });
        visual.text(
            `TEST SPAWN ${best.x},${best.y} score=${best.score}`,
            best.x,
            best.y - 3,
            { color: "#00ff88", font: 0.7, align: "center" }
        );
        console.log("Best spawn position:", JSON.stringify(best));
    }

    return best;
}

global.testSpawnPosition = testSpawnPosition;

// Wipe a room's city plan so planCity() rebuilds it from scratch over the next
// ~13 ticks (needs Game.cpu.bucket >= 500). Existing structures are not
// demolished; use destroyUnplannedRoads() for roads.
// Run from the console: replanRoom("W1N1")
function replanRoom(roomName) {
    const mem = Memory.rooms[roomName];
    if (!mem) {
        console.log(`[replan] no memory for room ${roomName}`);
        return;
    }
    delete mem.planned;
    delete mem.planStep;
    delete mem.buildings;
    delete mem.mincutBoundries;
    delete mem.constructionIndex;
    planStore.dropPlan(roomName);
    console.log(`[replan] ${roomName}: plan cleared, rebuilding`);
}

global.replanRoom = replanRoom;

// Destroy every built road in a room that is not part of the city plan.
// Run from the console:
//   destroyUnplannedRoads("W1N1")        -> destroys the unplanned roads
//   destroyUnplannedRoads("W1N1", true)  -> dry run, only lists them
function destroyUnplannedRoads(roomName, dryRun = false) {
    const room = Game.rooms[roomName];
    if (!room) {
        console.log(`[cleanup] no visibility in room ${roomName}`);
        return;
    }

    const mem = Memory.rooms[roomName];
    const plan = planStore.getPlan(roomName);
    if (!plan) {
        console.log(`[cleanup] room ${roomName} has no plan in memory`);
        return;
    }
    if (!mem || !mem.planned) {
        console.log(
            `[cleanup] WARNING: the plan for ${roomName} is not finished yet`
        );
    }

    const plannedRoads = new Set(
        plan.buildings
            .filter((b) => b.structureType === STRUCTURE_ROAD)
            .map((b) => b.x + "," + b.y)
    );

    const unplanned = room
        .find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_ROAD,
        })
        .filter((road) => !plannedRoads.has(road.pos.x + "," + road.pos.y));

    const visual = new RoomVisual(roomName);
    for (const road of unplanned) {
        visual.circle(road.pos, {
            radius: 0.5,
            fill: "#ff0000",
            opacity: 0.5,
        });
        if (!dryRun) {
            road.destroy();
        }
    }

    console.log(
        `[cleanup] ${roomName}: ${unplanned.length} unplanned road(s) ` +
            (dryRun ? "listed (dry run)" : "destroyed") +
            (unplanned.length
                ? " -> " + unplanned.map((r) => r.pos.x + "," + r.pos.y).join(" ")
                : "")
    );
    return unplanned.length;
}

global.destroyUnplannedRoads = destroyUnplannedRoads;

function visualizeStructures(structures, roomName, showRCL = false) {
    const room = Game.rooms[roomName];
    const roomVisual = room ? room.visual : new RoomVisual(roomName);

    // Only draw plan entries that are not built yet - once the real structure
    // exists there is nothing to preview.
    const built = new Set();
    if (room) {
        for (const s of roomCache.structures(room)) {
            built.add(s.pos.x + ":" + s.pos.y + ":" + s.structureType);
        }
    }

    for (const structure of structures) {
        const { x, y, structureType, minimalRCL } = structure;
        if (built.has(x + ":" + y + ":" + structureType)) continue;

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

// First road tile of the plan adjacent to the spawn - the real jumping-off
// point for every other road, since the spawn tile itself is never walkable.
// Falls back to the spawn's own position if no road is planned next to it
// yet (e.g. this very step hasn't run before).
function roadAnchor(roomName, spawnBuilding) {
    const road = planBuildings(roomName).find(
        (b) =>
            b.structureType === STRUCTURE_ROAD &&
            Math.max(
                Math.abs(b.x - spawnBuilding.x),
                Math.abs(b.y - spawnBuilding.y)
            ) <= 1
    );
    return road || spawnBuilding;
}

const EDGE_FOR_DIRECTION = {
    [FIND_EXIT_TOP]: (t) => t.y === 0,
    [FIND_EXIT_BOTTOM]: (t) => t.y === 49,
    [FIND_EXIT_LEFT]: (t) => t.x === 0,
    [FIND_EXIT_RIGHT]: (t) => t.x === 49,
};

// The walkable exit tile on `direction`'s edge closest to `anchor` - where a
// road to that neighboring room should land.
function closestExitTile(roomName, anchor, direction) {
    const edgeFilter = EDGE_FOR_DIRECTION[direction];
    if (!edgeFilter) return null;

    let best = null;
    let bestDist = Infinity;
    for (const tile of getAllExitCoordinates(roomName).filter(edgeFilter)) {
        const dist = Math.max(
            Math.abs(tile.x - anchor.x),
            Math.abs(tile.y - anchor.y)
        );
        if (dist < bestDist) {
            bestDist = dist;
            best = tile;
        }
    }
    return best;
}

function getShortestPath(roomName, x1, y1, x2, y2, range = 1) {
    const room = Game.rooms[roomName];
    const buildings = planBuildings(roomName);

    if (!buildings.length) {
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
        { pos: target, range },
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

    // Visualize the path
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

    // Convert path to list of road elements
    const roadElements = filteredPath.map((step) => ({
        x: step.x,
        y: step.y,
        structureType: STRUCTURE_ROAD,
        minimalRCL: 3,
    }));

    return roadElements;
}

module.exports = planCity;
// exposed for the offline smoke test only (0013: stamp scoring)
module.exports.findStampLocation = findStampLocation;
