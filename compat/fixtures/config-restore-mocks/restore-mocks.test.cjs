const target = {
  method() {
    return 'actual method';
  },
  value: 'actual value',
};
const standalone = jest.fn();

test('restoreMocks runs after setupFilesAfterEnv and before the first test', () => {
  expect(restoreMocksSetupTarget.method()).toBe('actual setup method');
  expect(restoreMocksSetupTarget.value).toBe('actual setup value');
});

test('a test can install spies and property replacements', () => {
  jest.spyOn(target, 'method').mockReturnValue('mocked method');
  jest.replaceProperty(target, 'value', 'mocked value');

  expect(target.method()).toBe('mocked method');
  expect(target.value).toBe('mocked value');
  standalone('first test');
});

test('restoreMocks restores both before the next test', () => {
  expect(target.method()).toBe('actual method');
  expect(target.value).toBe('actual value');
  expect(standalone).toHaveBeenCalledTimes(1);
});

describe('user beforeEach ordering', () => {
  const local = {
    method() {
      return 'actual local method';
    },
    value: 'actual local value',
  };

  beforeEach(() => {
    expect(jest.isMockFunction(local.method)).toBe(false);
    expect(local.value).toBe('actual local value');
    jest.spyOn(local, 'method').mockReturnValue('beforeEach method');
    jest.replaceProperty(local, 'value', 'beforeEach value');
  });

  test.each([1, 2])('automatic restore runs before user beforeEach %#', () => {
    expect(local.method()).toBe('beforeEach method');
    expect(local.value).toBe('beforeEach value');
  });
});
