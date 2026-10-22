let creepLogic = {
    bootstrap: require("./bootstrap"),
    defender: require("./defender"),
    defenderStriker: require("./defenderStriker"),
    defenderMedic: require("./defenderMedic"),
    miner: require("./miner"),
    hauler: require("./hauler"),
    pioneer: require("./pioneer"),
    upgrader: require("./upgrader"),
    builder: require("./builder"),
    reserver: require("./reserver"),
    remoteMiner: require("./remoteMiner"),
    remoteHauler: require("./remoteHauler"),
    mineralMiner: require("./mineralMiner"),
    scout: require("./scout"),
    raider: require("./raider"),
    looter: require("./looter"), // ROADMAP 0177
    squadDismantler: require("./squadDismantler"),
};

module.exports = creepLogic;
