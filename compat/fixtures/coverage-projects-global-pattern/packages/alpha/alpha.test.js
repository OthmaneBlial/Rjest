const {classify} = require('./alpha');

test('classifies positive values', () => {
  expect(classify(2)).toBe('positive');
});
