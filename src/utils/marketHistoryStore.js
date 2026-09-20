// Persistent temporal market snapshots. The active calculation stays in the
// heap; this compact representation survives a global reset/deploy.

const SEGMENT_ID = 9;
const VERSION = 1;
const MAX_BYTES = 95000;

let loaded = false;
let firstSeenTick = null;

function rawSegments() {
    return typeof RawMemory !== "undefined" && RawMemory.segments
        ? RawMemory.segments
        : null;
}

function unpack(raw) {
    if (!raw) return {};
    try {
        const payload = JSON.parse(raw);
        if (!payload || payload.version !== VERSION || !payload.snapshots) {
            return {};
        }
        const result = {};
        Object.keys(payload.snapshots).forEach((resourceType) => {
            const rows = payload.snapshots[resourceType];
            if (!Array.isArray(rows)) return;
            result[resourceType] = rows
                .filter((row) => Array.isArray(row) && row.length === 5)
                .map((row) => ({
                    tick: row[0],
                    buyPrice: row[1],
                    sellPrice: row[2],
                    buyVolume: row[3],
                    sellVolume: row[4],
                }));
        });
        return result;
    } catch (error) {
        return {};
    }
}

function load() {
    if (loaded) return true;
    const segments = rawSegments();
    if (!segments) return false;
    const raw = segments[SEGMENT_ID];
    // An inactive segment is not readable on the real server. Give the
    // activation request one tick to make it available before treating an
    // undefined value as a genuinely empty first-use segment.
    if (raw === undefined && firstSeenTick === null) {
        firstSeenTick = typeof Game !== "undefined" ? Game.time : 0;
        return false;
    }
    Object.assign(loadedHistory, unpack(typeof raw === "string" ? raw : ""));
    loaded = true;
    return true;
}

const loadedHistory = {};

function compact(history) {
    const snapshots = {};
    Object.keys(history || {}).forEach((resourceType) => {
        const rows = history[resourceType];
        if (!Array.isArray(rows) || !rows.length) return;
        snapshots[resourceType] = rows.map((row) => [
            row.tick,
            row.buyPrice,
            row.sellPrice,
            row.buyVolume,
            row.sellVolume,
        ]);
    });
    return { version: VERSION, snapshots };
}

function serialized(history) {
    return JSON.stringify(compact(history));
}

function oldestResource(history) {
    let selected = null;
    Object.keys(history).forEach((resourceType) => {
        const rows = history[resourceType];
        if (!rows || !rows.length) return;
        if (!selected || rows[0].tick < history[selected][0].tick) {
            selected = resourceType;
        }
    });
    return selected;
}

function save(history) {
    if (!load()) return false;
    const segments = rawSegments();
    if (!segments) return false;
    const copy = {};
    Object.keys(history || {}).forEach((resourceType) => {
        copy[resourceType] = Array.isArray(history[resourceType])
            ? history[resourceType].slice()
            : [];
    });
    let raw = serialized(copy);
    while (raw.length > MAX_BYTES) {
        const resourceType = oldestResource(copy);
        if (!resourceType) break;
        copy[resourceType].shift();
        if (!copy[resourceType].length) delete copy[resourceType];
        raw = serialized(copy);
    }
    segments[SEGMENT_ID] = raw;
    return raw.length <= MAX_BYTES;
}

function history() {
    load();
    return loadedHistory;
}

function clear() {
    loaded = false;
    firstSeenTick = null;
    Object.keys(loadedHistory).forEach((resourceType) => {
        delete loadedHistory[resourceType];
    });
    const segments = rawSegments();
    if (segments) segments[SEGMENT_ID] = "";
}

module.exports = {
    segmentId: SEGMENT_ID,
    history,
    load,
    save,
    clear,
};
