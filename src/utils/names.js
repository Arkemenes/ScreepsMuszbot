// Flavor names for spawned creeps (ROADMAP 0048, old_1 parity but reworked
// on request). old_1's shape was 4 parts: "FirstName Surname,\nTitlePart1
// TitlePart2" - kept here, but unlike old_1 (generic vocative + unrelated
// adjunct, e.g. "Lord of the Damned" for any role), both title parts are
// always drawn from a per-role pool, so the title actually reflects what
// the creep does. First name + surname stay free-form/random - only the
// title is constrained. Purely cosmetic - nothing here feeds back into any
// game decision (body, targeting, counts), so Math.random() is fine even
// though the rest of the codebase avoids it for anything behavior-affecting.

const FIRST_NAMES = [
    "Aldric", "Brint", "Corin", "Dessa", "Elowen", "Fenwick", "Gara",
    "Halvard", "Ione", "Jorik", "Kessa", "Lira", "Marek", "Nyla", "Orin",
    "Petra", "Quill", "Rasp", "Sorin", "Talia", "Ulric", "Vesna", "Wren",
    "Yorik", "Zana", "Brack", "Corvin", "Dain", "Ember", "Finch", "Gwyn",
    "Harlan", "Isolde", "Joran", "Kael", "Lyssa", "Merrin", "Norra",
    "Odessa", "Perrin", "Quinlan", "Rhona", "Sable", "Tarn", "Ursa",
    "Varek", "Willa", "Xanth", "Yara", "Zeb",
];

const SURNAMES = [
    "Ashford", "Blackwell", "Corvane", "Dunmore", "Emberly", "Farrow",
    "Graymark", "Harrow", "Ivenwood", "Jarrow", "Kestrel", "Larkspur",
    "Marrow", "Norwick", "Osgrove", "Penshaw", "Quarrow", "Ridgeway",
    "Stonebridge", "Thistledown", "Underhill", "Vaelor", "Wickfield",
    "Yewbranch", "Zephwind", "Ashgate", "Briarwood", "Coldwater",
    "Deepdelve", "Everstone", "Fallowmere", "Greymantle", "Hollowvale",
    "Ironfeld", "Kelmoor", "Longshade", "Millbrook", "Nightfall",
    "Oakenshaw", "Proudwater", "Ravenscar", "Shadowmere", "Tanglewood",
    "Vosswick", "Westmere", "Wrenfield", "Ashholm", "Drearmont",
    "Elmsworth", "Grimstead",
];

// Two independent title-part pools per role (or "role:mission" for a role
// whose missions are different enough to deserve their own flavor) - both
// parts always reflect what the creep does, unlike old_1's disconnected
// vocative+adjunct. Every role that currently has a spawnData() needs an
// entry here.
const TITLE_POOLS = {
    bootstrap: {
        part1: ["Improviser", "Stopgap", "Bootstrapper", "Emergency Hand"],
        part2: ["of First Light", "of the Bare Camp", "of Last Resort", "of the New Claim"],
    },
    builder: {
        part1: ["Mason", "Carpenter", "Wright", "Constructor", "Framer"],
        part2: ["of the Scaffold", "of the Foundation", "of the Blueprint", "of the Worksite"],
    },
    defender: {
        part1: ["Guardian", "Sentinel", "Warden", "Shieldbearer", "Bulwark"],
        part2: ["of the Wall", "of the Gate", "of the Perimeter", "of Home"],
    },
    defenderMedic: {
        part1: ["Medic", "Healer", "Chirurgeon", "Field Surgeon", "Mender"],
        part2: ["of the Triage", "of the Field", "of the Wound", "of the Reserve Line"],
    },
    defenderStriker: {
        part1: ["Marksman", "Sharpshooter", "Gunner", "Ranger", "Skirmisher"],
        part2: ["of the Kill Range", "of the Flank", "of the Volley", "of the Line"],
    },
    hauler: {
        part1: ["Hauler", "Porter", "Carrier", "Freighter", "Drayman"],
        part2: ["of Supply", "of the Convoy", "of the Depot", "of the Storehouse"],
    },
    miner: {
        part1: ["Excavator", "Digger", "Driller", "Prospector", "Delver"],
        part2: ["of the Deep Vein", "of the Rockface", "of the Ore", "of the Depths"],
    },
    mineralMiner: {
        part1: ["Refiner", "Extractor", "Delver", "Prospector"],
        part2: ["of the Mineral Vein", "of the Deposit", "of the Rockface", "of the Lode"],
    },
    pioneer: {
        part1: ["Pioneer", "Settler", "Trailblazer", "Vanguard", "Homesteader"],
        part2: ["of the New Claim", "of the Frontier", "of the First Stone", "of the Outpost"],
    },
    raider: {
        part1: ["Raider", "Marauder", "Reaver", "Plunderer", "Skirmisher"],
        part2: ["of the Border Raid", "of the Sortie", "of the Foray", "of the Strike"],
    },
    remoteHauler: {
        part1: ["Courier", "Outrider", "Wayfarer", "Roadrunner", "Packmule"],
        part2: ["of the Far Route", "of the Supply Line", "of the Outland Road", "of the Convoy"],
    },
    remoteMiner: {
        part1: ["Frontier Miner", "Claimjumper", "Outlander", "Borderminer"],
        part2: ["of the Far Vein", "of the Contested Claim", "of the Outland Pit", "of No Man's Seam"],
    },
    scout: {
        part1: ["Scout", "Wanderer", "Pathfinder", "Explorer", "Cartographer"],
        part2: ["of the Unmapped", "of the Far Roads", "of the Horizon", "of the Open Map"],
    },
    squadDismantler: {
        part1: ["Breacher", "Demolisher", "Wrecker", "Saboteur", "Siegebreaker"],
        part2: ["of the Breach", "of the Ruin", "of the Siege Line", "of the Rubble"],
    },
    upgrader: {
        part1: ["Acolyte", "Zealot", "Devotee", "Ascendant", "Keeper"],
        part2: ["of the Flame", "of the Controller", "of the Ascension", "of the Upgrade"],
    },
    "reserver:reserve": {
        part1: ["Envoy", "Surveyor", "Claimstaker", "Warden"],
        part2: ["of the Border", "of the Outpost", "of the Standing Claim", "of the Frontier"],
    },
    "reserver:claim": {
        part1: ["Annexer", "Sovereign", "Founder", "Colonizer"],
        part2: ["of the New Domain", "of the Annexation", "of the First Flag", "of the Charter"],
    },
    looter: {
        part1: ["Plunderer", "Scavenger", "Salvager", "Reaver"],
        part2: ["of the Spoils", "of the Emptied Vault", "of the Long Haul", "of the Fallen Hold"],
    },
    "reserver:contest": {
        part1: ["Conqueror", "Usurper", "Warlord", "Besieger"],
        part2: ["of the Long Siege", "of the Broken Claim", "of the Contested Crown", "of the Grudge"],
    },
};

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function poolFor(key) {
    if (TITLE_POOLS[key]) return TITLE_POOLS[key];
    const role = String(key).split(":")[0];
    if (TITLE_POOLS[role]) return TITLE_POOLS[role];
    const generic = role.charAt(0).toUpperCase() + role.slice(1);
    return { part1: [generic], part2: ["of the Colony"] };
}

// `key`: a role name ("miner") or "role:mission" ("reserver:claim").
// 4-part shape: "FirstName Surname,\nTitlePart1 TitlePart2" - first
// name/surname are free-form, both title parts always come from `key`'s
// pool. Tries a bounded number of random combinations before accepting a
// residual collision with a live creep's name - rooms/spawning.js already
// handles a spawnCreep() name clash as an ordinary spawn failure
// (fail-soft), so a 100% uniqueness guarantee isn't needed here.
function generate(key) {
    const pool = poolFor(key);
    for (let i = 0; i < 20; i++) {
        const candidate =
            pick(FIRST_NAMES) + " " + pick(SURNAMES) + ",\n" +
            pick(pool.part1) + " " + pick(pool.part2);
        if (!Game.creeps[candidate]) return candidate;
    }
    return (
        pick(FIRST_NAMES) + " " + pick(SURNAMES) + ",\n" +
        pick(pool.part1) + " " + pick(pool.part2) + " " + Game.time
    );
}

module.exports = { generate, FIRST_NAMES, SURNAMES, TITLE_POOLS };
