const {subtract} = require('@rjest-fixture/math');

test('resolves a scoped package from node_modules', () => {
  expect(subtract(50, 8)).toBe(42);
});
