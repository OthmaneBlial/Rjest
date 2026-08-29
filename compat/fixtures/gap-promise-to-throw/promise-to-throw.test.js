test('applies toThrow with Jest promise semantics', async () => {
  await expect(Promise.resolve(undefined)).resolves.not.toThrow();
  await expect(Promise.resolve(new Error('resolved boom'))).resolves.toThrow(
    'resolved boom',
  );
  await expect(Promise.reject(new Error('rejected boom'))).rejects.toThrow(
    'rejected boom',
  );
  await expect(Promise.reject('plain rejection')).rejects.not.toThrow();
});
