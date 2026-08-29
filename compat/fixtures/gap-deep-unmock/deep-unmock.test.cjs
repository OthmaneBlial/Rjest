jest.deepUnmock('./entry.cjs');
jest.deepUnmock('./factory-entry.cjs');
jest.deepUnmock('./cycle-a.cjs');
jest.unmock('./shallow-entry.cjs');
jest.mock('./factory-child.cjs', () => ({
  read() {
    return 'explicit factory child';
  },
}));

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

test('a transitive dependency remains mockable from an ordinary parent', () => {
  const dependency = require('./dependency.cjs');

  expect(jest.isMockFunction(dependency.read)).toBe(true);
  expect(dependency.read()).toBeUndefined();
});

test('deepUnmock decisions survive resetModules', () => {
  jest.resetModules();
  const entry = require('./entry.cjs');

  expect(entry.read()).toBe('entry:dependency:leaf');
  expect(jest.isMockFunction(entry.dependencyRead)).toBe(false);
  expect(jest.isMockFunction(entry.leafRead)).toBe(false);
});

test('an explicit factory still wins inside a deeply unmocked graph', () => {
  const entry = require('./factory-entry.cjs');

  expect(entry.read()).toBe('factory entry:explicit factory child');
  expect(jest.isMockFunction(entry.childRead)).toBe(false);
});

test('deeply unmocked cycles propagate without recursion', () => {
  const cycle = require('./cycle-a.cjs');

  expect(cycle.read()).toBe('a:b:a');
  expect(jest.isMockFunction(cycle.childRead)).toBe(false);
});
