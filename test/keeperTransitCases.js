// Claim transit must exclude danger tiles, rather than every keeper room.
module.exports = function (project, assert) {
    const path = require("path");
    const modulePath = path.join(project, "src/utils/keeperTransit.js");
    const keeperTransit = require(modulePath);
    const routing = require(path.join(project, "src/utils/routing"));
    const reserver = require(path.join(project, "src/roles/reserver"));
    const combat = require(path.join(project, "src/utils/combat"));
    const observer = require(path.join(project, "src/utils/observer"));
    const getIntel = require(path.join(project, "src/rooms/intel"));
    const { getHostiles } = require(path.join(project, "src/utils/hostiles"));
    const saved = { game: Game, memory: Memory, search: PathFinder.search, flee: combat.flee,
        move: routing.moveToRoom, lair: global.STRUCTURE_KEEPER_LAIR,
        observerFor: observer.observerFor };
    try {
        global.STRUCTURE_KEEPER_LAIR = "keeperLair";
        const sk = "E4N44";
        const keeper = { id: "keeper-transit", owner: { username: "Source Keeper" },
            my: false, pos: new RoomPosition(25, 25, sk), body: [{ type: ATTACK, hits: 100 }] };
        const lair = { id: "keeper-lair-transit", structureType: STRUCTURE_KEEPER_LAIR,
            pos: new RoomPosition(25, 25, sk) };
        let enemies = [keeper];
        const room = { name: sk, find: (type) =>
            type === FIND_STRUCTURES ? [lair] : type === FIND_SOURCES ? [{pos:new RoomPosition(24,25,sk)}] :
            type === FIND_CREEPS || type === FIND_HOSTILE_CREEPS ? enemies : [] };
        global.Game = Object.assign({}, saved.game, { time: 197000000, rooms: { [sk]: room }, creeps: {},
            cpu: Object.assign({}, saved.game.cpu, { bucket: 10000 }),
            map: Object.assign({}, saved.game.map, { getRoomLinearDistance: (a,b) => a===b?0:1 }) });
        global.Memory = { settings: {}, rooms: { [sk]: { enemies: 1, hasController: false, sourceNumber: 3 } } };
        const opts = { blockHostiles: true, allowSourceKeepers: true };
        assert(keeperTransit.isKeeperRoom(sk) && !keeperTransit.isKeeperRoom("E5N45"),
            "keeper transit distinguishes SK geometry from its center room");
        keeperTransit.observe(room);
        assert(keeperTransit.canTransit(sk), "a known SK with only keepers is eligible for claim transit");
        const base = new PathFinder.CostMatrix();
        const matrix = keeperTransit.matrix(sk, base);
        assert(matrix.get(25,25) === 255 && matrix.get(30,25) === 255 && matrix.get(1,1) < 255,
            "keeper/lair danger zones are excluded while an outer corridor remains available");
        assert(base.get(25,25) === 0, "keeper overlays never mutate the shared structure matrix");
        const epoch = keeperTransit.policyKey();
        Game.time++;
        keeper.pos = new RoomPosition(26,25,sk);
        keeperTransit.observe(room);
        assert(keeperTransit.policyKey() === epoch,
            "ordinary keeper movement does not trigger another full-trip terrain search");

        let callback;
        PathFinder.search = (origin, goal, searchOpts) => {
            callback = searchOpts.roomCallback;
            return { incomplete:false, path:[new RoomPosition(0,1,sk),
                new RoomPosition(1,1,"E4N43"),new RoomPosition(1,1,"E5N43"),
                new RoomPosition(1,1,"E5N42"),new RoomPosition(1,1,"E5N41")] };
        };
        routing.computeRealRoute(new RoomPosition(40,1,"E3N44"),"E5N41",opts);
        assert(callback(sk) !== false && callback(sk).get(25,25) === 255,
            "claim full-trip planning admits SK through its tile danger mask");
        routing.computeRealRoute(new RoomPosition(40,1,"E3N44"),"E5N41",{blockHostiles:true});
        assert(callback(sk) === false,
            "roles without the keeper-transit option retain the original hostile-room exclusion");
        let nativeOptions;
        const traveler = { name:"keeper-corridor-claimer", room:{name:"E3N44"},
            pos:new RoomPosition(40,1,"E3N44"), memory:{}, fatigue:0,
            move:()=>OK, moveTo:(p,o)=>{nativeOptions=o;return OK;} };
        routing.moveToRoom(traveler,"E5N41",opts);
        assert(nativeOptions.costCallback(sk,new PathFinder.CostMatrix()).get(25,25) === 255 &&
            nativeOptions.costCallback(sk,new PathFinder.CostMatrix()).get(1,1) < 255,
            "native execution receives the same keeper danger mask as terrain planning");
        const fallback=routing.routeCostCallback([{room:sk}],"E3N44","E5N41",opts);
        const retreat=routing.avoidCostCallback([],Object.assign({currentRoomName:"E3N44"},opts));
        assert(fallback(sk,base).get(25,25)===255 && retreat(sk,base).get(25,25)===255 &&
            retreat(sk,base).get(1,1)<255,
            "room-graph fallback and retreat callbacks retain the keeper tile exclusions");
        Memory.settings.routing={avoidPlayers:["BlockedKeeperOwner"]};
        Memory.rooms[sk].owner="BlockedKeeperOwner";
        room.controller={owner:{username:"BlockedKeeperOwner"}};
        routing.computeRealRoute(new RoomPosition(40,1,"E3N44"),"E5N41",opts);
        assert(callback(sk) === false, "an aggressor-owner ban always overrides the keeper-transit exception");
        assert(fallback(sk,base).get(1,1)===255 && retreat(sk,base).get(1,1)===255,
            "owner bans also close the whole SK in fallback and retreat callbacks");
        delete Memory.rooms[sk].owner;
        delete room.controller;
        Memory.settings.routing={};

        const local = { name:"keeper-cache",room,pos:new RoomPosition(18,25,sk),
            memory:{_move:{path:"3"}},fatigue:0 };
        keeperTransit.invalidateNextStep(local);
        assert(!local.memory._move, "a cached step entering a keeper/lair zone is discarded before movement");
        local.memory._move={path:"192533"};
        keeperTransit.invalidateNextStep(local);
        assert(!local.memory._move,"native serialized coordinates are decoded before checking the next keeper tile");
        local.pos=new RoomPosition(1,1,sk);
        local.memory._move={path:"02013"};
        keeperTransit.invalidateNextStep(local);
        assert(!!local.memory._move,"a safe adjacent native step keeps its cached path");
        local.memory._move={path:"40403"};
        keeperTransit.invalidateNextStep(local);
        assert(!local.memory._move,"a stale native path unrelated to the current position is invalidated");
        let fled=0;
        combat.flee=()=>{fled++;return OK;};
        local.pos=new RoomPosition(23,25,sk);
        local.memory={mission:"claim",targetRoom:"E5N41",role:"reserver"};
        Memory.claimTarget={room:"E5N41",from:"E1N45"};
        reserver.run(local);
        assert(fled===1 && Memory.claimTarget.lastSeen.phase === "evading_keeper",
            "claimer locally evades a nearby keeper instead of blaming the room as a dead end");

        Game.time++;
        enemies=[];
        keeperTransit.observe(room);
        assert(keeperTransit.matrix(sk,base).get(25,25) === 255,
            "a keeper respawn window does not remove the permanent lair exclusion");
        Game.time++;
        enemies=[{owner:{username:"Invader"},my:false,pos:new RoomPosition(10,10,sk),body:[]}];
        keeperTransit.observe(room);
        assert(!keeperTransit.canTransit(sk), "an Invader in SK preserves whole-room hostile exclusion");
        for (const ally of [false, true]) {
            Game.time++;
            const username = ally ? "KeeperTransitAlly" : "UnknownArmedPlayer";
            Memory.settings.allies = ally ? [username] : [];
            Memory.settings.hostilePlayers = []; Memory.settings.targetEnemies = [];
            enemies = [keeper, { owner: { username }, my: false,
                pos: new RoomPosition(10, 10, sk), body: [{ type: ATTACK, hits: 100 }] }];
            const diplomatic = getHostiles(room);
            keeperTransit.observe(room, diplomatic);
            assert(diplomatic.length === 1 && !keeperTransit.canTransit(sk),
                "ARK-124: SK transit blocks " + (ally ? "allied" : "unlisted") + " players without changing diplomacy");
            assert(fallback(sk, base).get(1, 1) === 255 && retreat(sk, base).get(1, 1) === 255,
                "ARK-124: player presence excludes SK from fallback and retreat even when combat ignores it");
        }
        Game.time++;
        enemies = [keeper];
        const counts = {}, oldFind = room.find;
        room.find = (type) => { counts[type] = (counts[type] || 0) + 1; return oldFind(type); };
        Memory.rooms[sk] = { exits: {} };
        getIntel(room);
        keeperTransit.canTransit(sk); keeperTransit.matrix(sk, base);
        assert(counts[FIND_SOURCES] === 1 && counts[FIND_MINERALS] === 1 && counts[FIND_HOSTILE_CREEPS] === 1,
            "ARK-124: first SK intel and transit share one source, mineral and foreign-creep scan per tick");
        assert(keeperTransit.canTransit(sk) && Memory.rooms[sk].sourceNumber === 1 && Memory.rooms[sk].mineral === null,
            "ARK-124: clearing foreign players restores keeper-only transit and preserves initial intel");
        room.find = oldFind;
        Memory.rooms[sk].sourceNumber = 3;
        Game.time++;
        enemies=[];
        keeperTransit.observe(room);
        delete Game.rooms[sk];
        Game.time++;
        assert(keeperTransit.canTransit(sk), "recent heap geometry can protect an approaching claim hop without current vision");
        Game.time+=201;
        observer.observerFor=()=>({id:"transit-observer"});
        assert(!keeperTransit.canTransit(sk), "expired keeper geometry is never replaced by an enemies-count guess");
        assert(Memory.observeRequests[sk]===Game.time+20,
            "missing geometry in a known SK requests fresh vision through the existing observer queue");
        const expiredKey=keeperTransit.policyKey();
        assert(!JSON.stringify(Memory).includes("centers"), "keeper geometry and matrices stay in the heap");

        Game.rooms[sk]=room;
        Game.time++;
        keeperTransit.observe(room);
        assert(keeperTransit.policyKey()!==expiredKey,"fresh observer geometry changes the route policy version");
        traveler.memory._routeKeeperKey=expiredKey;
        traveler.memory._realRoute=["E0N40"];
        traveler.memory._realRouteDest="E5N41";
        routing.moveToRoom(traveler,"E5N41",opts);
        assert(!traveler.memory._realRoute.includes("E0N40"),
            "new keeper geometry revalidates an old detour instead of retaining it indefinitely");
        const refreshedRoute=traveler.memory._realRoute;
        Game.time++;
        keeperTransit.observe(room);
        routing.moveToRoom(traveler,"E5N41",opts);
        assert(traveler.memory._realRoute===refreshedRoute,
            "unchanged keeper geometry preserves the full-trip route cache on the next tick");
        const coreRoom="E5N43";
        const core={id:"claim-transit-core",structureType:STRUCTURE_INVADER_CORE,
            owner:{username:"Invader"},pos:new RoomPosition(25,25,coreRoom)};
        Game.rooms[coreRoom]={name:coreRoom,find:type=>type===FIND_STRUCTURES?[core]:[]};
        Memory.rooms[coreRoom]={enemies:0,hasInvaderCore:true,enemyStructures:1,my:false};
        routing.computeRealRoute(new RoomPosition(1,1,"E4N43"),"E5N41",opts);
        const coreMatrix=callback(coreRoom);
        assert(coreMatrix!==false && coreMatrix.get(1,1)<255 && coreMatrix.get(25,25)===255,
            "an isolated Invader Core blocks its own tile, not the claimer transit room");
        const coreFallback=routing.routeCostCallback([{room:coreRoom}],"E4N43","E5N41",opts);
        const coreRetreat=routing.avoidCostCallback([],Object.assign({currentRoomName:"E4N43"},opts));
        assert(coreFallback(coreRoom,base).get(1,1)<255 && coreFallback(coreRoom,base).get(25,25)===255 &&
            coreRetreat(coreRoom,base).get(1,1)<255 && coreRetreat(coreRoom,base).get(25,25)===255,
            "native fallback and retreat can pass around an isolated Invader Core");
        let coreGraphCost;
        Game.map.findRoute=(from,to,o)=>{coreGraphCost=o.routeCallback(coreRoom);return [{room:coreRoom}];};
        routing.findRoute("E4N43","E5N41",opts);
        assert(Number.isFinite(coreGraphCost),"the room graph admits a core-only transit room");
        Memory.rooms[coreRoom].enemies=1;
        routing.computeRealRoute(new RoomPosition(1,1,"E4N43"),"E5N41",opts);
        assert(callback(coreRoom)===false && coreRetreat(coreRoom,base).get(1,1)===255,
            "mobile hostiles accompanying a core still exclude the transit room");
        Memory.rooms[coreRoom].enemies=0;
        local.room={name:"E3N44"}; local.pos=new RoomPosition(40,1,"E3N44");
        local.memory={mission:"claim",targetRoom:"E5N41",role:"reserver"};
        let enabled;
        routing.moveToRoom=(c,d,o)=>{enabled=o.allowSourceKeepers;return OK;};
        reserver.run(local);
        assert(enabled===true,"claim opts into keeper transit by default without changing reserve missions");
        Memory.settings.claim={keeperTransit:false};
        reserver.run(local);
        assert(enabled===false,"keeper transit can be disabled through claim config");
    } finally {
        global.Game=saved.game; global.Memory=saved.memory; PathFinder.search=saved.search;
        combat.flee=saved.flee; routing.moveToRoom=saved.move;
        observer.observerFor=saved.observerFor;
        if(saved.lair===undefined) delete global.STRUCTURE_KEEPER_LAIR;
        else global.STRUCTURE_KEEPER_LAIR=saved.lair;
    }
};
