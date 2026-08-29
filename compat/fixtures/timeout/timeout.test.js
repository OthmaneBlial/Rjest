test(
  'fails after its configured timeout',
  () => new Promise(() => {}),
  20,
);

test('continues after a timeout', () => {
  expect(true).toBe(true);
});
