// Persistent temporal snapshots, paged across reserved segments 0..9.
// Heap calculations keep original prices, volumes and ticks; no thinning.
const SEGMENT_ID = 9;
const VERSION = 2;
const MAX_BYTES = 95000;
const MAX_PAGES = 10;
const loadedHistory = {};
let loaded = false, firstSeenTick = null, manifest = null, manifestRaw = null;
let pending = [], persistedBytes = 0, error = null;

function rawSegments() {
    return typeof RawMemory !== "undefined" && RawMemory.segments ? RawMemory.segments : null;
}
function parse(raw) {
    try {
        const payload = JSON.parse(raw);
        return payload && (payload.version === 1 || payload.version === VERSION) &&
            payload.snapshots && typeof payload.snapshots === "object" ? payload : null;
    } catch (e) { return null; }
}
function merge(payload) {
    Object.keys(payload.snapshots).forEach((r) => {
        const rows = payload.snapshots[r];
        if (!Array.isArray(rows)) return;
        if (!loadedHistory[r]) loadedHistory[r] = [];
        rows.forEach((row) => {
            if (Array.isArray(row) && (row.length === 5 || row.length === 6) && Number.isFinite(row[0])) {
                const sample = { tick: row[0], buyPrice: row[1], sellPrice: row[2], buyVolume: row[3], sellVolume: row[4] };
                if (Number.isFinite(row[5])) sample.scheduledTick = row[5];
                loadedHistory[r].push(sample);
            }
        });
    });
}
function resetCache() {
    loaded = false; firstSeenTick = null; manifest = null; manifestRaw = null;
    pending = []; persistedBytes = 0; error = null;
    Object.keys(loadedHistory).forEach((r) => delete loadedHistory[r]);
}
function load() {
    if (loaded) return true;
    const segments = rawSegments();
    if (!segments) return false;
    const raw = segments[SEGMENT_ID];
    if (raw === undefined) {
        const now = typeof Game !== "undefined" ? Game.time : 0;
        if (firstSeenTick === null) { firstSeenTick = now; return false; }
        if (now <= firstSeenTick || manifest) return false;
        // An activated first-use root may have no stored string.
        loaded = true; return true;
    }
    if (raw !== manifestRaw) {
        resetCache(); manifestRaw = raw;
        if (!raw) { loaded = true; return true; }
        manifest = parse(raw);
        if (!manifest) { error = "invalid-root"; return false; }
        const pages = manifest.version === 1 ? 0 : manifest.pages;
        if (!Number.isInteger(pages) || pages < 0 || pages >= MAX_PAGES) { error = "invalid-page-count"; return false; }
        pending = Array.from({ length: pages }, (_, i) => i);
        persistedBytes = raw.length; merge(manifest);
    }
    if (!manifest || error === "invalid-root" || error === "invalid-page-count") return false;
    error = null;
    const next = [];
    for (const id of pending) {
        const pageRaw = segments[id];
        if (typeof pageRaw !== "string") { next.push(id); continue; }
        const page = parse(pageRaw);
        if (!page || page.version !== VERSION || page.generation !== manifest.generation) {
            error = "invalid-page-" + id; next.push(id); continue;
        }
        merge(page); persistedBytes += pageRaw.length;
    }
    pending = next;
    loaded = !pending.length;
    if (loaded) Object.keys(loadedHistory).forEach((r) => loadedHistory[r].sort((a, b) => a.tick - b.tick));
    return loaded;
}
function activeSegmentIds() {
    load();
    // Read one page per tick while hydrating, leaving eight slots for plans.
    return pending.length ? [SEGMENT_ID, pending[0]] : [SEGMENT_ID];
}
function compactPages(history) {
    const pages = [{}], sizes = [2];
    for (const r of Object.keys(history || {})) {
        if (!Array.isArray(history[r])) continue;
        for (const row of history[r]) {
            const tuple = [row.tick, row.buyPrice, row.sellPrice, row.buyVolume, row.sellVolume];
            if (Number.isFinite(row.scheduledTick)) tuple.push(row.scheduledTick);
            const length = JSON.stringify(tuple).length;
            let index = pages.length - 1;
            let overhead = pages[index][r] ? 1 : JSON.stringify(r).length + 4;
            if (sizes[index] + length + overhead > MAX_BYTES - 300) {
                if (pages.length >= MAX_PAGES) return null;
                pages.push({}); sizes.push(2); index++; overhead = JSON.stringify(r).length + 4;
            }
            if (!pages[index][r]) pages[index][r] = [];
            pages[index][r].push(tuple);
            sizes[index] += length + overhead;
        }
    }
    return pages;
}
function save(history) {
    if (!load()) return false;
    const segments = rawSegments();
    if (!segments) return false;
    const pages = compactPages(history);
    if (!pages) { error = "history-capacity"; return false; }
    const generation = (manifest && manifest.generation || 0) + 1;
    const payloads = pages.map((snapshots, index) => JSON.stringify(Object.assign({
        version: VERSION, generation, snapshots,
    }, index === 0 ? { pages: pages.length - 1 } : {})));
    if (payloads.some((raw) => raw.length > MAX_BYTES)) { error = "history-capacity"; return false; }
    // Commit the root last. No row is evicted just to fit a single segment.
    for (let i = 1; i < payloads.length; i++) segments[i - 1] = payloads[i];
    segments[SEGMENT_ID] = payloads[0];
    manifestRaw = payloads[0]; manifest = parse(manifestRaw);
    persistedBytes = payloads.reduce((sum, raw) => sum + raw.length, 0);
    error = null;
    return true;
}
function history() { load(); return loadedHistory; }
function status() {
    return { loaded, version: manifest && manifest.version, pages: manifest ? (manifest.pages || 0) + 1 : 0,
        pendingSegments: pending.slice(), persistedBytes, error };
}
function clear() {
    resetCache();
    const segments = rawSegments();
    if (segments) { segments[SEGMENT_ID] = ""; for (let i = 0; i < SEGMENT_ID; i++) delete segments[i]; }
}
global.marketHistoryStatus = status;
module.exports = { segmentId: SEGMENT_ID, history, load, save, resetCache, clear, activeSegmentIds, status };
