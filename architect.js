module.exports = {
    // a function to run the logic for this role
    createBuildingSites: function () {


        for (let roomName in Game.rooms) {
            let room = Game.rooms[roomName];
            if (room.controller.my) {

                if (!Memory.rooms[roomName]) {
                    Memory.rooms[roomName] = {}
                }
                if (!Memory.rooms[roomName].builds) {
                    Memory.rooms[roomName].builds = [];

                    center = undefined; 

                    let mySpawns = room.find(FIND_MY_SPAWNS);
                    if (!mySpawns[0]){
                        center = findBaseCenter(roomName);
                    }
                    else {
                        let possibleSpawns = getPossibleSpawns(roomName, false);

                        for (let spawnName in mySpawns) {
                            for (let possibleSpawnName in possibleSpawns) {
                                if (mySpawns[spawnName].pos.x == possibleSpawns[possibleSpawnName][0] &&
                                    mySpawns[spawnName].pos.y == possibleSpawns[possibleSpawnName][1]) {
                                        center = possibleSpawns[possibleSpawnName];
                                        center[1]++;
                                        break;
                                    }
                            }
                            if (center) {
                                break;
                            }
                            
                        }
                    }
                    

                    Memory.rooms[roomName].center = Game.rooms[roomName].getPositionAt(center[0], center[1]);

                    // RCL 1

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_SPAWN
                    });


                    // 2 Containers
                    // TODO: container logic

                    // RCL 2

                    // Extensions

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    // Roads

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1],
                        'structureType': STRUCTURE_ROAD
                    });

                    // RCL 3

                    // 5 Extensions

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    // 1 Tower

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_TOWER
                    });

                    // Outer ramparts

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1],
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_RAMPART
                    });
                   
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_RAMPART
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1],
                        'structureType': STRUCTURE_RAMPART
                    });
                    // RCL 4


                    // 10 Extensions

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    // 1 Storage

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1],
                        'structureType': STRUCTURE_STORAGE
                    });

                    //  RCL 5

                    // 2 Links

                    // TODO: link collector

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_LINK
                    });

                    // 1 Tower

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_TOWER
                    });

                    // 10 Extensions

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    // roads

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 6,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 6,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_ROAD
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] - 6,
                        'structureType': STRUCTURE_ROAD
                    });
                    



                    // RCL 6

                    // 10 Extensions

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] - 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 5,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    // 1 Link
                    // TODO: link upgrader

                    // 1 Extractor
                    // TODO: extrator

                    // 3 Lab
                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_LAB
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_LAB
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_LAB
                    });

                    // 1 Terminal

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_TERMINAL
                    });


                    // RCL 7

                    // 1 Spawn

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_SPAWN
                    });

                    // 10 Extensions

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 4,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 3,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 5,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] + 4,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] + 3,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    // 1 Tower

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1],
                        'structureType': STRUCTURE_TOWER
                    });

                    // 3 Labs

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_LAB
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_LAB
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_LAB
                    });

                    // 1 Factory

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1],
                        'structureType': STRUCTURE_FACTORY
                    });

                    // RCL 8

                    // 1 Oberser

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_OBSERVER
                    });

                    // 1 Spawn

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 2,
                        'y': center[1] + 2,
                        'structureType': STRUCTURE_SPAWN
                    });

                    // 10 Extensions

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_EXTENSION
                    });

                    // 3 towers

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 2,
                        'y': center[1],
                        'structureType': STRUCTURE_TOWER
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] - 1,
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_TOWER
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 1,
                        'y': center[1] - 1,
                        'structureType': STRUCTURE_TOWER
                    });

                    // 4 labs

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 3,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_LAB
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] - 3,
                        'structureType': STRUCTURE_LAB
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 4,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_LAB
                    });

                    Memory.rooms[roomName].builds.push({
                        'x': center[0] + 5,
                        'y': center[1] - 2,
                        'structureType': STRUCTURE_LAB
                    });

                    // 1 power spawn

                    Memory.rooms[roomName].builds.push({
                        'x': center[0],
                        'y': center[1] + 1,
                        'structureType': STRUCTURE_POWER_SPAWN
                    });

                    // 1 nuker

                }
            }
            for (structIndex in Memory.rooms[roomName].builds) {
                if (Memory.rooms[roomName].builds[structIndex].structureType == STRUCTURE_RAMPART) {
                    new RoomVisual(roomName).text("💥", Memory.rooms[roomName].builds[structIndex].x, Memory.rooms[roomName].builds[structIndex].y);
                }

        }

        }
        


    },
    getPossibleSpawns: function (roomName, visualize = true) {
        getPossibleSpawns(roomName, visualize);

    }

};


function findBaseCenter(roomName) {

    let possibleSpawns = getPossibleSpawns(roomName, false);

    let energySources = Game.rooms[roomName].find(FIND_SOURCES);

    let distances = [];

    for (let spawnIndex in possibleSpawns) {
        let distance = 0;
        for (let energyName in energySources) {
            distance += Game.rooms[roomName].getPositionAt(possibleSpawns[spawnIndex][0], possibleSpawns[spawnIndex][1]).getRangeTo(energySources[energyName]);
        }
        distances.push(distance);
    }
    target = possibleSpawns[distances.indexOf(Math.min(...distances))];

    

    // target[1] = target[1] - 1;

    return target;
}



function getPossibleSpawns(roomName, visualize = true) {
    const terrain = new Room.Terrain(roomName);

    let terrainBuffer = terrain.getRawBuffer();

    let possibleSpawns = [];


    for (let i = 7; i < 43; i++) {
        for (let j = 6; j < 42; j++) {

            for (let k = -6; k < 7; k++) {
                for (let l = -5; l < 8; l++) {
                    if (terrainBuffer[(l + j) * 50 + (k + i)] == 0 || terrainBuffer[(l + j) * 50 + (k + i)] == 2 ||
                        (k == -6 && (l <= -2 || l >= 4)) ||
                        (k == -5 && (l <= -3 || l >= 5)) ||
                        (k == -4 && (l <= -4 || l >= 6)) ||
                        (k == -3 && (l <= -5 || l >= 7)) ||
                        (k == 3 && (l <= -5 || l >= 7)) ||
                        (k == 4 && (l <= -4 || l >= 6)) ||
                        (k == 5 && (l <= -3 || l >= 5)) ||
                        (k == 6 && (l <= -2 || l >= 4))) {
                        valid = true;
                    }
                    else {
                        valid = false;
                        break
                    }

                }
                if (!valid) {
                    break;
                }

            }

            if (valid) {
                possibleSpawns.push([i, j]);
                if (visualize) {
                    new RoomVisual(roomName).text("💥", i, j);
                }
            }


        }
    }



    return possibleSpawns;
}