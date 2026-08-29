const fs = require('node:fs');
const mapped = require('@mapped');
const dependency = require('./dependency.js');

test('enables automocking from config without mocking builtins', () => {
  expect(jest.isMockFunction(dependency.calculate)).toBe(true);
  expect(jest.isMockFunction(fs.readFileSync)).toBe(false);
  expect(jest.isMockFunction(mapped)).toBe(true);
  expect(mapped()).toBeUndefined();
});
