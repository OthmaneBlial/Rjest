jest.deepUnmock('./entry.cjs');
jest.unmock('./shallow-entry.cjs');

test('deepUnmock keeps the complete dependency graph actual', () => {
  const entry = require('./entry.cjs');

  expect(entry.read()).toBe('entry:dependency:leaf');
  expect(jest.isMockFunction(entry.dependencyRead)).toBe(false);
  expect(jest.isMockFunction(entry.leafRead)).toBe(false);
});

test('unmock alone still allows automatic mocks below the target', () => {
  const entry = require('./shallow-entry.cjs');

  expect(jest.isMockFunction(entry.dependencyRead)).toBe(true);
});
