describe('snapshot compatibility', () => {
  test('serializes common JavaScript values', () => {
    expect({
      count: 42,
      enabled: true,
      nested: {labels: ['rust', 'jest'], missing: undefined},
      nothing: null,
      pattern: /rjest/i,
    }).toMatchSnapshot();
  });

  test('serializes multiline strings', () => {
    expect('line one\nline two').toMatchSnapshot('multiline');
  });

  test('serializes sets', () => {
    expect(new Set(['native', 'deterministic'])).toMatchSnapshot('set');
  });
});
