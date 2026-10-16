// Verify independent console expressions, including the API size gate.
// Reference: screeps/backend-local lib/game/api/user.js, POST /console.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const obsolete = fs.readFileSync(path.join(__dirname, 'cpu-audit-console.js'), 'utf8')
    .split(/\r?\n/).filter(line => !line.trim().startsWith('//'))
    .map(line => line.trim()).filter(Boolean).join(' ');
assert(JSON.stringify(obsolete).length > 1024, 'old installer must reproduce the API size failure');
console.log('Old installer rejected by API size gate: ' + JSON.stringify(obsolete).length + '/1024.');

const source = fs.readFileSync(path.join(__dirname, 'cpu-audit-commands.js'), 'utf8');
const commands = source.split(/^\/\/ COMMAND \w+\r?$/m).slice(1).map(block => block
    .split(/\r?\n/).filter(line => !line.trim().startsWith('//'))
    .map(line => line.trim()).filter(Boolean).join(' '));
assert.equal(commands.length, 3);

function execute(code, populated, tick) {
    const logs = [];
    const memory = populated ? {settings: {profiler: false}, stats: {persistent: {lastGlobalReset: 90}},
        terminalOps: {operations: {a: {kind: 'sell', state: 'listed'}, b: {kind: 'transfer', state: 'completed'}}, nextId: 3},
        craft: {active: {W1N1: {room: 'W1N1', product: 'OH', state: 'working'}}}} : {};
    const room = {name: 'W1N1', controller: {my: true, level: 8},
        storage: {store: {energy: 1000}}, terminal: {store: {energy: 500}, cooldown: 3}};
    const tx = {transactionId: 'tx1', time: tick - 1, order: {id: 'order1'}};
    const game = {time: tick, cpu: {getUsed: () => 0},
        rooms: populated ? {W1N1: room, W2N2: {name: 'W2N2'}} : {},
        structures: populated ? {lab1: {structureType: 'lab', room}} : {},
        creeps: populated ? {one: {room, memory: {role: 'hauler'}}, two: {room, memory: {}}} : {},
        market: populated ? {orders: {one: {}}, incomingTransactions: [tx], outgoingTransactions: [tx,
            {transactionId: 'tx2', time: tick - 2}]} : {}};
    const before = JSON.stringify({memory, game});
    const context = vm.createContext({Memory: memory, Game: game,
        RawMemory: {get: () => JSON.stringify(memory)}, console: {log: msg => logs.push(msg)}});
    context.global = context;
    if (populated) context.marketHistoryStatus = () => ({loaded: true, pages: 2});
    const keys = Object.keys(context);
    // Match the backend's size check before evaluation, including JSON escaping.
    const encodedLength = JSON.stringify(code).length;
    assert(encodedLength <= 1024, 'expression size is too large: ' + encodedLength);
    // A fresh context for every call ensures no installed function is required.
    vm.runInContext('(function(){return eval(' + JSON.stringify(code) + ');})()', context);
    assert.equal(logs.length, 1);
    assert.equal(JSON.stringify({memory, game}), before);
    assert.deepEqual(Object.keys(context), keys);
    const result = JSON.parse(logs[0].slice(logs[0].indexOf(' ') + 1));
    assert.equal(result.tick, tick);
    return result;
}

commands.forEach((command, i) => {
    execute(command, false, 100);
    const sample = execute(command, true, 160);
    execute(command, true, 220);
    if (i === 0) { assert(sample.parts.terminalOps > 0); assert.equal(sample.history.pages, 2); }
    if (i === 1) { assert.equal(sample.rooms.W1N1.labs, 1); assert.equal(sample.rooms.W1N1.roles.hauler, 1); }
    if (i === 2) { assert.equal(sample.ops.length, 2); assert.equal(sample.transactions.length, 2);
        assert.equal(sample.transactions.filter(tx => tx[2]).length, 1); }
    console.log('Command ' + (i + 1) + ': ' + JSON.stringify(command).length + '/1024 encoded characters; verified.');
});
fs.writeFileSync(path.join(__dirname, 'cpu-audit-console-paste.txt'), commands.join('\n\n') + '\n');
console.log('Submit each line separately. No global function, Memory writes, build or deploy.');
