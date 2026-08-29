const injected = {kind: 'injected mock', marker: {}};

expect(jest.setMock('./target.cjs', injected)).toBe(jest);

test('setMock injects the supplied CommonJS export object', () => {
  expect(require('./target.cjs')).toBe(injected);
  expect(jest.requireMock('./target.cjs')).toBe(injected);
  expect(jest.requireActual('./target.cjs')).toEqual({kind: 'actual target'});
});

test('setMock registration and supplied identity survive resetModules', () => {
  jest.resetModules();

  expect(require('./target.cjs')).toBe(injected);
});
