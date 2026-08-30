const {classify} = require('./math');

test('covers the other branch in another worker', () => {
  expect(classify(0)).toBe('not-positive');
});
