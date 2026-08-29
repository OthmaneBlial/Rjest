const injected = {kind: 'injected mock', marker: {}};
const override = {kind: 'setMock override'};

expect(jest.setMock('./target.cjs', injected)).toBe(jest);
jest.mock('./override.cjs', () => ({kind: 'factory mock'}));
jest.setMock('./override.cjs', override);
jest.setMock('./primitive.cjs', 'injected primitive');

test('setMock injects the supplied CommonJS export object', () => {
  expect(require('./target.cjs')).toBe(injected);
  expect(jest.requireMock('./target.cjs')).toBe(injected);
  expect(jest.requireActual('./target.cjs')).toEqual({kind: 'actual target'});
});

test('setMock registration and supplied identity survive resetModules', () => {
  jest.resetModules();

  expect(require('./target.cjs')).toBe(injected);
});

test('setMock replaces prior factories and supports primitive exports', () => {
  expect(require('./override.cjs')).toBe(override);
  expect(require('./primitive.cjs')).toBe('injected primitive');
});

test('a later unmock removes a setMock registration', () => {
  jest.unmock('./target.cjs');

  expect(require('./target.cjs')).toEqual({kind: 'actual target'});
});

test('scoped Jest objects resolve setMock from their declaring module', () => {
  const registration = require('./nested/register.cjs');

  expect(registration.returned).toBe(registration.jestObject);
  expect(require('./nested/local-target.cjs')).toBe(registration.injected);
});
