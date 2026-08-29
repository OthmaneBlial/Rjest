const {classify} = require('./math');

test('covers one branch', () => {
  expect(classify(2)).toBe('positive');
});
