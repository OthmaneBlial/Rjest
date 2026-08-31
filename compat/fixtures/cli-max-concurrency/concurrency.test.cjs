let active = 0;
let maximumActive = 0;

test.concurrent.each([1, 2])('runs concurrent body %s under the CLI cap', async () => {
  active += 1;
  maximumActive = Math.max(maximumActive, active);
  await new Promise(resolve => setTimeout(resolve, 20));
  active -= 1;
});

afterAll(() => {
  expect(maximumActive).toBe(2);
});
