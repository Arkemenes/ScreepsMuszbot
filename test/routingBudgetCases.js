module.exports = function (project, assert) {
    const path = require("path");
    const routing = require(path.join(project,"src/utils/routing"));
    const safety = require(path.join(project,"src/utils/transitSafety"));
    const meter = require(path.join(project,"src/utils/cpuMeter"));
    const saved={game:Game,memory:Memory,search:PathFinder.search,span:meter.span};
    const measured = [];
    meter.span = (key, fn) => {
        const before = Game.cpu.getUsed();
        try { return saved.span(key, fn); }
        finally { measured.push({key, cpu:Game.cpu.getUsed()-before}); }
    };
    let used=1, searches=0, complete=false, searchOptions, serial=0;
    const make=()=>({name:"budget-claim-"+(++serial),room:{name:"E1N45"},pos:new RoomPosition(25,25,"E1N45"),
        memory:{},fatigue:0,move:()=>OK,moveTo:()=>OK});
    const opts={nativeRoute:true,blockHostiles:true};
    try {
        global.Memory={settings:{},rooms:{E1N45:{my:true},E1N44:{}}};
        global.Game=Object.assign({},saved.game,{time:199000000,rooms:{},creeps:{},
            cpu:{bucket:10000,tickLimit:30,getUsed:()=>used},
            map:Object.assign({},saved.game.map,{findRoute:()=>[{room:"E1N44",exit:TOP}],
                getRoomTerrain:()=>({get:()=>0}),getRoomLinearDistance:(a,b)=>a===b?0:1})});
        PathFinder.search=(from,to,o)=>{searches++;used+=4;searchOptions=o;
            return {incomplete:!complete,path:complete?[new RoomPosition(25,49,"E1N44")]:[]};};
        let failed=make();
        routing.moveToRoom(failed,"E1N44",opts);
        assert(searches===1 && searchOptions.maxOps===10000,
            "complete-route planning is capped by the per-search CPU allowance instead of 200000 ops");
        for(let i=1;i<50;i++){Game.time++;used=1;
            failed=Object.assign({},failed);
            routing.moveToRoom(failed,"E1N44",opts);}
        assert(searches===1,"failed full-trip searches stay throttled when the engine recreates the creep object each tick");
        Game.time++;used=1;routing.moveToRoom(failed,"E1N44",opts);
        assert(searches===2,"a failed route can be tried again after its bounded backoff expires");
        Game.time++;used=1;Memory.settings.routing={avoidPlayers:["new-budget-ban"]};
        routing.moveToRoom(failed,"E1N44",opts);
        assert(searches===3,"a changed transit policy permits a fresh attempt before the old backoff expires");

        Game.time++;used=27;const deferred=make();const before=searches;
        assert(routing.moveToRoom(deferred,"E1N44",opts)===ERR_BUSY && searches===before && !deferred.memory._realRoute,
            "insufficient tick CPU postpones planning without a search or false dead-end result");
        assert(routing.planningStatus(deferred).reason==="tick_cpu",
            "planning diagnostics distinguish tick exhaustion from a bucket shortage");
        used=1;complete=true;
        routing.moveToRoom(deferred,"E1N44",opts);
        assert(searches===before+1 && deferred.memory._realRoute[0]==="E1N44",
            "a CPU-deferred planner resumes when budget becomes available");
        const another=make();
        assert(routing.moveToRoom(another,"E1N44",opts)===ERR_BUSY && searches===before+1,
            "two travelers cannot start separate full-trip searches in the same tick");
        assert(routing.planningStatus(another).reason==="tick_search_limit",
            "planning diagnostics identify the shared per-tick search limit");
        Game.time++;Game.cpu.bucket=0;used=1;
        Memory.rooms.W7N49={my:true};
        safety.observeRoom({name:"W7N49"});
        assert(routing.moveToRoom(deferred,"E1N44",opts)===OK && searches===before+1,
            "unrelated observer intel does not discard a validated route or trigger planning with an empty bucket");
        assert(routing.moveToRoom(another,"E1N44",opts)===ERR_BUSY && searches===before+1,
            "an empty bucket prevents fresh planning without spending more CPU on PathFinder");

        Game.time++;Game.cpu.bucket=10000;used=1;
        const seeded=make();seeded.memory={_realRoute:["E1N44"],_realRouteDest:"E1N44",_realRouteFrom:"E1N45"};
        const beforeSeed=searches;
        routing.moveToRoom(seeded,"E1N44",{blockHostiles:true});
        assert(searches===beforeSeed+1,
            "trip initialization does not rebuild waypoints only to discard them and search a second time");
        const stats=routing.planningStatus(seeded);
        assert(stats.cpu===4 && stats.maxOps===10000 && stats.lastSearchTick===Game.time,
            "bounded route diagnostics report the last search CPU cost and operation ceiling");
        assert(!JSON.stringify(seeded.memory).includes("nextRetryTick"),
            "derived planning backoff and search cache stay in the heap");
        Game.time++;used=1;Memory.rooms.E1N44.owner="new-budget-ban";
        const beforeOwner=searches;
        assert(routing.moveToRoom(deferred,"E1N44",opts)===ERR_NO_PATH &&
            !deferred.memory._realRoute && searches===beforeOwner,
            "a newly banned owner on the actual route still invalidates cached movement without searching into it");
        delete Memory.rooms.E1N44.owner;
        Game.time++;used=1;complete=false;
        let normal=make();const beforeNormal=searches;
        routing.moveToRoom(normal,"E1N44",{blockHostiles:true});
        for(let i=1;i<50;i++){Game.time++;used=1;normal=Object.assign({},normal);
            routing.moveToRoom(normal,"E1N44",{blockHostiles:true});}
        assert(searches===beforeNormal+1,"normal room-graph fallback also preserves full-search backoff across creep recreation");
        Game.time++;used=1;complete=true;
        routing.moveToRoom(normal,"E1N44",{blockHostiles:true});
        assert(searches===beforeNormal+2 && normal.memory._realRoute,
            "normal fallback obtains a validated route when a later bounded retry succeeds");
        assert(measured.length===searches && measured.every((entry) =>
            entry.key==="routing.realSearch" && entry.cpu===4),
            "full-route CPU spans measure each actual search once and preserve cached/deferred movement");
    } finally {global.Game=saved.game;global.Memory=saved.memory;PathFinder.search=saved.search;meter.span=saved.span;}
};

