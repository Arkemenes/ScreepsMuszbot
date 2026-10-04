// Grid search for the static "fat" miner and the mineralMiner (ROADMAP 0114).
// node specs/features/0114-consolidated-miner/simulate-grid.js [energy|pareto|carry|mineral]
//
// Assumptions (all unverified in production - measure with cpuMeter):
//  - 0.2 CPU per successful intent (harvest / transfer / withdraw), per profile 2026-10-02
//  - 0.06 CPU/tick of role logic per creep, identical for every body (not compared)
//  - source = 3000 / 300 ticks (owned room); creep walks to its seat EMPTY, plain tiles
//  - overlap replacement: the old miner keeps mining while the new one walks, so the
//    source never idles; the new creep's walk only shortens ITS productive life

const SRC = 3000, REGEN = 300, LIFE = 1500, ACT = 0.2;
const MINC = Number(process.env.MINC || 0); // 1 = link/tower adjacent (miner needs a CARRY)
const DIST = { near: 10, mid: 25, far: 45 };

// transfers per source cycle with `C` carry parts. policy A = current batch
// (transfer once the next harvest no longer fits), B = only when the store is full
// (the spill drops into the container underneath).
function transfers(W, C, pol) {
    if (C === 0) return 0;
    const cap = 50 * C, rate = 2 * W;
    let st = 0, n = 0, left = SRC;
    while (left > 0) {
        const h = Math.min(rate, left);
        left -= h;
        st = Math.min(cap, st + h);
        if (pol === "A" ? cap - st < rate : st >= cap) { n++; st = 0; }
    }
    return n;
}

function energyBody(W, M, C, D, pol) {
    const parts = W + M + C;
    const cost = 100 * W + 50 * M + 50 * C;
    const travel = D * Math.max(1, Math.ceil(W / M));
    const live = LIFE - travel;
    const rate = Math.min(10, 2 * W); // energy/tick while the source is being worked
    const harvests = Math.ceil(SRC / (2 * W));
    const calls = harvests + transfers(W, C, pol);
    return {
        W, M, C, parts, cost, travel, live,
        collected: rate * live,                       // energy per TTL
        cpuTick: (ACT * calls) / REGEN,               // CPU/tick (intents only)
        cpuTTL: (ACT * calls * live) / REGEN,
        energyTick: cost / live,                      // spawn energy per productive tick
        calls,
    };
}

function* allEnergy(D, pol, maxCost) {
    for (let W = 2; W <= 40; W++)
        for (let C = MINC; C <= 6; C++)
            for (let M = 1; M <= Math.max(1, Math.ceil(W / 2)); M++) {
                if (W + M + C > 50) continue;
                const b = energyBody(W, M, C, D, pol);
                if (b.cost > maxCost || b.travel > 150) continue;
                yield b;
            }
}

// lower-left convex hull of (energyTick, cpuTick): the efficient frontier.
function hull(points) {
    const pts = points.slice().sort((a, b) => a.energyTick - b.energyTick || a.cpuTick - b.cpuTick);
    const front = [];
    for (const p of pts) if (!front.length || p.cpuTick < front[front.length - 1].cpuTick - 1e-9) front.push(p);
    const h = [];
    for (const p of front) {
        while (h.length >= 2) {
            const a = h[h.length - 2], b = h[h.length - 1];
            const cross = (b.energyTick - a.energyTick) * (p.cpuTick - a.cpuTick) -
                (b.cpuTick - a.cpuTick) * (p.energyTick - a.energyTick);
            if (cross <= 0) h.pop(); else break;
        }
        h.push(p);
    }
    return h;
}

const fmt = (b) => `W${b.W}/M${b.M}/C${b.C}`.padEnd(11);
const base = (D, pol) => energyBody(5, 1, 1, D, pol);
const mode = process.argv[2] || "all";

if (mode === "all" || mode === "carry") {
    console.log("\n##### Value of extra CARRY (per source, W fixed, M = round(W/5)) #####");
    console.log("price = extra energy/tick per CPU/tick saved vs C=1 (lower = better deal)");
    for (const pol of ["A", "B"]) {
        console.log("\npolicy " + pol + ", D=mid");
        for (const W of [8, 12, 15, 20, 25]) {
            const M = Math.max(1, Math.round(W / 5));
            const c1 = energyBody(W, M, 1, DIST.mid, pol);
            let line = `W${W} M${M}: C1 calls=${c1.calls} |`;
            for (let C = 2; C <= 6; C++) {
                const b = energyBody(W, M, C, DIST.mid, pol);
                const dCpu = c1.cpuTick - b.cpuTick;
                const dE = b.energyTick - c1.energyTick;
                line += ` C${C}: calls=${b.calls} dCPU=${dCpu.toFixed(3)} dE=${dE.toFixed(2)} price=${dCpu > 0 ? (dE / dCpu).toFixed(0) : "inf"} |`;
            }
            console.log(line);
        }
    }
}

if (mode === "all" || mode === "pareto") {
    for (const pol of ["A", "B"]) {
        for (const [dn, D] of Object.entries(DIST)) {
            const b0 = base(D, pol);
            console.log(`\n##### Pareto frontier, policy ${pol}, D=${dn}(${D}); per source; baseline 5/1/1 cpu=${b0.cpuTick.toFixed(3)} E=${b0.energyTick.toFixed(2)} #####`);
            console.log("body        cost parts travel calls  cpu/t  E/t   price(E per CPU saved vs prev)");
            const h = hull([...allEnergy(D, pol, 99999)].filter((b) => b.W >= 5));
            let prev = null;
            for (const b of h) {
                const price = prev ? ((b.energyTick - prev.energyTick) / (prev.cpuTick - b.cpuTick)).toFixed(0) : "-";
                console.log(`${fmt(b)} ${String(b.cost).padStart(5)} ${String(b.parts).padStart(5)} ${String(b.travel).padStart(6)} ${String(b.calls).padStart(5)} ${b.cpuTick.toFixed(3)} ${b.energyTick.toFixed(2)}  ${price}`);
                prev = b;
            }
        }
    }
}

if (mode === "all" || mode === "energy") {
    console.log("\n##### Best per capacity at several prices (E per CPU), policy B, C in 0..6 #####");
    const caps = [800, 1300, 1800, 2300, 3000, 5600];
    for (const [dn, D] of Object.entries(DIST)) {
        const b0 = base(D, "B");
        console.log(`\nD=${dn}(${D})  (2 sources, vs 5/1/1)`);
        for (const price of [10, 20, 40]) {
            let line = `price=${String(price).padStart(2)}:`;
            for (const cap of caps) {
                let top = null;
                for (const b of allEnergy(D, "B", cap)) {
                    if (b.W < 5 && cap >= 800) continue;
                    b.u = -price * b.cpuTick - b.energyTick;
                    if (!top || b.u > top.u) top = b;
                }
                line += top
                    ? ` | ${cap}: ${fmt(top)}$${top.cost} dCPU${(2 * (b0.cpuTick - top.cpuTick)).toFixed(2)} dE${(2 * (top.energyTick - b0.energyTick)).toFixed(2)}`
                    : ` | ${cap}: -`;
            }
            console.log(line);
        }
    }
}

// ---------------------------------------------------------------- mineral
if (mode === "all" || mode === "mineral") {
    const MINERAL_REGEN = 50000, COOL = 5;
    const dens = { LOW: 15000, MODERATE: 35000, HIGH: 70000, ULTRA: 100000 };

    function mineralBody(W, M, D) {
        const travel = D * Math.max(1, Math.ceil(W / M));
        const live = LIFE - travel;
        const cost = 100 * W + 50 * M;
        const unitsTTL = (live * W) / COOL;
        const calls = live / COOL;
        return { W, M, cost, travel, live, unitsTTL, eUnit: cost / unitsTTL, cpuUnit: (ACT * calls) / unitsTTL };
    }

    console.log("\n##### mineralMiner: cost per unit does not depend on W (units/TTL = live*W/5) #####");
    for (const [dn, D] of Object.entries(DIST)) {
        let line = `D=${dn}:`;
        for (const W of [2, 4, 8, 12, 16, 20, 30]) {
            const M = Math.max(1, Math.round(W / 5));
            const b = mineralBody(W, M, D);
            line += ` W${W}/M${M} $${b.cost} units/TTL=${Math.round(b.unitsTTL)} E/unit=${b.eUnit.toFixed(2)} CPU/unit=${b.cpuUnit.toFixed(3)} |`;
        }
        console.log(line);
    }

    console.log("\n##### mineral deposit cycle by density and W (D=mid, M=round(W/5)) #####");
    console.log("Tm = ticks to mine it out; rate = long-run units/tick incl. 50000 regen; TTLs = creeps needed per deposit");
    for (const [name, amt] of Object.entries(dens)) {
        let line = `${name.padEnd(8)} ${amt}:`;
        for (const W of [4, 8, 12, 20, 30]) {
            const M = Math.max(1, Math.round(W / 5));
            const b = mineralBody(W, M, DIST.mid);
            const Tm = amt / (W / COOL);
            const rate = amt / (Tm + MINERAL_REGEN);
            const creeps = Math.ceil(amt / b.unitsTTL);
            const spend = creeps * b.cost;
            line += ` W${W}: Tm=${Math.round(Tm)} rate=${rate.toFixed(2)} creeps=${creeps} spend=${spend} E/unit=${(spend / amt).toFixed(2)} |`;
        }
        console.log(line);
    }

    console.log("\n##### body sized to deplete in ONE life: W = ceil(5*amount / live), capped #####");
    for (const [dn, D] of Object.entries(DIST)) {
        let line = `D=${dn}:`;
        for (const amt of [500, 1000, 2000, 5000, 10000, 15000, 35000, 70000, 100000]) {
            const live = LIFE - D * 2;
            const W = Math.ceil((COOL * amt) / live);
            line += ` ${amt}->W${W > 25 ? ">25(" + W + ")" : W}`;
        }
        console.log(line);
    }

    console.log("\n##### waste when a creep is spawned for a small remaining amount (W=8, D=mid) #####");
    const b8 = mineralBody(8, 2, DIST.mid);
    for (const amt of [200, 500, 1000, 2000, 3000, 5000]) {
        const mined = Math.min(amt, b8.unitsTTL);
        const busy = mined / (8 / COOL);
        console.log(`amount=${amt}: mined=${mined} busy=${Math.round(busy)}/${b8.live} ticks (${Math.round((100 * busy) / b8.live)}%)  E/unit=${(b8.cost / mined).toFixed(2)}`);
    }
}
