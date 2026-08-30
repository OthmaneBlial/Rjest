const {value} = require('./shared.cjs');

test('beta observes the shared dependency', () => {
  expect(value).toBe(1);
});
