describe('calculator', () => {
  test('adds values', () => {
    expect(1 + 2).toBe(3);
  });

  it('supports nested equality and asymmetrics', () => {
    expect({answer: 42, tags: ['rust', 'jest']}).toEqual({
      answer: expect.any(Number),
      tags: expect.arrayContaining(['jest']),
    });
  });
});
