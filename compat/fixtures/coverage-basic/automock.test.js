jest.mock('./automocked');

const automocked = require('./automocked');

test('counts isolated automock metadata execution in coverage', () => {
  expect(jest.isMockFunction(automocked.initialize)).toBe(true);
  expect(jest.isMockFunction(automocked.unused)).toBe(true);
});
