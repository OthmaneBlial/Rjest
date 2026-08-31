test('routes matching calls and preserves the user fallback', () => {
  const fallback = value => `default:${value}`;
  const mock = jest.fn(fallback);

  expect(mock.getMockImplementation()).toBe(fallback);
  mock.whenCalledWith('alpha').mockReturnValue('A');
  mock.whenCalledWith('beta').mockImplementation(value => value.toUpperCase());

  expect(mock('alpha')).toBe('A');
  expect(mock('beta')).toBe('BETA');
  expect(mock('other')).toBe('default:other');
  expect(mock.getMockImplementation()).toBe(fallback);
});

test('matches asymmetric, nested, iterable, and trailing undefined values', () => {
  const mock = jest.fn();
  mock
    .whenCalledWith({roles: expect.arrayContaining(['admin'])})
    .mockReturnValue('object');
  mock.whenCalledWith(new Map([['key', 1]])).mockReturnValue('map');
  mock.whenCalledWith(new Set([1, 2])).mockReturnValue('set');
  mock.whenCalledWith(1).mockReturnValue('undefined');

  expect(mock({roles: ['editor', 'admin']})).toBe('object');
  expect(mock(new Map([['key', 1]]))).toBe('map');
  expect(mock(new Set([2, 1]))).toBe('set');
  expect(mock(1, undefined)).toBe('undefined');
  expect(mock(1, 2)).toBeUndefined();
});

test('drains overlapping branch one-shots before the latest persistent branch', () => {
  const mock = jest.fn(() => 'fallback');
  mock
    .whenCalledWith(expect.objectContaining({a: 1}))
    .mockReturnValueOnce('A1')
    .mockReturnValueOnce('A2');
  mock
    .whenCalledWith(expect.objectContaining({b: 2}))
    .mockReturnValueOnce('B1')
    .mockReturnValue('persistent');

  const value = {a: 1, b: 2};
  expect([mock(value), mock(value), mock(value), mock(value)]).toEqual([
    'A1',
    'A2',
    'B1',
    'persistent',
  ]);
});

test('the newest persistent branch wins and only the selected branch records calls', () => {
  const mock = jest.fn();
  const first = mock.whenCalledWith('x').mockReturnValue('first');
  const second = mock.whenCalledWith('x').mockReturnValue('second');

  expect(first).not.toBe(second);
  expect(mock('x')).toBe('second');
  expect(first.mock.calls).toEqual([]);
  expect(second.mock.calls).toEqual([['x']]);
});

test('parent one-shot implementations take precedence over branches', () => {
  const mock = jest.fn();
  mock.whenCalledWith('x').mockReturnValue('branch');
  mock.mockReturnValueOnce('parent once');

  expect(mock('x')).toBe('parent once');
  expect(mock('x')).toBe('branch');
});

test('matched and unmatched calls preserve context and parent call state', () => {
  const mock = jest.fn(function fallback() {
    return this;
  });
  const branch = mock.whenCalledWith('matched').mockImplementation(function () {
    return this;
  });
  const context = {tag: 'context'};

  expect(mock.call(context, 'matched')).toBe(context);
  expect(mock.call(context, 'other')).toBe(context);
  expect(mock.mock.calls).toEqual([['matched'], ['other']]);
  expect(branch.mock.calls).toEqual([['matched']]);
  expect(branch.mock.contexts).toEqual([context]);
});

test('mockClear preserves branches while mockReset clears them and their state', () => {
  const mock = jest.fn(() => 'fallback');
  const branch = mock.whenCalledWith('x').mockReturnValue('branch');
  expect(mock('x')).toBe('branch');

  mock.mockClear();
  expect(mock.mock.calls).toEqual([]);
  expect(mock('x')).toBe('branch');

  mock.mockReset();
  expect(mock('x')).toBeUndefined();
  expect(mock.getMockImplementation()).toBeUndefined();
  expect(branch.getMockImplementation()).toBeUndefined();
  expect(mock.whenCalledWith('x')).not.toBe(branch);
});

test('sub-mock reset leaves sibling branches and fallback intact', () => {
  const mock = jest.fn(() => 'fallback');
  const first = mock.whenCalledWith('a').mockReturnValue('A');
  mock.whenCalledWith('b').mockReturnValue('B');

  first.mockReset();
  expect(mock('a')).toBe('fallback');
  expect(mock('b')).toBe('B');
  expect(mock('other')).toBe('fallback');
});

test('supports promise helpers and constructor calls on branches', async () => {
  const asyncMock = jest.fn();
  asyncMock.whenCalledWith('ok').mockResolvedValue('resolved');
  asyncMock.whenCalledWith('bad').mockRejectedValue(new Error('rejected'));
  await expect(asyncMock('ok')).resolves.toBe('resolved');
  await expect(asyncMock('bad')).rejects.toThrow('rejected');

  const Constructor = jest.fn();
  const branch = Constructor.whenCalledWith('A').mockImplementation(() => ({
    kind: 'made',
  }));
  expect(new Constructor('A')).toEqual({kind: 'made'});
  expect(branch.mock.instances).toHaveLength(1);
});

test('temporary implementations take precedence and restore branch routing', () => {
  const mock = jest.fn(() => 'fallback');
  mock.whenCalledWith('x').mockReturnValue('X');

  mock.withImplementation(
    () => 'temporary',
    () => {
      expect(mock('x')).toBe('temporary');
      mock.whenCalledWith('y').mockReturnValue('Y');
      expect(mock('x')).toBe('X');
      expect(mock('y')).toBe('Y');
      expect(mock('other')).toBe('temporary');
    },
  );

  expect(mock('x')).toBe('X');
  expect(mock('y')).toBe('Y');
  expect(mock('other')).toBe('fallback');
});

test('spies route matches and fall through to the original implementation', () => {
  const target = {
    greet(name) {
      return `hello ${name}`;
    },
  };
  const spy = jest.spyOn(target, 'greet');
  spy.whenCalledWith('world').mockReturnValue('hi world');

  expect(target.greet('world')).toBe('hi world');
  expect(target.greet('jest')).toBe('hello jest');
  spy.mockRestore();
  expect(target.greet('world')).toBe('hello world');
});
