module.exports = function (project, assert) {
    const path = require("path");
    const { nextStep } = require(path.join(project,"src/utils/nativePath"));
    const routing = require(path.join(project,"src/utils/routing"));
    const saved={game:Game,memory:Memory};
    const raw="243777777776666555566778777788888";
    const creep={name:"native-path-claim",room:{name:"E1N45"},pos:new RoomPosition(25,37,"E1N45"),
        memory:{_move:{path:raw,room:"E1N45"}},fatigue:0};
    assert(nextStep(creep).direction===LEFT && nextStep(creep).x===24 && nextStep(creep).y===37,
        "live claim path 2437 decodes first step coordinates instead of issuing direction 2");
    creep.pos=new RoomPosition(24,37,"E1N45");
    assert(nextStep(creep).x===23 && nextStep(creep).direction===LEFT,
        "native cached step advances from the current path position");
    creep.pos=new RoomPosition(26,36,"E1N45");
    assert(nextStep(creep)===null,"off-path position cannot issue a fabricated cached direction");
    creep.pos=new RoomPosition(25,37,"E1N45");
    creep.memory._move={path:"00017",room:"E1N45"};
    assert(nextStep(creep)===null,"unrelated serialized path is rejected");
    creep.memory._move={path:raw,room:"E2N45"};
    assert(nextStep(creep)===null,"cached path from another room is rejected");
    try {
        global.Game=Object.assign({},saved.game,{time:198000000,rooms:{},creeps:{},
            cpu:Object.assign({},saved.game.cpu,{bucket:10000}),
            map:Object.assign({},saved.game.map,{findRoute:()=>[{room:"E0N45",exit:LEFT}],
                getRoomTerrain:()=>({get:()=>0}),getRoomLinearDistance:()=>1})});
        global.Memory={rooms:{E1N45:{my:true},E0N45:{}},settings:{}};
        let moved, checked;
        creep.room.lookForAt=(type,x,y)=>{checked={x,y};return [];};
        creep.move=direction=>{moved=direction;return OK;};
        creep.moveTo=()=>{creep.memory._move={path:raw,room:"E1N45"};return OK;};
        creep.memory={_routeProgressKey:"E1N45:E5N41",_routeProgressPos:"25:37:E1N45",
            _routeNoProgressTicks:1};
        routing.moveToRoom(creep,"E5N41",{realRoute:false,blockHostiles:true});
        assert(moved===LEFT,"routing stall recovery follows the actual native direction instead of the coordinate prefix");
        assert(checked && checked.x===24 && checked.y===37,
            "cross-room clearance checks the true next tile instead of a northeast neighbor");
    } finally {global.Game=saved.game;global.Memory=saved.memory;}
};
