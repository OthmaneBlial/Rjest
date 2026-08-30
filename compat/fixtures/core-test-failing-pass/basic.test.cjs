test.failing('passes when a synchronous body throws', () => {
  expect(1).toBe(2);
});

it.failing('passes when an asynchronous body rejects', async () => {
  await Promise.resolve();
  throw new Error('expected rejection');
});

test.failing.each([
  [1, 2],
  [2, 3],
])('inverts parameterized assertion %#', (received, expected) => {
  expect(received).toBe(expected);
});

test.concurrent.failing('supports the concurrent declaration chain', async () => {
  await Promise.resolve();
  expect('actual').toBe('expected');
});

test.skip.failing('does not execute a skipped failing test', () => {
  throw new Error('must remain skipped');
});

xit.failing('keeps xit.failing skipped', () => {
  throw new Error('must remain skipped');
});
