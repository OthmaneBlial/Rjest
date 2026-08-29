const outside = require('./counter.cjs');

test('isolates the CommonJS module registry for the callback', () => {
  expect(outside).toBe(1);

  jest.isolateModules(() => {
    expect(require('./counter.cjs')).toBe(2);
  });
  expect(require('./counter.cjs')).toBe(outside);

  jest.isolateModules(() => {
    expect(require('./counter.cjs')).toBe(3);
  });
  expect(jest.isolateModules(() => {})).toBe(jest);
});
