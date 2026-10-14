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
        assert(measured.some((entry)=>entry.key==="routing.graphRoute") &&
            measured.some((entry)=>entry.key==="routing.clearance"),
            "routing diagnostics include graph selection/cache validation and crossing clearance");
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
        let lowBucketMove;
        another.moveTo=(target,options)=>{lowBucketMove={target,options};return OK;};
        assert(routing.moveToRoom(another,"E1N44",{...opts,allowUnplannedHop:true})===OK && searches===before+1 &&
            lowBucketMove.options.maxRooms===2 && lowBucketMove.target.roomName==="E1N44",
            "ARK-116: empty bucket defers full planning while allowing a bounded next-room crossing");

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
        const realSearches = measured.filter((entry) => entry.key === "routing.realSearch");
        assert(realSearches.length===searches && realSearches.every((entry) => entry.cpu===4),
            "full-route CPU spans measure each actual search once and preserve cached/deferred movement");
        assert(measured.some((entry) => entry.key === "routing.movePlanned") &&
            measured.some((entry) => entry.key === "routing.moveFallback") &&
            measured.filter((entry) => entry.key !== "routing.realSearch").every((entry) => entry.cpu === 0),
            "ARK-116: native planned/fallback spans measure movement separately from full-route validation");
        Game.time++; used=1; complete=false;
        Game.map.findRoute=()=>[{room:"E1N44",exit:TOP},{room:"E1N43",exit:TOP}];
        const hopFallback=make(); let movement;
        hopFallback.moveTo=(target, options)=>{movement={target,options}; return OK;};
        assert(routing.moveToRoom(hopFallback,"E1N43",{blockHostiles:true})===OK &&
            !hopFallback.memory._realRoute && movement.target.roomName==="E1N44" &&
            movement.options.maxRooms===2 && movement.options.maxOps===20000 &&
            movement.target.x===25 && movement.target.y===25 && movement.options.range===24,
            "ARK-116: unvalidated multiroom fallback targets only its next hop with the hop search budget");
        const third=movement.options.costCallback("E1N43",new PathFinder.CostMatrix());
        assert(third instanceof PathFinder.CostMatrix && third.get(25,25)===255,
            "ARK-116: bounded fallback excludes rooms beyond the immediate crossing");
        hopFallback.moveTo=()=>ERR_NO_PATH;
        Game.time++; used=1;
        assert(routing.moveToRoom(hopFallback,"E1N43",{blockHostiles:true})===ERR_NO_PATH &&
            hopFallback.memory._routeNoPathTicks===1 && !(hopFallback.memory._routeAvoid||[]).length,
            "ARK-116: the first failed fallback crossing preserves the existing no-path stall guard");
        Game.time++; used=1;
        routing.moveToRoom(hopFallback,"E1N43",{blockHostiles:true});
        assert(hopFallback.memory._routeNoPathTicks===0 &&
            !(hopFallback.memory._routeAvoid||[]).includes("E1N45"),
            "ARK-116: repeated fallback failure runs retreat recovery without blacklisting an owned origin");
        Game.time++; used=1;
        Game.map.findRoute=()=>[{room:"E1N43",exit:TOP}];
        const advanced=make();
        advanced.room={name:"E1N44"}; advanced.pos=new RoomPosition(25,48,"E1N44");
        advanced.moveTo=(target,options)=>{movement={target,options}; return OK;};
        assert(routing.moveToRoom(advanced,"E1N43",{blockHostiles:true})===OK &&
            movement.target.roomName==="E1N43" && movement.options.maxRooms===2 && movement.options.range===24,
            "ARK-116: after a crossing the fallback targets the following room rather than the old hop");
        Game.time++;used=1;Game.cpu.bucket=667;
        const normalLow=make(), searchesBeforeLow=searches;
        normalLow.moveTo=(target,options)=>{movement={target,options};return OK;};
        assert(routing.moveToRoom(normalLow,"E1N43",{blockHostiles:true,allowUnplannedHop:true})===OK &&
            searches===searchesBeforeLow && movement.options.maxRooms===2 && movement.options.range===24,
            "ARK-116: normal pioneer travel continues at bucket667 without a full-route search");
        Game.time++;used=1;Game.map.findRoute=()=>ERR_NO_PATH;
        const noSafeHop=make();let noSafeMoves=0;
        noSafeHop.moveTo=()=>{noSafeMoves++;return OK;};
        assert(routing.moveToRoom(noSafeHop,"E1N42",{blockHostiles:true,allowUnplannedHop:true})===ERR_NO_PATH &&
            noSafeMoves===0 && searches===searchesBeforeLow,
            "ARK-116: low bucket with no safe room route never starts a direct full-trip native search");
        Game.time++;used=27;const exhausted=make();let exhaustedMoves=0;
        exhausted.moveTo=()=>{exhaustedMoves++;return OK;};
        assert(routing.moveToRoom(exhausted,"E1N43",{allowUnplannedHop:true})===ERR_BUSY &&
            exhaustedMoves===0 && searches===searchesBeforeLow,
            "ARK-116: low-bucket hop permission still waits when tick CPU headroom is exhausted");
        Game.time++;used=1;Game.cpu.bucket=667;
        let graphCalls=0, tiredMoves=0;
        Game.map.findRoute=()=>{graphCalls++;return [{room:"E1N44",exit:TOP}];};
        const tired=make();tired.fatigue=32;
        tired.memory={_routeNoProgressTicks:3,_routeNoPathTicks:1};
        tired.moveTo=()=>{tiredMoves++;return ERR_TIRED;};
        const tiredState=JSON.stringify(tired.memory), beforeTired=searches;
        assert(routing.moveToRoom(tired,"E1N44",{allowUnplannedHop:true})===ERR_TIRED &&
            graphCalls===0 && tiredMoves===0 && searches===beforeTired &&
            JSON.stringify(tired.memory)===tiredState,
            "ARK-116: fatigued pioneer travel skips graph/native/full searches and preserves recovery state");
        Game.time++;tired.fatigue=0;
        Memory.rooms.E1N44.owner="new-budget-ban";
        assert(routing.moveToRoom(tired,"E1N44",{allowUnplannedHop:true})===ERR_NO_PATH &&
            tiredMoves===0 && searches===beforeTired,
            "ARK-116: transit restrictions learned during fatigue apply before movement resumes");
        delete Memory.rooms.E1N44.owner;
        Game.time++;tired.moveTo=()=>{tiredMoves++;return OK;};
        assert(routing.moveToRoom(tired,"E1N44",{allowUnplannedHop:true})===OK &&
            graphCalls===1 && tiredMoves===1 && searches===beforeTired,
            "ARK-116: pioneer resumes its bounded hop on the first fatigue-free tick");
        assert(measured.some((entry)=>entry.key==="routing.graphSearch"),
            "ARK-116: graph-route search has a separate CPU span from native movement");
        Game.time++;Memory.settings.routing.graphRouteCacheTicks=50;
        const graphOpts={allowUnplannedHop:true,blockHostiles:true};
        let cachedCalls=0;
        Game.map.findRoute=(from,to,o)=>{cachedCalls++;
            o.routeCallback("E9N49");
            const cost=o.routeCallback("E9N48");
            return cost===Infinity?ERR_NO_PATH:[{room:"E9N48",exit:TOP},{room:to,exit:TOP}];};
        const firstGraph=routing.findRoute("E9N49","E9N47",graphOpts);
        const remotes=require(path.join(project,"src/rooms/remotes"));
        const originalForeign=remotes.isForeignOwned;
        let policyReads=0;
        remotes.isForeignOwned=(...args)=>{policyReads++;return originalForeign(...args);};
        try {
            for(let i=0;i<20;i++){Game.time++;routing.findRoute("E9N49","E9N47",graphOpts);}
            assert(policyReads===0,
                "ARK-116: unchanged graph input snapshots avoid repeated room-policy evaluation: "+policyReads);
        } finally {remotes.isForeignOwned=originalForeign;}
        assert(cachedCalls===1 && firstGraph[0].room==="E9N48",
            "ARK-116: unchanged pioneer graph route is searched once across21 moving ticks");
        Memory.rooms.E9N48={enemies:1};
        assert(routing.findRoute("E9N49","E9N47",graphOpts)===null && cachedCalls===2,
            "ARK-116: new hostile intel invalidates graph cache before another hop");
        delete Memory.rooms.E9N48.enemies;Game.time++;
        routing.findRoute("E9N49","E9N47",graphOpts);
        assert(cachedCalls===3,"ARK-116: failed graph routes are not cached and reopening resumes travel");
        Game.time+=50;routing.findRoute("E9N49","E9N47",graphOpts);
        assert(cachedCalls===4,"ARK-116: graph cache expires after its configured lifetime");
        Game.time++;routing.findRoute("E9N48","E9N47",graphOpts);
        assert(cachedCalls===5,"ARK-116: crossing into another room changes the graph cache key");
        Game.time++;routing.findRoute("E9N49","E9N47",{...graphOpts,avoid:["E9N48"]});
        assert(cachedCalls===6,"ARK-116: an updated avoid list cannot reuse the old graph route");
        const dynamic={...graphOpts,allowRoom:()=>true};
        routing.findRoute("E9N49","E9N47",dynamic);Game.time++;
        routing.findRoute("E9N49","E9N47",dynamic);
        assert(cachedCalls===8,"ARK-116: dynamic allowRoom callbacks bypass the graph cache");
        const beforeDeadEnd=cachedCalls;
        Memory.rooms.E9N48.routeDeadEndUntil=Game.time+2;
        assert(routing.findRoute("E9N49","E9N47",graphOpts)===null && cachedCalls===beforeDeadEnd+1,
            "ARK-116: a newly confirmed dead end invalidates a cached graph route immediately");
        Game.time+=2;routing.findRoute("E9N49","E9N47",graphOpts);
        assert(cachedCalls===beforeDeadEnd+2,
            "ARK-116: an expired dead end can be searched again without clearing Memory manually");
        const beforePenalty=cachedCalls;
        Memory.settings.routing.nonHighwayPenalty=7;
        routing.findRoute("E9N49","E9N47",graphOpts);
        assert(cachedCalls===beforePenalty+1,
            "ARK-116: route penalty overrides invalidate graph reuse");
        const beforeGraphOwner=cachedCalls;
        Memory.rooms.E9N48.owner="graph-enemy";
        assert(routing.findRoute("E9N49","E9N47",graphOpts)===null && cachedCalls===beforeGraphOwner+1,
            "ARK-116: ownership mutation invalidates graph snapshots in the same tick");
        Memory.settings.allies=["graph-enemy"];
        assert(!!routing.findRoute("E9N49","E9N47",graphOpts),
            "ARK-116: ally configuration changes reopen graph selection immediately");
        Memory.settings.allies=[];
        assert(routing.findRoute("E9N49","E9N47",graphOpts)===null,
            "ARK-116: removing an ally invalidates a reused graph route in the same tick");
        delete Memory.rooms.E9N48.owner;
        Game.rooms.E9N48={controller:{owner:{username:"new-budget-ban"}}};
        assert(routing.findRoute("E9N49","E9N47",graphOpts)===null,
            "ARK-116: visible banned ownership invalidates a graph snapshot immediately");
        Game.rooms.E9N48.controller.owner.username="open-owner";
        assert(!!routing.findRoute("E9N49","E9N47",graphOpts),
            "ARK-116: a visible ownership change can reopen the graph in the same tick");
        delete Game.rooms.E9N48.controller.owner;
        Game.rooms.E9N48.controller.reservation={username:"new-budget-ban"};
        assert(routing.findRoute("E9N49","E9N47",graphOpts)===null,
            "ARK-116: visible banned reservation invalidates graph reuse immediately");
        delete Game.rooms.E9N48;
        assert(!!routing.findRoute("E9N49","E9N47",graphOpts),
            "ARK-116: losing visibility re-evaluates the stored room intel");
        Game.time++;complete=false;used=14;
        Game.cpu.limit=20;Game.cpu.tickLimit=500;Game.cpu.bucket=5000;
        const budgetTraveler=make();let budgetMoves=0;
        budgetTraveler.moveTo=()=>{budgetMoves++;return OK;};
        const beforeNormalBudget=searches;
        assert(routing.moveToRoom(budgetTraveler,"E1N44",{allowUnplannedHop:true})===OK &&
            searches===beforeNormalBudget && budgetMoves===1,
            "ARK-116: normal CPU budget defers full planning but keeps a bounded pioneer hop moving");
        Game.time++;used=5;
        routing.moveToRoom(make(),"E1N44",{allowUnplannedHop:true});
        assert(searches===beforeNormalBudget+1 && searchOptions.maxOps===10000,
            "ARK-116: available normal CPU budget permits bounded full planning");
        const secondTraveler=make();secondTraveler.moveTo=()=>{budgetMoves++;return OK;};
        assert(routing.moveToRoom(secondTraveler,"E1N44",{allowUnplannedHop:true})===OK &&
            searches===beforeNormalBudget+1 && budgetMoves===2,
            "ARK-116: a second traveler advances when the per-tick full-search slot is occupied");
        Game.time++;used=497;
        assert(routing.moveToRoom(make(),"E1N44",{allowUnplannedHop:true})===ERR_BUSY &&
            searches===beforeNormalBudget+1,
            "ARK-116: exhausted hard tick headroom still postpones movement safely");
        Game.time++;used=14;
        routing.moveToRoom(make(),"E1N44",opts);
        assert(searches===beforeNormalBudget+2,
            "ARK-116: callers without unplanned-hop permission preserve their original planning budget");
        // Model elapsed-time expiry in the engine, without a live server.
        Game.time++;used=1;Game.cpu.bucket=5000;
        Memory.settings.routing.crossRoomReusePathTicks=1500;
        let localSearches=0, incGraphs=0, incMove;
        const incremental={incrementalRoute:true,allowUnplannedHop:true,blockHostiles:true,reusePath:20};
        Game.map.findRoute=(from,to,o)=>{
            incGraphs++;
            for(let i=0;i<100;i++) o.routeCallback("E"+(20+i)+"N45");
            const rooms=from==="E1N45"?["E1N44","E1N43"]:["E1N43"];
            if(rooms.some(r=>!Number.isFinite(o.routeCallback(r)))) return ERR_NO_PATH;
            return rooms.map(room=>({room,exit:TOP}));
        };
        const inc=make();
        inc.memory._realRoute=["E1N44","E1N43"];inc.memory._realRouteDest="E1N43";
        inc.moveTo=(target,options)=>{
            incMove={target,options};
            const m=inc.memory._move;
            if(!m || m.room!==inc.room.name || m.dest.room!==target.roomName ||
                Game.time>m.time+options.reusePath){
                localSearches++;inc.memory._move={time:Game.time,room:inc.room.name,
                    dest:{room:target.roomName,x:target.x,y:target.y},path:"1"};
            }
            return OK;
        };
        const beforeIncremental=searches;
        routing.moveToRoom(inc,"E1N43",incremental);
        assert(searches===beforeIncremental && !inc.memory._realRoute &&
            incMove.target.roomName==="E1N44" && incMove.options.maxRooms===2,
            "ARK-116: incremental pioneer adopts only the next crossing without any full-trip validation");
        assert(incMove.options.reusePath===1500 && localSearches===1,
            "ARK-116: incremental path lifetime covers fatigue instead of expiring after20 elapsed ticks");
        const startIncremental=Game.time;
        inc.fatigue=32;
        for(let i=0;i<25;i++){Game.time++;routing.moveToRoom(inc,"E1N43",incremental);}
        inc.fatigue=0;inc.pos=new RoomPosition(25,24,"E1N45");
        routing.moveToRoom(inc,"E1N43",incremental);
        assert(Game.time===startIncremental+25 && localSearches===1 && searches===beforeIncremental,
            "ARK-116: a slow loaded pioneer resumes the existing path after25 fatigue ticks");
        Memory.rooms.E20N45={owner:"alternative-enemy"};
        routing.moveToRoom(inc,"E1N43",incremental);
        assert(incGraphs===1,"ARK-116: discarded graph alternatives do not revalidate an incremental itinerary");
        inc.room={name:"E1N44"};inc.pos=new RoomPosition(25,48,"E1N44");
        Game.time++;routing.moveToRoom(inc,"E1N43",incremental);
        assert(localSearches===2 && incMove.target.roomName==="E1N43" && searches===beforeIncremental,
            "ARK-116: entering the next room advances one hop and refreshes the local crossing path");
        Memory.rooms.E1N43={owner:"new-budget-ban"};
        const beforeBanMoves=localSearches;
        assert(routing.moveToRoom(inc,"E1N43",incremental)===ERR_NO_PATH &&
            !inc.memory._move && localSearches===beforeBanMoves,
            "ARK-116: a newly banned destination discards the long-lived path before movement");
        delete Memory.rooms.E1N43.owner;
        Game.time++;Game.cpu.bucket=100;inc.pos=new RoomPosition(25,25,"E1N44");
        assert(routing.moveToRoom(inc,"E1N43",incremental)===OK && searches===beforeIncremental,
            "ARK-116: incremental pioneer keeps moving at bucket100 without full planning");
        const beforeStall=localSearches;
        for(let i=0;i<5;i++){Game.time++;routing.moveToRoom(inc,"E1N43",incremental);}
        assert(localSearches>beforeStall,"ARK-116: no-progress recovery expires even a long-lived incremental path");
        inc.memory._routeStack=["E1N45","E1N44"];
        Game.time++;inc.moveTo=(target,options)=>{incMove={target,options};return ERR_NO_PATH;};
        routing.moveToRoom(inc,"E1N43",incremental);
        Game.time++;routing.moveToRoom(inc,"E1N43",incremental);
        assert(inc.memory._routeRetreatTo==="E1N45" &&
            inc.memory._routeAvoid.includes("E1N44") && incMove.target.roomName==="E1N45" &&
            incMove.options.maxRooms===2 && searches===beforeIncremental,
            "ARK-116: failed incremental crossing retreats along visited history without a full-trip search");
        delete Memory.rooms.E1N44.routeDeadEndUntil;
        const changed=make();let changedTarget;
        Game.map.findRoute=(from,to)=>[{room:to,exit:TOP}];
        changed.moveTo=(target)=>{changedTarget=target.roomName;return OK;};
        Game.time++;routing.moveToRoom(changed,"E1N44",incremental);
        Game.time++;routing.moveToRoom(changed,"E1N46",incremental);
        assert(changedTarget==="E1N46" && changed.memory._routeStackDest==="E1N46" &&
            searches===beforeIncremental,
            "ARK-116: changing the pioneer destination adopts the new crossing immediately");
        Game.time++;used=497;
        assert(routing.moveToRoom(make(),"E1N43",incremental)===ERR_BUSY,
            "ARK-116: incremental crossings preserve hard tick headroom");
        Game.time++;used=1;Game.map.findRoute=()=>ERR_NO_PATH;
        const disconnected=make();let unsafeMoves=0;
        disconnected.moveTo=()=>{unsafeMoves++;return OK;};
        assert(routing.travelToRoom(disconnected,"E1N42")===ERR_NO_PATH &&
            unsafeMoves===0 && searches===beforeIncremental,
            "ARK-116: shared incremental travel never falls back to an unrestricted full-trip search");
        const originalMoveToRoom=routing.moveToRoom;
        const delegated=[];
        try {
            routing.moveToRoom=(creep,destination,options)=>{delegated.push({destination,options});return OK;};
            const shared=make(), callerOptions={blockHostiles:true,reusePath:20};
            routing.travelToRoom(shared,"E1N43",callerOptions);
            assert(delegated[0].options.incrementalRoute===true &&
                delegated[0].options.blockHostiles===true && delegated[0].options.reusePath===1500 &&
                callerOptions.reusePath===20 && callerOptions.incrementalRoute===undefined,
                "ARK-116: shared travel centralizes incremental policy and preserves caller options");
            const allowRoom=()=>true;
            routing.travelToRoom(shared,"E1N43",{realRoute:true,blockHostiles:true,allowSourceKeepers:true});
            routing.travelToRoom(shared,"E1N43",{allowRoom});
            assert(delegated[1].options.incrementalRoute===false && delegated[1].options.realRoute===true &&
                delegated[1].options.allowSourceKeepers===true && delegated[1].options.reusePath===1500 &&
                delegated[2].options.allowRoom===allowRoom,
                "ARK-116: claim prevalidation and Keeper policy share path reuse; remotes keep dynamic permissions");
            shared.fatigue=22;const beforeCommonTired=delegated.length;
            assert(routing.travelToRoom(shared,"E1N43",{realRoute:true})===ERR_TIRED &&
                delegated.length===beforeCommonTired,
                "ARK-116: common travel skips all routing work during fatigue even for validated claim missions");
            shared.fatigue=0;Memory.settings.routing.crossRoomMode="validated";
            routing.travelToRoom(shared,"E1N43",{});
            assert(delegated[delegated.length-1].options.incrementalRoute===false,
                "ARK-116: shared cross-room mode is centrally configurable");
            delete Memory.settings.routing.crossRoomMode;
            const pioneer=require(path.join(project,"src/roles/pioneer"));
            const p=make();p.notifyWhenAttacked=()=>OK;p.store={getFreeCapacity:()=>0};
            p.memory={role:"pioneer",home:"E1N45",targetRoom:"E1N43"};
            pioneer.run(p);
            const outbound=delegated[delegated.length-1];
            p.room={name:"E1N44"};p.memory.returning=true;pioneer.run(p);
            const inbound=delegated[delegated.length-1];
            assert(outbound.destination==="E1N43" && inbound.destination==="E1N45" &&
                outbound.options.incrementalRoute===true && inbound.options.incrementalRoute===true,
                "ARK-116: pioneer outbound and refill return both use the common incremental travel API");
        } finally {routing.moveToRoom=originalMoveToRoom;}
    } finally {global.Game=saved.game;global.Memory=saved.memory;PathFinder.search=saved.search;meter.span=saved.span;}
};

