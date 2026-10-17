// A provider captured at module load and heap state that must survive warm steps.
const provider = global.__oracleFixtureProvider;
let count = 0;
module.exports = {
    next: () => ++count,
    providerValue: () => provider && provider.value,
};
