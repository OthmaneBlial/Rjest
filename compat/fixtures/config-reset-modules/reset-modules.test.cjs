let previousActual;
let previousMock;

test('resetModules clears setup module instances before the first test', () => {
  const actual = require('./counter.cjs');
  const mock = require('./mocked.cjs');

  expect(actual.marker).not.toBe(resetModulesSetupActual.marker);
  expect(actual.evaluation).toBeGreaterThan(resetModulesSetupActual.evaluation);
  expect(mock.kind).toBe('factory mock');
  expect(mock.marker).not.toBe(resetModulesSetupMock.marker);
  previousActual = actual;
  previousMock = mock;
});

test('resetModules creates fresh actual and mock instances before every test', () => {
  const actual = require('./counter.cjs');
  const mock = require('./mocked.cjs');

  expect(actual.marker).not.toBe(previousActual.marker);
  expect(actual.evaluation).toBeGreaterThan(previousActual.evaluation);
  expect(mock.kind).toBe('factory mock');
  expect(mock.marker).not.toBe(previousMock.marker);
});
