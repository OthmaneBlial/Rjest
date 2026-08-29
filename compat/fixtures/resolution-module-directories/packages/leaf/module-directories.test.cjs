jest.mock('fallback-module', () => ({source: 'mocked-fallback'}));

test('uses configured absolute and ancestor-relative module directories', () => {
  expect(require('priority-module').source).toBe('absolute');
  expect(require('fallback-module').source).toBe('mocked-fallback');
  expect(jest.requireActual('fallback-module').source).toBe('root-fallback');
  expect(require.resolve('priority-module')).toContain(
    '/absolute_modules/priority-module/index.cjs',
  );
});

test('retains node_modules when it is explicitly configured', () => {
  expect(require('@rjest-fixture/math').condition).toBe('require');
});
