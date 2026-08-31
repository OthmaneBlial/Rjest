let beforeAllValue;

beforeAll(async () => {
  const rejection = Promise.reject(new Error('beforeAll handled later'));
  await new Promise(resolve => setTimeout(resolve, 0));
  await rejection.catch(error => {
    beforeAllValue = error.message;
  });
});

afterAll(async () => {
  const rejection = Promise.reject(new Error('afterAll handled later'));
  await new Promise(resolve => setTimeout(resolve, 0));
  await rejection.catch(() => {});
});

test('waits at hook completion boundaries', () => {
  expect(beforeAllValue).toBe('beforeAll handled later');
});
