"use strict";
// Creep speech goes through here so it can be switched off (creep.say, on by default).
// say() costs no intent CPU: the driver charges 0.2 per intent except its freeMethods
// (say, pull) - screeps/driver lib/runtime/runtime.js.
const config = require("./config");

module.exports = function speak(creep, text) {
    return config.get("creep.say", true) && typeof creep.say === "function" ? creep.say(text) : OK;
};
