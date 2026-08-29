const state = (globalThis[Symbol.for('rjest.fixture.configResetModules')] ??= {
  count: 0,
});
state.count += 1;

module.exports = {evaluation: state.count, marker: {evaluation: state.count}};
