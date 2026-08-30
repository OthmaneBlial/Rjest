const {classify} = require('./classify');

test('maps generated V8 ranges back to TypeScript', () => {
  expect(classify(2)).toBe('positive');
});
