const {classify} = require('./math');

test('covers the positive branch', () => {
  expect(classify(2)).toBe('positive');
});
