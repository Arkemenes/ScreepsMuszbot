// Single source of tunable defaults, overridable per-path from the console
// without a redeploy: `Memory.settings.defender = { maxCount: 5 };`. Every
// literal migrated here keeps its pre-0012 value as the default, so behavior
// is unchanged until someone actually sets an override.
//
// get(path, fallback) walks Memory.settings by dot-path first, then this
// defaults tree, then `fallback` - never throws, a missing/malformed path at
// any level just falls through (constitution §3).

const defaults = {
    market: {
        currentInterval: 100,
        snapshotInterval: 3600,
        snapshotWindowTicks: 604800,
        snapshotWeightCap: 0.01,
    },
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
        // ROADMAP 0072 (user-specified, unified tower/builder repair
        // tiering): how much of the TOWER'S OWN energy is required before
        // it'll spend on a repair target of a given tier - stricter for a
        // less urgent tier, since a tower reacts every tick with no
        // population cost to self-limit it (unlike roles/builder.js, always
        // unconditional for critical/satisfactory - ROADMAP 0069).
        //   critical target:            energyRatio >= repairEnergyRatio
        //   satisfactory OR optimal:    energyRatio >= satisfactoryRepairEnergyRatio
        //     (optimal also needs utils/resourceTiers.isStorageAbundant -
        //     see rampartCriticalRatio/rampartSatisfactoryRatio below)
        // repairEnergyRatio deliberately equals criticalRatio below
        // (ROADMAP 0067) - a gap above it left the tower holding energy
        // hauler.js had already stopped urgently delivering (no longer
        // "critical") that it still couldn't spend (below the old, higher
        // gate).
        repairEnergyRatio: 0.5,
        satisfactoryRepairEnergyRatio: 0.7,
        // rampart/wall repair tiers, as a FRACTION of the structure's own
        // hitsMax (ROADMAP 0032 D4 + follow-up, utils/rampartRepair.js).
        // RAMPART_HITS_MAX (300k) and WALL_HITS_MAX (300M) are fixed engine
        // constants - not RCL-scaled - but differ from each other by
        // 1000x, so a ratio of each structure's own ceiling stays
        // meaningful for both instead of picking one absolute number
        // that's trivial for a wall or unreachable for a rampart.
        // roles/builder.js and structures/tower.js share these two numbers
        // (utils/rampartRepair.js is the single source of truth), but NOT
        // the repair.normal* pair below - a normal structure's hitsMax is
        // small enough that a tenth-of-a-percent bar would basically never
        // fire, so it needs its own, much coarser pair (ROADMAP 0072).
        rampartCriticalRatio: 0.001,
        rampartSatisfactoryRatio: 0.01,
        // ROADMAP 0054, revised same-day by ROADMAP 0072 ("vamos matar essa
        // zona morta do hauler"): the tower's delivery threshold -
        // hauler.js's essentialConsumer pulls a critical tower (below this
        // ratio) from storage unconditionally, same urgency as spawn/ext.
        // Every OTHER tower (at/above this ratio) is a plain optional
        // consumer, same tier as a lab/controller-container
        // (resourceTiers.aboveReserve-gated) - there used to be a THIRD,
        // higher "satisfactory" bar in between, and a tower sitting between
        // the two matched neither: not essential, not yet "ideal", left
        // alone with no active delivery path except pickDeliver's very last
        // resort (only fires once literally nothing else in the room wants
        // the energy) - a real, admitted dead zone. Removed entirely:
        // critical vs optional is the same two-way split every other
        // consumer in this cascade already uses, and a tower never needed a
        // third state of its own. Shifts up under defenseActive - a tower
        // nearly full going into a fight is worth more than the same energy
        // idle in storage.
        criticalRatio: 0.5,
        criticalRatioUnderAttack: 0.8,
    },
    // ROADMAP 0072: repair-tier ratios for every structure that ISN'T a
    // rampart/wall (see tower.rampartCriticalRatio/rampartSatisfactoryRatio
    // above for those) - a container/spawn/extension/road's hitsMax is
    // small enough that the rampart/wall pair (0.1%/1%) would essentially
    // never fire, so this pair is deliberately much coarser. Shared by
    // structures/tower.js and roles/builder.js (utils/rampartRepair.js).
    repair: {
        normalCriticalRatio: 0.1,
        normalSatisfactoryRatio: 0.5,
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
    logistics: {
        // ROADMAP 0054: utils/resourceTiers.js's single reserve floor - a
        // fraction of the room's storage capacity kept off-limits to every
        // OPTIONAL energy spend (lab/factory/power spawn/controller
        // container, and - roles/builder.js only since ROADMAP 0072 split
        // the two workers apart - a rampart/wall past its satisfactory
        // tier). Replaces two independently-tuned pisos that used to
        // answer the same question differently (tower's old 50%
        // rampartStorageFillGate, hauler's old 5% storageReserveFloor).
        // Essential spends (spawn/extension, a critical tower) ignore this
        // entirely, same as before. structures/tower.js uses the much
        // higher storageSatisfactoryRatio bar below instead (via
        // utils/resourceTiers.isStorageAbundant) for the equivalent
        // optimal-tier rampart/wall spend - a tower has no population cost
        // to self-limit it the way a builder does, so it needs real
        // abundance, not just "not literally empty".
        reserveRatio: 0.01,
        // utils/resourceTiers.js's controllerCritical(room) - true once the
        // controller's ticksToDowngrade falls below this fraction of
        // CONTROLLER_DOWNGRADE[rcl]; risk of losing RCL always wins.
        // structures/link.js's collector: the controller link outranks the
        // storage link, even an empty one. roles/upgrader.js: the one
        // override that lets the upgrader spend room-wide storage/container
        // energy even while the room itself isn't stable yet (ROADMAP 0054
        // follow-up, real bug - see upgrader.js's own comment).
        controllerCriticalDowngradeRatio: 0.1,
        // structures/link.js's collector: once the storage is at/above this
        // fill ratio AND the controller isn't RCL8 yet (still has real RCL
        // to gain), the controller link wins by default over a storage
        // that's already comfortable. Reused by
        // utils/resourceTiers.isStorageAbundant (ROADMAP 0072) - the same
        // "storage is genuinely comfortable" bar, rather than inventing a
        // second, differently-tuned number that answers the same question.
        storageSatisfactoryRatio: 0.5,
        // Defensive repair gates (ROADMAP 0101): walls/ramparts in the
        // satisfactory tier need more than this storage fill, while their
        // unbounded optimal-tier hardening needs at least the stronger bar.
        // These are intentionally separate from storageSatisfactoryRatio,
        // which also drives controller-link/economy classification.
        rampartHealthyStorageRatio: 0.1,
        rampartHardeningStorageRatio: 0.7,
        // roles/hauler.js's terminalWithdrawable(): never let the
        // ledger-credited withdrawable slice drain the terminal below this
        // fraction of its own capacity - a floor on TOP of the ledger's own
        // "what's withdrawable in theory" bookkeeping (ROADMAP 0043), not a
        // replacement for it.
        terminalReserveRatio: 0.1,
        // ROADMAP 0097: normal rebalancing and its hard per-transfer cap.
        balanceEnabled: true,
        balanceInterval: 1000,
        balanceGapRatio: 0.2,
        balanceMaxAmount: 50000,
    },
    terminalOps: {
        // ROADMAP 0098: the terminal is transit, so a public SELL order only
        // keeps a small, replenishable committed buffer there.
        enabled: true,
        recoveryTicks: 10000,
        marketPriceStep: 0.001,
        repriceInterval: 1000,
        saleBufferAmount: 10000,
        saleBufferCapacityRatio: 0.1,
        statsWindowTicks: 60,
        operationRetentionTicks: 10000,
    },
    hauler: {
        // a source container needs more than this much energy before a
        // hauler bothers with the trip
        minContainerLoad: 1000,
        // headcount when there's no link network
        maxCountNoLinks: 5,
        // ROADMAP 0054: for any non-critical tower (see tower.criticalRatio
        // above), top it off further only while it still has more than this
        // fraction of free capacity - the practical cutoff for "already
        // close enough to full, not worth another trip".
        toppingOffThreshold: 0.05,
        // utils/autoscale.js (ROADMAP 0040/0049): ABSOLUTE ceiling on the
        // room's hauler count, base tier + autoscale delta combined (below
        // the base tier's own no-link ceiling of 5 - see
        // haulerBacklogEligible in rooms/needs.js, this can genuinely clamp
        // the base tier down, not just stop the autoscale adding more).
        autoscaleMaxCount: 3,
        // rooms/needs.js: floor on the base hauler tier once an active
        // mineral operation (extractor + container, deposit not depleted)
        // shares the room with a storage to deliver into - the mineral
        // errand (roles/hauler.js's pickMineralJob) competes with the
        // room's own energy loop for the same creep, so a solo hauler in a
        // link room (normally just 1, the link network's last mile) starves
        // one job or the other. Drops back to the room's normal count on
        // its own once the deposit runs dry - see mineralOperationActive.
        minCountWithMineral: 2,
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
        // rooms/defense.js's checkSafeMode() (ROADMAP 0032 D6, revised -
        // see "Bug real" in specs/features/0036-.../spec.md): projected
        // ticks until the most-endangered spawn's effective hp (its own
        // rampart's hits, if any, else its own hits) reaches zero at the
        // current incoming dps. Below this, activateSafeMode() fires -
        // conservative on purpose, a weak poke the normal defense handles
        // shouldn't burn the limited charges (a lone unboosted attacker
        // against a full-hp spawn projects to 100+ ticks; a real lethal
        // rush projects well under this even at full hp).
        safeModeTicksToKillThreshold: 20,
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
        // reserver (reserve/claim/contest): ticks parked in the same spot
        // before logging a stall warning - e.g. blockHostiles finds no safe
        // route around a genuinely hostile chokepoint room, so the creep
        // correctly waits at its own room's border instead of crossing, but
        // silently forever isn't acceptable (constitution stall-guard rule)
        claimStallTicks: 50,
        // scout: ticks spent still travelling toward a signRoom()/
        // planLayout() destination (never arrived yet) before giving up on
        // that one-off request entirely - e.g. the destination turned out
        // to be an unreachable adjacent room (utils/routing.js's moveToRoom
        // now refuses it outright once blacklisted) and neither task checks
        // moveToRoom's return value, so without this it would camp on the
        // request forever with zero feedback. Same order of magnitude as
        // layoutWaitLimit (that one guards the SEPARATE post-arrival
        // waiting-for-plan phase, not getting there in the first place).
        travelStallLimit: 500,
        // ROADMAP 0061: consecutive ticks a travelling creep can hold the
        // exact same position (any tile, not just a room border) before
        // isStuck() calls it genuinely stuck rather than just fatigued/
        // momentarily blocked by traffic. Same order of magnitude as the
        // old border-only threshold (3) this replaces. Only used by
        // roles/scout.js's own free-roam exploration now - moveToRoom()'s
        // cross-room retreat trigger moved to noPathTicks below (ROADMAP
        // 0063), which reads native moveTo()'s own ERR_NO_PATH instead of
        // guessing "stuck" from a frozen position (traffic on the very
        // next tile freezes a creep just as well as a sealed room does,
        // but only the sealed room actually returns ERR_NO_PATH).
        stuckTicks: 4,
        // ROADMAP 0063: consecutive ticks moveToRoom()'s own moveTo() call
        // returns ERR_NO_PATH (never merely "hasn't moved") before
        // retreatFrom() backs the creep out to the previous room in its
        // own visited history and excludes this one. Small on purpose -
        // ERR_NO_PATH is the engine's own authoritative "no route exists
        // under these constraints", not a guess, so it doesn't need the
        // same margin as position-based stall detection.
        noPathTicks: 2,
        // Consecutive no-progress ticks with no fatigue before invalidating
        // the native move cache and forcing a fresh path search.
        noProgressTicks: 2,
        // ROADMAP 0076: once retreatFrom() confirms a room is a genuine
        // route dead end (creep physically standing there, native moveTo()
        // returned ERR_NO_PATH repeatedly), it's shared via
        // Memory.rooms[x].routeDeadEndUntil so every OTHER creep also
        // avoids it instead of independently rediscovering the same thing
        // (e.g. a second pioneer sent moments after the first hit an
        // ally's interior rampart neither computeRealRoute, terrain-only,
        // nor findRoute, ally-exempt from isDangerousRoom, could see
        // coming). TTL, not permanent - the obstruction can change (ally
        // opens a rampart, wall gets torn down); console clearRouteDeadEnd
        // resets one early without waiting it out. Order of magnitude
        // picked to comfortably outlast a single spawn cycle without
        // requiring the obstruction to be re-confirmed by every batch of
        // creeps sent that way.
        deadEndTicks: 10000,
        // ROADMAP 0064: computeRealRoute()'s PathFinder.search budget -
        // runs once per trip (opt-in, opts.realRoute), so it can afford a
        // much bigger ceiling than any per-tick search in this codebase.
        // maxRooms 64 is the engine's own hard cap; maxOps scaled up from
        // the 2000 default since a multi-room trip covers far more tiles
        // than a same-room search ever would.
        realRouteMaxRooms: 64,
        realRouteMaxOps: 200000,
        // ROADMAP 0064 live follow-up: the native creep.moveTo() calls
        // moveToRoom() actually executes movement with never got this -
        // they silently used the engine's own default (2000), regardless of
        // how generous computeRealRoute()'s own budget was. Confirmed live:
        // a leg re-validated fine (computeRealRoute found a real 8-hop
        // detour, moveOpts already sensible) but the very next native
        // moveTo() call, given that exact validated route, still came back
        // ERR_NO_PATH twice and triggered another retreat anyway - the only
        // thing that differs between the two searches is the ops ceiling.
        // W1N50 (the room in that incident) has a fair amount of natural
        // wall scattered through it (confirmed by looking at its terrain
        // directly); routing around that from wherever the creep currently
        // stands can cost more than 2000 ops even when the room-level route
        // is already correct. Smaller than realRouteMaxOps on purpose -
        // this runs on every tick a fresh path is actually needed (not just
        // once per leg), so it stays a ceiling, not a routine expense.
        // maxOps alone didn't fix the live symptom - routeCostCallback's
        // "allowed" set (the route + each hop's known-exits neighbors as
        // slack) can also exceed the engine's own default maxRooms (16)
        // once a validated route runs 8+ hops; PathFinder caps total rooms
        // EXPLORED at maxRooms regardless of ops left. Both scoped to
        // opts.realRoute callers only (same-day follow-up, at the user's
        // request - "isso aumenta consumo de CPU? vale pra todo path?"): a
        // wider ceiling costs nothing for a search that already succeeds
        // within the old one, but only opts.realRoute callers (today, just
        // the claimer) have shown evidence of actually needing it -
        // scout/pioneer/raider/squad keep the engine's own defaults.
        //
        // ROADMAP 0064 same-day, third root cause: 20000 was sized back
        // when the native moveTo() search was still constrained by
        // routeCostCallback's narrow ALLOWLIST (route + one neighbor layer,
        // rarely more than ~20 rooms) - a small search space that 20000 ops
        // covered comfortably. Once avoidCostCallback replaced that with
        // the same open BLOCKLIST computeRealRoute() itself searches under
        // (every room open except avoid/hostile), the two became the SAME
        // kind of search - confirmed live: tryComputeRealRoute (200000 ops)
        // kept finding a valid route from the exact room native moveTo()
        // (20000 ops) then immediately failed ERR_NO_PATH from, every
        // single retreat, four legs in a row - a search that only ever
        // fails with a 10x smaller ops ceiling than an equivalent search
        // that succeeds is the signature of ops exhaustion, not a genuine
        // dead end (PathFinder.search's own `incomplete` when ops run out
        // surfaces through moveTo() as the identical ERR_NO_PATH, no way to
        // tell them apart from the return code alone). Raised to match
        // realRouteMaxOps - there's no longer a principled reason for the
        // two to differ, since avoidCostCallback is only ever in play (see
        // moveToRoom()'s usingRealRoute) in exactly the tick right after
        // computeRealRoute validated the same search under the same
        // constraints.
        moveMaxOps: 200000,
        moveMaxRooms: 64,
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
        // roles/hauler.js (ROADMAP 0051/0095): minimum reagent stock to
        // keep topped up in a lab reaction's input labs before another trip
        // is worth it - avoids a hauler shuttling tiny amounts back and
        // forth every tick once the lab is nearly full
        labBuffer: 500,
        pressureHigh: 0.75,
        pressureLow: 0.5,
        deathDropTtl: 10,
    },
    powerSpawn: {
        // structures/powerSpawn.js (ROADMAP 0051): off switch - processPower()
        // is otherwise unconditional whenever any Power sits in the store
        enabled: true,
    },
    stats: {
        // utils/stats.js (ROADMAP 0079): rooms.<room>.avgBarrierHits iterates
        // every rampart/wall in the room (roomCache.myStructures, no new
        // room.find, but still real work on a big base) - throttled to once
        // per this many ticks instead of every tick, same value cached in
        // between (utils/stats.js's own heap-resident barrierHitsCache).
        barrierHitsInterval: 50,
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
