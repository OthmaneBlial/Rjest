test('uses default synchronous resolution when only async is exported', () => {
  expect(require('@rjest-fixture/math').condition).toBe('require');
  expect(() => require('async-only-target')).toThrow();
});
