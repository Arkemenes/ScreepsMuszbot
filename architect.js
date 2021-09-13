
var roleSpawn = {

    run: function() {
        for (let spawnName in Game.spawns){

            var room = Game.spawns[spawnName].room;

            var sources = room.find(FIND_SOURCES);

            for (let sourceName in sources) {
                let source = sources[sourceName];

                
            }
        }
    }

};


module.exports = roleSpawn;