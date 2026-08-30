describe('processed results', () => {
  test('passes', () => {
    expect(process.env.RJEST_PROCESSOR_SETUP).toBe('setup');
  });

  test.skip('stays pending', () => {});
  test.todo('stays todo');
});
