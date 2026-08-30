describe('reporter lifecycle', () => {
  test('records one assertion', () => {
    expect(1 + 1).toBe(2);
  });

  test('records two assertions', () => {
    expect('rjest').toContain('jest');
    expect({ready: true}).toEqual({ready: true});
  });
});
