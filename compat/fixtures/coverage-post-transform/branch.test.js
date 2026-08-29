const {classify} = require('./branch');

test('covers one transformed branch', () => {
  expect(classify(1)).toBe('positive');
});
