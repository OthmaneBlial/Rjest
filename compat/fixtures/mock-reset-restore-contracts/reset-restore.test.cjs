afterEach(() => {
  jest.restoreAllMocks();
});

test('lastCall exists only after invocation and disappears on clear', () => {
  const mock = jest.fn();

  expect(mock.mock).not.toHaveProperty('lastCall');
  mock('first');
  mock('last', 'call');
  expect(mock.mock.lastCall).toEqual(['last', 'call']);

  expect(mock.mockClear()).toBe(mock);
  expect(mock.mock).not.toHaveProperty('lastCall');
});

test('mockClear preserves the name, implementation, and once queue', () => {
  const mock = jest
    .fn(() => 'default')
    .mockName('named mock');
  mock('recorded');
  mock.mockReturnValueOnce('once');

  expect(mock.mockClear()).toBe(mock);
  expect(mock.getMockName()).toBe('named mock');
  expect(mock.mock.calls).toEqual([]);
  expect(mock()).toBe('once');
  expect(mock()).toBe('default');
});

test('mockReset clears state, name, implementation, and once values', () => {
  const mock = jest
    .fn(() => 'default')
    .mockName('named mock')
    .mockReturnValueOnce('once');
  mock('recorded');

  expect(mock.mockReset()).toBe(mock);
  expect(mock.getMockName()).toBe('jest.fn()');
  expect(mock.mock.calls).toEqual([]);
  expect(mock.mock).not.toHaveProperty('lastCall');
  expect(mock()).toBeUndefined();
});

test('mockRestore returns undefined and restores standalone mocks and spies', () => {
  const standalone = jest.fn(() => 'value').mockName('standalone');
  standalone();
  expect(standalone.mockRestore()).toBeUndefined();
  expect(standalone.getMockName()).toBe('jest.fn()');
  expect(standalone.mock.calls).toEqual([]);
  expect(standalone()).toBeUndefined();

  const target = {method: () => 'original'};
  const original = target.method;
  const spy = jest.spyOn(target, 'method').mockReturnValue('mocked');
  expect(target.method()).toBe('mocked');
  expect(spy.mockRestore()).toBeUndefined();
  expect(target.method).toBe(original);
  expect(target.method()).toBe('original');
});

test('Symbol.dispose delegates to mockRestore for mocks and spies', () => {
  expect(typeof Symbol.dispose).toBe('symbol');

  const standalone = jest.fn(() => 'value').mockName('standalone');
  standalone('call');
  expect(standalone[Symbol.dispose]).toBe(standalone.mockRestore);
  expect(standalone[Symbol.dispose]()).toBeUndefined();
  expect(standalone.mock.calls).toEqual([]);
  expect(standalone.getMockName()).toBe('jest.fn()');
  expect(standalone()).toBeUndefined();

  const target = {method: () => 'original'};
  const original = target.method;
  const spy = jest.spyOn(target, 'method').mockReturnValue('mocked');
  expect(spy[Symbol.dispose]).toBe(spy.mockRestore);
  expect(spy[Symbol.dispose]()).toBeUndefined();
  expect(target.method).toBe(original);
});
