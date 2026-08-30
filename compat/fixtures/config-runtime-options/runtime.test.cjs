const platform = require('./platform');

test('injects configured globals and prefers the default Haste platform', () => {
  expect(__DEV__).toBe(true);
  expect(nested).toEqual({value: 42});
  expect(platform).toBe('ios');
  nested.value = 7;
});

let active = 0;
let maximumActive = 0;

test.concurrent.each([1, 2, 3])('caps concurrent test %s', async () => {
  active += 1;
  maximumActive = Math.max(maximumActive, active);
  await new Promise(resolve => setTimeout(resolve, 10));
  active -= 1;
});

afterAll(() => {
  expect(maximumActive).toBe(1);
});
