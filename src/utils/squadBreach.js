// Weighted single-room breach routes. Costs stay numeric: a CostMatrix's
// 254 cap would make a 1M-hit wall indistinguishable from a 100M-hit wall.
const combat = require("./combat");
const config = require("./config");
const roomCache = require("./roomCache");
const { isAlly, allies } = require("./hostiles");
const plans = new WeakMap();
const terrains = new Map();

function damage(members) {
    let dps = 0;
    let range = 3;
    for (const c of members) {
        for (const p of c.body || []) {
            if (p.hits === 0) continue;
            let base = 0, action;
            if (p.type === RANGED_ATTACK && c.memory.role === "defenderStriker") {
                base = RANGED_ATTACK_POWER;
                action = "rangedAttack";
            } else if (p.type === WORK && c.memory.role === "squadDismantler") {
                base = typeof DISMANTLE_POWER === "number" ? DISMANTLE_POWER : 50;
                action = "dismantle";
                range = 1;
            }
            const boosts = typeof BOOSTS === "object" && BOOSTS[p.type] && BOOSTS[p.type][p.boost];
            dps += base * (boosts && boosts[action] || 1);
        }
    }
    return { dps, range };
}

// Dijkstra on at most the 48x48 interior tiles. Each heap entry is immutable;
// stale entries are skipped, and every expanded tile counts toward the budget.
function search(costs, start, goal, range, budget) {
    const dist = new Float64Array(2500).fill(Infinity);
    const prev = new Int16Array(2500).fill(-1);
    const heap = [];
    function push(node, cost) {
        let i = heap.length;
        heap.push([node, cost]);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (heap[parent][1] <= cost) break;
            heap[i] = heap[parent];
            i = parent;
        }
        heap[i] = [node, cost];
    }
    function pop() {
        const first = heap[0], last = heap.pop();
        if (heap.length) {
            let i = 0;
            while (i * 2 + 1 < heap.length) {
                let child = i * 2 + 1;
                if (child + 1 < heap.length && heap[child + 1][1] < heap[child][1]) child++;
                if (last[1] <= heap[child][1]) break;
                heap[i] = heap[child];
                i = child;
            }
            heap[i] = last;
        }
        return first;
    }
    const startId = start.y * 50 + start.x;
    dist[startId] = 0;
    push(startId, 0);
    let expanded = 0;
    while (heap.length && expanded < budget) {
        const [id, cost] = pop();
        if (cost !== dist[id]) continue;
        expanded++;
        const x = id % 50, y = (id / 50) | 0;
        if (Math.max(Math.abs(x - goal.x), Math.abs(y - goal.y)) <= range) {
            const path = [];
            for (let n = id, guard = 0; n !== startId && guard < 2500; n = prev[n], guard++) {
                if (n < 0) return null;
                path.push({ x: n % 50, y: (n / 50) | 0 });
            }
            path.reverse();
            return { path, cost, expanded };
        }
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || x + dx < 1 || x + dx > 48 || y + dy < 1 || y + dy > 48) continue;
            const next = (y + dy) * 50 + x + dx;
            const candidate = cost + costs[next];
            if (candidate < dist[next]) {
                dist[next] = candidate;
                prev[next] = id;
                push(next, candidate);
            }
        }
    }
    return null; // neither an unreachable goal nor a partial search is a plan
}

function breakable(s) {
    return !s.my && !(s.owner && isAlly(s.owner.username)) && Number.isFinite(s.hits) && s.hits > 0 &&
        (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
}

function grid(room, structures, dps) {
    let terrain = terrains.get(room.name);
    if (!terrain) {
        const native = room.getTerrain();
        terrain = new Uint8Array(2500);
        for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) terrain[y * 50 + x] = native.get(x, y);
        terrains.set(room.name, terrain);
    }
    const costs = new Float64Array(2500);
    const barriers = new Map();
    for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
        const id = y * 50 + x;
        costs[id] = x === 0 || x === 49 || y === 0 || y === 49 || (terrain[id] & TERRAIN_MASK_WALL)
            ? Infinity : terrain[id] & TERRAIN_MASK_SWAMP
                ? config.get("squad.breachSwampTicks", 5) : config.get("squad.breachPlainTicks", 1);
    }
    for (const s of structures) {
        const id = s.pos.y * 50 + s.pos.x;
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_CONTAINER ||
            s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue;
        if (breakable(s)) {
            const list = barriers.get(id) || [];
            list.push(s);
            barriers.set(id, list);
            costs[id] += s.hits / dps;
        } else costs[id] = Infinity;
    }
    for (const object of roomCache.sources(room).concat(roomCache.minerals(room), room.controller || [])) {
        if (object.pos) costs[object.pos.y * 50 + object.pos.x] = Infinity;
    }
    return { costs, barriers };
}

function get(squad) {
    const leader = Game.getObjectById(squad.leader);
    if (!leader || squad.state === "retreating" || leader.room.name !== squad.target.room) return null;
    const cached = plans.get(squad);
    const policy = allies().join("|");
    const roster = squad.members.join("|");
    const resolved = (plan, objective) => ({ ...plan,
        objective: objective || Game.getObjectById(plan.objective.id),
        target: plan.target && Game.getObjectById(plan.target.id) });
    if (cached && cached.checkedTick === Game.time && cached.policy === policy && cached.roster === roster &&
        cached.leader === squad.leader && cached.requestId === squad.target.id) return resolved(cached.plan);
    const room = leader.room;
    const objective = squad.target.id && Game.getObjectById(squad.target.id) || combat.structureTarget(room, leader.pos);
    if (!objective) return null;
    const members = squad.members.map((id) => Game.getObjectById(id)).filter((c) => c && c.room.name === room.name);
    const power = damage(members);
    const structures = roomCache.structures(room);
    const key = objective.id + ":" + room.name + ":" + power.dps + ":" + power.range + ":" + policy + ":" +
        structures.map((s) => [s.id, s.pos.x, s.pos.y, s.structureType, s.my, s.isPublic, s.owner && s.owner.username].join(",")).join("|");
    if (cached && cached.key === key && Game.time - cached.tick < config.get("squad.breachReplanTicks", 25)) {
        cached.checkedTick = Game.time;
        cached.policy = policy;
        cached.roster = roster;
        cached.leader = squad.leader;
        cached.requestId = squad.target.id;
        return resolved(cached.plan, objective);
    }
    const protectedObjective = objective.my || objective.owner && isAlly(objective.owner.username);
    let plan = { objective, target: null, approach: leader.pos, reason: protectedObjective ? "protectedObjective" : "noDamage" };
    if (power.dps > 0 && !protectedObjective) {
        const { costs, barriers } = grid(room, structures, power.dps);
        const route = search(costs, leader.pos, objective.pos, power.range, config.get("squad.breachMaxTiles", 2304));
        plan = { objective, target: null, approach: leader.pos, reason: "noRoute" };
        if (route) {
            const blockingIndex = route.path.findIndex((p) => barriers.has(p.y * 50 + p.x));
            const first = blockingIndex >= 0 ? barriers.get(route.path[blockingIndex].y * 50 + route.path[blockingIndex].x)[0] : null;
            const cover = structures.find((s) => s.structureType === STRUCTURE_RAMPART && !s.my &&
                s.pos.x === objective.pos.x && s.pos.y === objective.pos.y);
            const target = first || cover || objective;
            if (!cover || breakable(cover)) {
                const prefix = blockingIndex >= 0 ? route.path.slice(0, blockingIndex) : route.path;
                const approach = [leader.pos].concat(prefix).find((p) =>
                    Math.max(Math.abs(p.x - target.pos.x), Math.abs(p.y - target.pos.y)) <= power.range);
                if (approach) plan = { objective, target, approach: new RoomPosition(approach.x, approach.y, room.name),
                    path: route.path, cost: route.cost + (cover ? cover.hits / power.dps : 0),
                    dps: power.dps, range: power.range, reason: null };
            }
        }
    }
    plans.set(squad, { key, tick: Game.time, checkedTick: Game.time, policy, roster,
        leader: squad.leader, requestId: squad.target.id, plan });
    return plan;
}

module.exports = { get, search, damage };
