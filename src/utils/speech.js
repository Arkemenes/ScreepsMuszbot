"use strict";
// ARK-116: creep.say() is a 0.2 CPU intent like any action (~1.5/tick live, 2026-10-20,
// all cosmetic). Speech goes through here and only reaches the game with creep.say on.
const config = require("./config");

module.exports = function speak(creep, text) {
    return config.get("creep.say", false) && typeof creep.say === "function" ? creep.say(text) : OK;
};
