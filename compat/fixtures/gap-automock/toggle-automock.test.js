jest.autoMockOff();
const actual = require('./toggle-actual.js');
jest.autoMockOn();
const mocked = require('./toggle-mocked.js');

test('toggles automocking without hoisting the alias methods', () => {
  expect(actual()).toBe('actual');
  expect(jest.isMockFunction(actual)).toBe(false);
  expect(jest.isMockFunction(mocked)).toBe(true);
  expect(mocked()).toBeUndefined();
});
