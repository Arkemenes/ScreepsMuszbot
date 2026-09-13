// Single source of tunable defaults, overridable per-path from the console
// without a redeploy: `Memory.settings.defender = { maxCount: 5 };`. Every
// literal migrated here keeps its pre-0012 value as the default, so behavior
// is unchanged until someone actually sets an override.
//
// get(path, fallback) walks Memory.settings by dot-path first, then this
// defaults tree, then `fallback` - never throws, a missing/malformed path at
// any level just falls through (constitution §3).

const defaults = {
    defender: {
        maxCount: 3,
        // room.energyCapacityAvailable at/above which a defenderStriker +
        // defenderMedic pair is spawned instead of the solo defender
        // (ROADMAP 0032 D2) - below this, the solo body is still the only
        // affordable option, so it stays the fallback rather than being
        // replaced outright.
        pairEnergyThreshold: 500,
        // defenderStriker: how far from the spawn a wounded target can be
        // and still get chased down to finish (range 1) instead of just
        // held at kite range (ROADMAP 0032 O1)
        mopUpRange: 10,
    },
    tower: {
        // repair only kicks in once the tower has this much energy or more
        repairEnergyRatio: 0.7,
        // rampart/wall repair tiers, as a FRACTION of the structure's own
        // hitsMax (ROADMAP 0032 D4 + follow-up, utils/rampartRepair.js -
        // the one place that reads these three) - hitsMax already scales
        // with RCL via the engine (RAMPART_HITS_MAX / WALL_HITS_MAX
        // tables), so a ratio keeps every tier meaningful at every RCL
        // instead of a fixed number becoming a rounding error at RCL8 or
        // overkill at RCL2. Below rampartHealthyRatio a structure is always
        // fair game (rampartCriticalRatio just picks the worst of those
        // first); at/above it, repair only continues while the room's
        // storage has real surplus (rampartStorageFillGate) - otherwise
        // that effort is better spent elsewhere (building, upgrading).
        rampartCriticalRatio: 0.001,
        rampartHealthyRatio: 0.01,
        rampartStorageFillGate: 0.5,
    },
    upgrader: {
        // rooms/needs.js + utils/autoscale.js: ABSOLUTE ceiling on the
        // room's upgrader count, base tier + autoscale delta combined
        // (ROADMAP 0040/0049) - without it, a room stuck eligible for a
        // very long time would keep adding +1 upgrader every cooldown
        // window forever. The feedback loop is normally self-limiting
        // (more upgraders drain the surplus that made the room eligible in
        // the first place), this is just a safety net. RCL8 has its own,
        // stricter clamp (max 1) applied separately in rooms/needs.js.
        autoscaleMaxCount: 8,
    },
    autoscale: {
        // utils/autoscale.js: minimum ticks between two automatic +1/-1
        // adjustments IN THE SAME ROOM, shared across every registered
        // role (ROADMAP 0040) - not per role. Deliberately coarse: this is
        // meant to react to a room's settled state (nothing left to build,
        // energy piling up), not to tick-to-tick noise.
        cooldown: 30000,
    },
    hauler: {
        // a source container needs more than this much energy before a
        // hauler bothers with the trip
        minContainerLoad: 1000,
        // headcount when there's no link network
        maxCountNoLinks: 5,
        // fraction of capacity a tower must be at/below to jump the delivery
        // queue
        deliverReserve: 0.5,
        deliverReserveUnderAttack: 0.8,
        // beyond deliverReserve, top a tower off further once it still has
        // more than this fraction of free capacity
        toppingOffThreshold: 0.05,
        // utils/autoscale.js (ROADMAP 0040/0049): ABSOLUTE ceiling on the
        // room's hauler count, base tier + autoscale delta combined (below
        // the base tier's own no-link ceiling of 5 - see
        // haulerBacklogEligible in rooms/needs.js, this can genuinely clamp
        // the base tier down, not just stop the autoscale adding more).
        autoscaleMaxCount: 3,
    },
    builder: {
        // utils/autoscale.js (ROADMAP 0040): pickableEnergy() thresholds
        // gating the incremental grow/shrink, set at the same boundaries
        // rooms/needs.js's own byEnergy tier already uses (>50000 -> its
        // top tier of 4; <1500 -> its bottom non-zero tier) - autoscale
        // only ever pushes past what that tier already decided, or backs
        // off before it would have dropped further anyway.
        autoscaleEnergyHigh: 50000,
        autoscaleEnergyLow: 1500,
        // ABSOLUTE ceiling on the room's builder count (ROADMAP 0049) -
        // below the base tier's own ceiling of 4 (byBacklog/byEnergy, see
        // rooms/needs.js), so this genuinely clamps the base tier down too,
        // not just the autoscale delta on top of it.
        autoscaleMaxCount: 2,
    },
    miner: {
        // fraction of capacity the miner keeps its adjacent source-defense
        // tower topped up to (unconditional priority - see roles/miner.js)
        towerReserve: 0.5,
        towerReserveUnderAttack: 0.9,
    },
    combat: {
        // tiles a non-combat creep wants to stay from any armed hostile
        safeRange: 5,
        // rooms/defense.js's checkSafeMode() (ROADMAP 0032 D6): with a
        // hostile in attack range of a spawn, activateSafeMode() fires once
        // the spawn's hp ratio drops at/below this (or zero defenders are
        // alive, checked separately) - conservative on purpose, a real raid
        // the normal defense handles shouldn't burn the limited charges.
        safeModeSpawnHpRatio: 0.5,
    },
    planner: {
        // planCity() won't spend a tick's CPU below this bucket
        minBucket: 500,
        maxSitesPerRoom: 8,
    },
    traffic: {
        roadThreshold: 50,
        decayInterval: 100,
        decayFactor: 0.99,
        roadRepairFloor: 0.4,
    },
    remotes: {
        maxDistance: 2,
        maxPerRoom: 2,
        reserveHealthyTicks: 3000,
    },
    routing: {
        // extra room-level route cost (utils/routing) added per hostile
        // room crossed - on top of blocking it outright for creeps that opt
        // in (the reserver)
        hostilePenalty: 10,
        // extra route cost for a non-highway room, so a route through the
        // x%10==0 / y%10==0 "highway" grid is preferred when available
        nonHighwayPenalty: 2,
        // scout: ticks to wait, parked in a room, for its layout preview
        // plan (planLayout()) to finish before giving up
        layoutWaitLimit: 500,
    },
    observer: {
        // exploration priority score = staleness * (1 + enemies *
        // militaryWeight) - higher means a room with hostiles gets
        // re-observed proportionally more often; 0 disables the bias
        // entirely (back to plain least-recently-seen)
        militaryWeight: 1,
    },
    claim: {
        // rough travel-time estimate for claimRoom()'s reachability check:
        // room-hops (rooms/remotes.roomDistance) * this. A creep with any
        // CLAIM part is capped at CREEP_CLAIM_LIFE_TIME (600) total, not
        // the usual 1500 - claimRoom() refuses a target it can't reach in
        // time instead of wasting the spawn on a claimer that dies en route.
        ticksPerRoomHop: 50,
        // safety buffer subtracted from CREEP_CLAIM_LIFE_TIME before
        // comparing against the travel estimate above
        travelMargin: 10,
    },
    raiding: {
        // a targetEnemy room's controller.level must be at/below this to
        // count as "weak enough to raid" (rooms/raiding.js, ROADMAP 0032 O4)
        maxTargetRcl: 3,
        // opt-in: findWeakTarget() only runs automatically (main.js) when
        // this is true. Off by default - having players in targetEnemies
        // doesn't mean "raid them whenever possible" until asked for.
        autoRaid: false,
    },
    squad: {
        // average hits/hitsMax across living squad members below which a
        // retreat is considered (utils/squad.js, ROADMAP 0032 Fase 4) -
        // still only happens if a safe exit actually exists, otherwise the
        // squad keeps fighting regardless of this ratio
        retreatHpRatio: 0.3,
        // consecutive ticks a squad can fail to advance (blocked in both
        // formations) before the blocking tile gets added to `avoid`
        stuckTicksLimit: 5,
        // how long a tile stays in `avoid` before being reconsidered - the
        // blocker might have only been passing through
        avoidTicks: 100,
    },
    scout: {
        // roles/scout.js (ROADMAP 0009): a sala-alvo de exploração que
        // responde ERR_NO_PATH entra em Memory.rooms[room].scoutBlacklistUntil
        // por este tanto de ticks - sem isso a reseleção reescolhe a mesma
        // sala nunca visitada (lastVisit undefined sempre vence o tie-break)
        // e o scout fica retentando um bolsão inalcançável para sempre.
        blacklistTicks: 5000,
    },
    pioneer: {
        // an owned, spawnless room (rooms/pioneering.js, ROADMAP 0037) only
        // gets rescued by an owned room WITH a spawn within this many
        // room-hops (remotes.roomDistance) - too far and the round trip
        // never pays for itself
        maxDistance: 30,
        // pioneers a single mother room keeps in flight per spawnless
        // target room at once - caps how much of one disaster can eat a
        // sister room's own spawn queue
        maxConcurrent: 2,
        // utils/autoscale.js (ROADMAP 0040/0049): ABSOLUTE ceiling on the
        // room's total pioneer count, base tier + autoscale delta combined
        // - lets a mother room push past maxConcurrent while it still has a
        // pending target AND spare energy, without growing forever
        autoscaleMaxCount: 6,
    },
    excuseMe: {
        // utils/excuseMe.js (ROADMAP 0044): how many single-file parked
        // allies deep travel() will ask to step aside at once - a corridor
        // jam, not a general search, so this stays small on purpose
        maxChain: 4,
    },
    renew: {
        // rooms/spawning.js (ROADMAP 0045): an idle spawn only considers
        // renewing an adjacent creep below this many ticksToLive left -
        // same order of magnitude as old_1's parity mechanic (300)
        ticksToLiveThreshold: 300,
        // ... and only if the creep's body is worth the spawn energy
        // (BODYPART_COST sum) - a cheap creep is cheaper to just replace
        minBodyCost: 1000,
        // ... and only while the room has energy to spare - a fraction of
        // energyCapacityAvailable, not just "any energy at all"
        minEnergyRatio: 0.8,
    },
    pixel: {
        // main.js (ROADMAP 0045): converts a full CPU bucket into a Pixel
        // resource every tick it stays full - off switch for a shard/season
        // where Pixel doesn't matter
        enabled: true,
        bucketThreshold: 10000,
    },
    mineralHauler: {
        // roles/mineralHauler.js (ROADMAP 0051): minimum reagent stock to
        // keep topped up in a lab reaction's input labs before another trip
        // is worth it - avoids a hauler shuttling tiny amounts back and
        // forth every tick once the lab is nearly full
        labBuffer: 500,
    },
    powerSpawn: {
        // structures/powerSpawn.js (ROADMAP 0051): off switch - processPower()
        // is otherwise unconditional whenever any Power sits in the store
        enabled: true,
    },
};

function walk(node, segments) {
    let cur = node;
    for (const seg of segments) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = cur[seg];
    }
    return cur;
}

function get(path, fallback) {
    const segments = path.split(".");
    const override = walk(Memory.settings, segments);
    if (override !== undefined) return override;
    const def = walk(defaults, segments);
    if (def !== undefined) return def;
    return fallback;
}

module.exports = { get, defaults };
