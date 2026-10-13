// Engine paths encode the first step's x/y before their direction sequence.
const dx = [0, 0, 1, 1, 1, 0, -1, -1, -1];
const dy = [0, -1, -1, 0, 1, 1, 1, 0, -1];

function nextStep(creep) {
    const cached = creep.memory && creep.memory._move;
    const path = cached && cached.path;
    if (!path || typeof path !== "string" || (cached.room && cached.room !== creep.room.name)) return null;
    let direction, x, y;
    if (/^\d{4}[1-8]+$/.test(path)) {
        x = Number(path.slice(0, 2)); y = Number(path.slice(2, 4));
        if (x > 49 || y > 49) return null;
        // Recover the origin, then walk the bounded serialized sequence until
        // the current position is found. Never reuse a path from elsewhere.
        direction = Number(path[4]);
        x -= dx[direction]; y -= dy[direction];
        for (let i = 4; i < path.length; i++) {
            direction = Number(path[i]);
            if (x === creep.pos.x && y === creep.pos.y) {
                const step = { x: x + dx[direction], y: y + dy[direction], direction };
                return step.x >= 0 && step.x <= 49 && step.y >= 0 && step.y <= 49 ? step : null;
            }
            x += dx[direction]; y += dy[direction];
        }
        return null;
    }
    // Short direction-only paths remain supported for callers/test fixtures.
    if (!/^[1-8]{1,4}$/.test(path)) return null;
    direction = Number(path[0]);
    x = creep.pos.x + dx[direction]; y = creep.pos.y + dy[direction];
    return x >= 0 && x <= 49 && y >= 0 && y <= 49 ? { x, y, direction } : null;
}

module.exports = { nextStep };
