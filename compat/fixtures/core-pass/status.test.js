describe('status controls', () => {
  test.skip('skipped test', () => {
    throw new Error('must not run');
  });

  test.todo('future behavior');

  describe.skip('skipped suite', () => {
    test('nested skip', () => {
      throw new Error('must not run');
    });
  });
});
