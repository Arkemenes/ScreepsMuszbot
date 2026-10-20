// Lightweight terminal-to-terminal text messages for allied coordination.
// Messages use StructureTerminal.send's description field and are never
// interpreted as commands by this bot.
"use strict";

const config = require("./config");
const hostiles = require("./hostiles");

const PREFIX = "MSG:";
const ROOM_REGEX = /^[WE][0-9]{1,3}[NS][0-9]{1,3}$/;
const MAX_MESSAGE_LENGTH = 96; // StructureTerminal.send description is capped at 100.

function memory() {
    if (!Memory.terminalMessenger || typeof Memory.terminalMessenger !== "object") {
        Memory.terminalMessenger = { nextId: 1, queue: [], messages: [] };
    }
    const mem = Memory.terminalMessenger;
    if (!Number.isInteger(mem.nextId) || mem.nextId < 1) mem.nextId = 1;
    if (!Array.isArray(mem.queue)) mem.queue = [];
    if (!Array.isArray(mem.messages)) mem.messages = [];
    return mem;
}

function contacts() {
    const directory = config.get("terminalMessenger.contacts", {});
    return directory && typeof directory === "object" && !Array.isArray(directory) ? directory : {};
}

function getAllyRoom(playerName) {
    if (typeof playerName !== "string" || !playerName.trim()) return null;
    const wanted = playerName.trim().toLowerCase();
    const directory = Object.assign({}, contacts());
    for (const name in directory) {
        if (name.toLowerCase() === wanted && ROOM_REGEX.test(directory[name])) return directory[name];
    }
    const candidates = allyRooms(playerName);
    if (!candidates.length) return null;
    return chooseDestinationRoom(candidates);
}

function allyRooms(playerName) {
    if (typeof playerName !== "string" || !playerName.trim()) return [];
    const wanted = playerName.trim().toLowerCase();
    if (!hostiles.allies().some((name) => typeof name === "string" && name.toLowerCase() === wanted)) return [];
    const rooms = Object.assign({}, Memory.roomRegistry && Memory.roomRegistry.rooms || {}, Memory.rooms || {});
    return Object.keys(rooms).filter((roomName) => {
        const entry = rooms[roomName];
        const owner = entry && (entry.owner || entry.o);
        const level = entry && (entry.controllerLevel === undefined ? entry.l : entry.controllerLevel);
        return ROOM_REGEX.test(roomName) && typeof owner === "string" &&
            owner.toLowerCase() === wanted && Number(level) >= 6;
    }).sort();
}

function chooseDestinationRoom(candidates) {
    if (!Array.isArray(candidates) || candidates.length < 2 || !Game.market ||
        typeof Game.market.calcTransactionCost !== "function") return candidates && candidates[0] || null;
    const sources = Object.keys(Game.rooms || {}).filter((name) => {
        const room = Game.rooms[name];
        return room && room.controller && room.controller.my && room.terminal && room.terminal.my !== false;
    });
    let best = null;
    candidates.forEach((destination) => sources.forEach((source) => {
        let cost;
        try { cost = Game.market.calcTransactionCost(1, source, destination); } catch (error) { return; }
        if (!Number.isFinite(cost) || cost < 0) return;
        if (!best || cost < best.cost || cost === best.cost && destination < best.room)
            best = { room: destination, cost };
    }));
    return best ? best.room : candidates[0];
}

function messageFuelDemand(roomName) {
    const message = nextQueued();
    if (!message || !Game.market || typeof Game.market.calcTransactionCost !== "function") return 0;
    const sources = Object.keys(Game.rooms || {}).filter((name) => {
        const room = Game.rooms[name];
        return room && room.controller && room.controller.my && room.terminal && room.terminal.my !== false;
    });
    let chosen = null;
    sources.forEach((name) => {
        let freight;
        try { freight = Game.market.calcTransactionCost(1, name, message.to); } catch (error) { return; }
        if (!Number.isFinite(freight) || freight < 0) return;
        if (!chosen || freight < chosen.freight || freight === chosen.freight && name < chosen.room)
            chosen = { room: name, freight };
    });
    return chosen && chosen.room === roomName ? 1 + chosen.freight : 0;
}

function setAllyRoom(playerName, roomName) {
    const name = typeof playerName === "string" ? playerName.trim() : "";
    if (!name || name.length > 40 || ["__proto__", "prototype", "constructor"].indexOf(name.toLowerCase()) >= 0 ||
        typeof roomName !== "string" || !ROOM_REGEX.test(roomName)) {
        return "Usage: setAllyRoom('PlayerName', 'E2N46')";
    }
    const directory = Object.assign({}, contacts());
    directory[name] = roomName;
    if (!Memory.settings || typeof Memory.settings !== "object") Memory.settings = {};
    if (!Memory.settings.terminalMessenger || typeof Memory.settings.terminalMessenger !== "object")
        Memory.settings.terminalMessenger = {};
    Memory.settings.terminalMessenger.contacts = directory;
    return `Contact saved: ${name} -> ${roomName}.`;
}

function appendMessage(entry) {
    const mem = memory();
    mem.messages.push(entry);
    const keep = Math.max(1, config.get("terminalMessenger.historySize", 50));
    if (mem.messages.length > keep) mem.messages.splice(0, mem.messages.length - keep);
}

function queueMessage(player, text, targetRoom) {
    if (typeof player !== "string" || !player.trim()) return "Usage: message('PlayerName', 'Text')";
    const name = player.trim();
    if (text === undefined || text === null || (typeof text === "string" && !text.trim())) {
        const roomName = targetRoom || getAllyRoom(name);
        return roomName ? `Target: ${name} -> ${roomName}. Usage: message('${name}', 'Text')` :
            `No contact room for ${name}. Set one with setAllyRoom('${name}', 'E2N46').`;
    }
    const clean = String(text).replace(/[\r\n\t]/g, " ").trim();
    if (!clean || clean.length > MAX_MESSAGE_LENGTH) return `Message must contain 1-${MAX_MESSAGE_LENGTH} characters.`;
    const dest = targetRoom || getAllyRoom(name);
    if (typeof dest !== "string" || !ROOM_REGEX.test(dest))
        return `No observed RCL 6+ terminal room for ${name}. Check messageStatus() or setAllyRoom('${name}', 'E2N46').`;
    const mem = memory();
    const maxQueue = Math.max(1, config.get("terminalMessenger.maxQueue", 20));
    if (mem.queue.length >= maxQueue) return `Message queue is full (${maxQueue}).`;
    const item = { id: mem.nextId++, player: name, to: dest, text: clean, createdTick: Game.time };
    mem.queue.push(item);
    return `Message #${item.id} queued for ${name} at ${dest}. It will use 1 energy plus terminal freight.`;
}

function receiveTransaction(tx) {
    const description = tx && tx.description;
    if (typeof description !== "string" || description.indexOf(PREFIX) !== 0) return false;
    const text = description.slice(PREFIX.length);
    if (!text || text.length > MAX_MESSAGE_LENGTH || !tx.transactionId) return true;
    const sender = tx.sender && typeof tx.sender.username === "string" ? tx.sender.username : "Unknown player";
    appendMessage({ tick: tx.time || Game.time, direction: "in", player: sender,
        from: tx.from || "?", to: tx.to || "?", text });
    const line = `[Terminal message] ${sender} (${tx.from || "?"} -> ${tx.to || "?"}): ${text}`;
    if (typeof Game.notify === "function") Game.notify(line, 0);
    if (typeof console !== "undefined" && console.log) console.log(line);
    return true;
}

function nextQueued() { return memory().queue[0] || null; }

function markSent(id, details) {
    const mem = memory();
    const index = mem.queue.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const item = mem.queue.splice(index, 1)[0];
    appendMessage({ tick: Game.time, direction: "out", player: item.player,
        from: details.from, to: item.to, text: item.text, freight: details.freight });
    return true;
}

function status() {
    const mem = memory();
    const directory = contacts();
    const lines = ["=== Terminal Messenger ===", "Contacts:"];
    const names = new Set(Object.keys(directory));
    hostiles.allies().forEach((name) => { if (typeof name === "string" && name) names.add(name); });
    if (!names.size) lines.push("  (no allies configured in Memory.settings.allies)");
    Array.from(names).sort().forEach((name) => {
        const room = getAllyRoom(name);
        lines.push(`  ${name} -> ${room || "(no terminal room discovered; needs observed RCL 6+ room intel)"}${Object.prototype.hasOwnProperty.call(directory, name) ? " [manual]" : " [auto]"}`);
    });
    lines.push(`Queued: ${mem.queue.length}`);
    mem.queue.forEach((item) => lines.push(`  #${item.id} -> ${item.player} (${item.to}): ${item.text}${item.lastError ? ` [${item.lastError}]` : ""}`));
    lines.push("Recent messages:");
    mem.messages.slice(-8).forEach((item) => {
        const age = Math.max(0, Game.time - item.tick);
        lines.push(`  ${item.direction === "out" ? "->" : "<-"} ${item.player} (${age} ticks ago): ${item.text}`);
    });
    if (!mem.messages.length) lines.push("  (none)");
    return lines.join("\n");
}

global.message = queueMessage;
global.allyMessage = queueMessage;
global.messageStatus = status;
global.setAllyRoom = setAllyRoom;

module.exports = {
    PREFIX, MAX_MESSAGE_LENGTH, queueMessage, setAllyRoom, getAllyRoom, allyRooms,
    messageFuelDemand, receiveTransaction, nextQueued, markSent, status,
};
