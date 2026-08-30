test('withImplementation temporarily replaces a mock and returns undefined', () => {
  const mock = jest.fn(value => `default:${value}`);
  const calls = [];

  const result = mock.withImplementation(
    value => `temporary:${value}`,
    () => {
      calls.push(mock('inside'));
      return 'ignored callback result';
    },
  );

  calls.push(mock('outside'));
  expect(result).toBeUndefined();
  expect(calls).toEqual(['temporary:inside', 'default:outside']);
});

test('async withImplementation restores only after fulfillment', async () => {
  const mock = jest.fn(() => 'default');
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const calls = [];

  const pending = mock.withImplementation(
    () => 'temporary',
    async () => {
      calls.push(mock());
      await gate;
      calls.push(mock());
      return 'ignored async result';
    },
  );

  calls.push(mock());
  release();
  await expect(pending).resolves.toBeUndefined();
  calls.push(mock());

  expect(calls).toEqual([
    'temporary',
    'temporary',
    'temporary',
    'default',
  ]);
});

test('temporary implementations isolate and preserve queued once values', () => {
  const mock = jest
    .fn(() => 'default')
    .mockReturnValueOnce('outside once');

  mock.withImplementation(
    () => 'temporary',
    () => {
      mock.mockReturnValueOnce('inside once');
      expect(mock()).toBe('inside once');
      expect(mock()).toBe('temporary');
      mock.mockReturnValueOnce('discarded inside once');
    },
  );

  expect(mock()).toBe('outside once');
  expect(mock()).toBe('default');
});

test('nested temporary implementations restore each surrounding layer', () => {
  const mock = jest.fn(() => 'default');
  const calls = [];

  mock.withImplementation(
    () => 'outer',
    () => {
      calls.push(mock());
      mock.withImplementation(
        () => 'inner',
        () => calls.push(mock()),
      );
      calls.push(mock());
    },
  );
  calls.push(mock());

  expect(calls).toEqual(['outer', 'inner', 'outer', 'default']);
});

test('failed callbacks retain the temporary implementation like Jest', async () => {
  const syncMock = jest.fn(() => 'sync default');
  expect(() =>
    syncMock.withImplementation(
      () => 'sync temporary',
      () => {
        throw new Error('sync failure');
      },
    ),
  ).toThrow('sync failure');
  expect(syncMock()).toBe('sync temporary');

  const asyncMock = jest.fn(() => 'async default');
  await expect(
    asyncMock.withImplementation(
      () => 'async temporary',
      async () => {
        throw new Error('async failure');
      },
    ),
  ).rejects.toThrow('async failure');
  expect(asyncMock()).toBe('async temporary');
});
