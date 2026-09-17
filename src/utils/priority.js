function tierRank(tier) {
    const order = { critical: 0, satisfactory: 1, optimal: 2, optional: 3 };
    return order[tier] !== undefined ? order[tier] : 99;
}

function pick(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return null;

    const eligible = candidates.filter((candidate) => {
        if (!candidate || candidate.allowed === false) return false;
        if (typeof candidate.allowed !== "function") return true;
        try {
            return candidate.allowed() !== false;
        } catch (err) {
            return false;
        }
    });
    if (!eligible.length) return null;

    return eligible
        .slice()
        .sort((a, b) => {
            const aTier = tierRank(a && a.tier);
            const bTier = tierRank(b && b.tier);
            if (aTier !== bTier) return aTier - bTier;

            const aPriority = Number.isFinite(a && a.priority) ? a.priority : 0;
            const bPriority = Number.isFinite(b && b.priority) ? b.priority : 0;
            if (aPriority !== bPriority) return bPriority - aPriority;

            const aCost = Number.isFinite(a && a.minimumEnergyCost) ? a.minimumEnergyCost : 0;
            const bCost = Number.isFinite(b && b.minimumEnergyCost) ? b.minimumEnergyCost : 0;
            if (aCost !== bCost) return aCost - bCost;

            return 0;
        })[0];
}

module.exports = { pick, tierRank };
