// ROADMAP 0147: allocation-free lab signatures keep the old semantics; probes only count.
module.exports = function (project, assert) {
    const path = require("path");
    const src = (n) => path.join(project, "src/utils", n);
    const fresh = (n) => { delete require.cache[require.resolve(src(n))]; return require(src(n)); };
    const saved = { game: global.Game, memory: global.Memory };
    try {
        global.Memory = { settings: {}, rooms: {} };
        let now = 5000;
        global.Game = Object.assign({}, saved.game, { time: now });
        const setTime = (t) => { global.Game = Object.assign({}, saved.game, { time: t }); };

        // --- reference: the pre-0147 activeLabs, verbatim apart from its own cache
        const refCache = new Map();
        function referenceActiveLabs(room, labs) {
            const controller = room.controller;
            const stable = controller && controller.my === true && Number.isFinite(controller.level) &&
                controller.pos && Number.isFinite(controller.pos.x) && Number.isFinite(controller.pos.y) &&
                labs.every((lab) => !lab || lab.pos && Number.isFinite(lab.pos.x) && Number.isFinite(lab.pos.y));
            const check = () => labs.map((lab) => !!lab && (!lab.isActive || lab.isActive()));
            if (!stable) return check();
            const signature = JSON.stringify([controller.id, controller.level, controller.pos.x, controller.pos.y,
                controller.owner && controller.owner.username,
                labs.map((lab) => lab && [lab.id, lab.pos.x, lab.pos.y, lab.my, lab.owner && lab.owner.username])]);
            const cached = refCache.get(room.name);
            if (cached && Game.time >= cached.tick && cached.signature === signature &&
                labs.every((lab, i) => (lab && lab.isActive) === cached.methods[i])) return cached.active;
            const active = check();
            refCache.delete(room.name);
            refCache.set(room.name, { tick: Game.time, signature, active, methods: labs.map((lab) => lab && lab.isActive) });
            return active;
        }

        const runtime = fresh("labPolicyRuntime");
        const make = (id, x, y, extra) => Object.assign({ id, pos: { x, y }, my: true, owner: { username: "me" },
            isActive: () => true }, extra);
        const base = () => ({
            controller: { id: "c1", my: true, level: 8, pos: { x: 10, y: 10 }, owner: { username: "me" } },
            labs: [make("l1", 20, 20), make("l2", 21, 20), make("l3", 22, 20)],
        });
        const mutations = [
            ["same", () => {}], ["same again", () => {}],
            ["lab replaced", (w) => { w.labs[1] = make("l9", 21, 20); }],
            ["lab moved", (w) => { w.labs[0].pos = { x: 20, y: 21 }; }],
            ["lab lost ownership", (w) => { w.labs[2].my = false; }],
            ["owner changed", (w) => { w.labs[2].owner = { username: "foe" }; }],
            ["owner removed", (w) => { delete w.labs[2].owner; }],
            ["controller level", (w) => { w.controller.level = 7; }],
            ["controller moved", (w) => { w.controller.pos = { x: 11, y: 10 }; }],
            ["lab missing", (w) => { w.labs[1] = null; }],
            ["lab added", (w) => { w.labs.push(make("l4", 23, 20)); }],
            ["isActive method swapped", (w) => { w.labs[0].isActive = () => false; }],
            ["no isActive method", (w) => { delete w.labs[3].isActive; }],
            ["controller not mine", (w) => { w.controller.my = false; }],
            ["time goes backwards", () => { now -= 10; }],
            ["same after rewind", () => {}],
        ];
        const world = base();
        let mismatches = [];
        mutations.forEach(([label, apply]) => {
            apply(world); now += 1; setTime(now);
            const room = { name: "LabRoom", controller: world.controller };
            const expected = referenceActiveLabs(room, world.labs);
            const actual = runtime.activeLabs(room, world.labs);
            if (JSON.stringify(expected) !== JSON.stringify(actual)) mismatches.push(label + ": " + JSON.stringify(expected) + " vs " + JSON.stringify(actual));
        });
        assert(mismatches.length === 0,
            "0147: allocation-free lab signature matches the reference (mismatches: " + mismatches.join(" | ") + ")");

        // the cache is really hit: an unchanged world does not call isActive again
        let invoked = 0;
        const labs = [make("a", 1, 1, { isActive: () => { invoked++; return true; } }), make("b", 2, 1), make("c", 3, 1)];
        const room = { name: "HitRoom", controller: world.controller };
        world.controller.my = true; setTime(now += 1);
        runtime.activeLabs(room, labs); runtime.activeLabs(room, labs); runtime.activeLabs(room, labs);
        assert(invoked === 1, "0147: an unchanged lab set is answered from the cache (isActive called once, got " + invoked + ")");

        // --- labSlots.resolve: warm cache answers like a cold one, for every lab set
        const sets = [
            [[1, 2, 3]], [[3, 1, 2]], [[1, 2, 4]], [[1, 2, 3, 4, 5, 6]], [[6, 5, 4, 3, 2, 1]], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]], [[1, 2]],
        ];
        const offsets = { 1: [2, 3], 2: [3, 2], 3: [1, 4], 4: [1, 1], 5: [2, 1], 6: [1, 2], 7: [3, 4], 8: [4, 3], 9: [4, 4], 10: [4, 1] };
        const labsFor = (slots) => slots.map((s) => ({ id: "lab" + s, pos: { x: 10 + offsets[s][1], y: 10 + offsets[s][0] } }));
        const warm = fresh("labSlots"), bad = [];
        sets.forEach(([slots]) => {
            const list = labsFor(slots), shuffled = list.slice().reverse();
            const cold = fresh("labSlots").resolve({ name: "Slots" }, list);
            const first = warm.resolve({ name: "Slots" }, list), second = warm.resolve({ name: "Slots" }, shuffled);
            if (JSON.stringify(first) !== JSON.stringify(cold) || second !== first) bad.push(slots.join(","));
        });
        assert(bad.length === 0, "0147: labSlots.resolve warm cache equals a cold resolve and ignores order (" + bad.join(" ") + ")");
        const replaced = labsFor([1, 2, 3]); replaced[2] = { id: "other", pos: replaced[2].pos };
        const one = warm.resolve({ name: "Slots2" }, labsFor([1, 2, 3])), two = warm.resolve({ name: "Slots2" }, replaced);
        assert(one !== two && two.ids[3] === "other", "0147: a replaced lab invalidates the slot cache");

        // --- probes only count
        const probe = fresh("probe");
        probe.hit("x", "k", probe.fold(probe.fold(0, "A"), 5));
        probe.hit("x", "k", probe.fold(probe.fold(0, "A"), 5));
        probe.hit("x", "k", probe.fold(probe.fold(0, "A"), 6));
        const snap = probe.snapshot().names.find((n) => n.name === "x");
        assert(snap.calls === 3 && snap.same === 1 && snap.rate === 33.3, "0147: probes never alter decisions, they only count repeats");
        const before = JSON.stringify(Memory);
        probe.hit("x", "k2", 1);
        assert(JSON.stringify(Memory) === before, "0147: probes keep nothing in Memory");

        // --- ROADMAP 0152: an idle hauler searches when it goes idle, then every 5 ticks
        {
            const hauler = require(path.join(project, "src/roles/hauler"));
            const mkRoom = (name, hungry) => ({ name, controller: undefined,
                find: () => hungry ? [{ structureType: STRUCTURE_SPAWN, store: { getFreeCapacity: () => 50 } }] : [] });
            const mkCreep = (room, carrying) => ({ name: "IdleH1", room, store: { getUsedCapacity: () => carrying || 0 } });
            let t = 90000;
            const at = (time) => { t = time; global.Game = Object.assign({}, saved.game, { time, creeps: { IdleH1: {} } }); };
            global.Memory = { settings: {}, rooms: {} };
            at(t);
            const calm = mkRoom("IdleRoom", false), creep = mkCreep(calm);
            assert(hauler.idleSkip(creep) === false, "0152: a hauler that never went idle always searches");
            hauler.markIdle(creep);
            const pattern = [];
            for (let i = 1; i <= 6; i++) { at(90000 + i); pattern.push(hauler.idleSkip(creep)); }
            assert(JSON.stringify(pattern) === JSON.stringify([true, true, true, true, false, false]),
                "0152: after going idle it skips 4 ticks and searches again on the 5th (" + JSON.stringify(pattern) + ")");
            at(90001); hauler.markIdle(creep);
            at(90002);
            assert(hauler.idleSkip(mkCreep(calm, 50)) === false, "0152: a hauler carrying anything keeps searching every tick");
            assert(hauler.idleSkip(mkCreep(mkRoom("OtherRoom", false))) === false, "0152: a change of room forgets the idle mark");
            assert(hauler.idleSkip(mkCreep(mkRoom("IdleRoom", true))) === false, "0152: a hungry spawn/extension keeps the per-tick search");
            {
                const tier = require(path.join(project, "src/utils/cpuTier"));
                const g = global.Game;
                global.Game = Object.assign({}, g, { cpu: Object.assign({}, g.cpu, { bucket: 500 }) });
                tier.reset();
                const skipsHungry = hauler.idleSkip(mkCreep(mkRoom("IdleRoom", true)));
                global.Game = g; tier.reset();
                assert(skipsHungry === true, "cpu: in the critical band an idle hauler keeps its recheck interval even with a hungry spawn");
            }
            at(90000);
            assert(hauler.idleSkip(creep) === false, "0152: a clock that goes backwards (reset) forgets the idle mark");
            at(90002);
            global.Memory = { settings: { hauler: { idleRecheckTicks: 1 } }, rooms: {} };
            assert(hauler.idleSkip(creep) === false, "0152: idleRecheckTicks = 1 restores the per-tick search");
            global.Memory = { settings: {}, rooms: {} };
            at(90003); // a new tick: the per-tick room cache must not carry the hungry stub of the same name
            assert(hauler.idleSkip(creep) === true, "0152: the default setting skips");
        }
    } finally {
        global.Game = saved.game;
        global.Memory = saved.memory;
    }
};
