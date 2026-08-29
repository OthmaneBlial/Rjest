test('jest.getSeed exposes the run seed as an integer', () => {
  const seed = jest.getSeed();
  expect(Number.isInteger(seed)).toBe(true);
  expect(seed).toBe(-12345);
});
