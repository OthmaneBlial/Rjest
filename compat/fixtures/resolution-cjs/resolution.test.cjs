const {multiply} = require('./math.cjs');

describe('CommonJS resolution', () => {
  test('loads a relative module with require', () => {
    expect(multiply(6, 7)).toBe(42);
  });
});
