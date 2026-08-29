test('writes a new inline snapshot', () => {
  expect({greeting: 'hello'}).toMatchInlineSnapshot();
});

test('updates an existing template inline snapshot', () => {
  expect('fresh value').toMatchInlineSnapshot(`"stale value"`);
});

test('replaces an existing string literal inline snapshot', () => {
  expect('new string value').toMatchInlineSnapshot('"old string value"');
});

test('writes after snapshot property matching', () => {
  expect({id: 42, name: 'Ada'}).toMatchInlineSnapshot({
    id: expect.any(Number),
  });
});

test('escapes template literal metacharacters', () => {
  expect('` \\ ${value}').toMatchInlineSnapshot();
});

test('writes thrown error messages inline', () => {
  expect(() => {
    throw new Error('boom');
  }).toThrowErrorMatchingInlineSnapshot();
});

test('writes snapshots at distinct calls in one test', () => {
  expect('first call').toMatchInlineSnapshot();
  expect('second call').toMatchInlineSnapshot();
});

test('captures the callsite before awaiting a resolved value', async () => {
  await expect(Promise.resolve({async: true})).resolves.toMatchInlineSnapshot();
});

let retryAttempt = 0;
jest.retryTimes(1);
test('discards inline writes from a failed retry attempt', () => {
  retryAttempt += 1;
  expect(retryAttempt).toMatchInlineSnapshot();
  if (retryAttempt === 1) throw new Error('retry after writing');
});
