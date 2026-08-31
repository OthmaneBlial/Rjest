test('allows a rejection handled on the next event-loop turn', async () => {
  const rejection = Promise.reject(new Error('handled later'));

  await new Promise(resolve => setTimeout(resolve, 0));
  await expect(rejection).rejects.toThrow('handled later');
});
