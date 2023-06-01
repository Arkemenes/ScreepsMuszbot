/** Call this to run the current state */
RoomObject.prototype.invokeState = function () {
    if (!this.memory.stack || !this.memory.stack.length) return false;
    var [[state, scope]] = this.memory.stack;
    var method = `run${state}`;
    if (!this[method]) return false;
    this[method](scope);
    return true;
};

/**
 * @param {string} [defaultState] - Fallback state if none defined.
 */
RoomObject.prototype.getState = function (defaultState = "I") {
    if (!this.memory.stack) return defaultState;
    return this.memory.stack[0][0] || defaultState;
};

/**
 * @param {string} state - Name of state to switch to.
 * @param {*} scope - Any data you want to supply to the state.
 */
RoomObject.prototype.setState = function (state, scope) {
    if (state == null) throw new TypeError("State can not be null");
    if (!this.memory.stack) this.memory.stack = [[]];
    this.memory.stack[0] = [state, scope];
    return state;
};

/**
 * @param {string} state - Name of state to push
 * @param {*} scope - Any data you want to supply to the state.
 */
RoomObject.prototype.pushState = function (state, scope = {}) {
    if (!this.memory.stack) this.memory.stack = [];
    var method = `run${state}`;
    if (this[method] == null)
        throw new Error(`No such state or action ${method}`);
    if (this.memory.stack.length >= 100)
        throw new Error("Automata stack limit exceeded");
    this.memory.stack.unshift([state, scope]);
    return state;
};

/** Pop the current state off the stack */
RoomObject.prototype.popState = function () {
    if (!this.memory.stack || !this.memory.stack.length) return;
    const [state] = this.memory.stack.shift();
    if (!this.memory.stack.length) this.memory.stack = undefined;
};

/** Clear the stack */
RoomObject.prototype.clearState = function () {
    this.memory.stack = undefined;
};
