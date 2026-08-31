test('does not wait for a later rejection handler by default', async () => {
  const rejection = Promise.reject(new Error('handled too late'));

  await new Promise(resolve => setTimeout(resolve, 0));
  await expect(rejection).rejects.toThrow('handled too late');
});
