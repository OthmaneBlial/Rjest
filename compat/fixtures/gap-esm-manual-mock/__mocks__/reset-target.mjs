const state = (globalThis[Symbol.for('rjest.fixture.esmManualReset')] ??= {
  count: 0,
});
state.count += 1;

export const evaluation = state.count;
export const marker = {evaluation};
