const {value} = require('./shared.cjs');

test('alpha observes the shared dependency', () => {
  expect(value).toBe(1);
});
