test('reports a top-level declaration', () => {
  expect(true).toBe(true);
});

describe('nested suite', () => {
  test('reports an indented declaration', () => {
    expect(true).toBe(true);
  });
});
