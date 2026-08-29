test('replaceProperty updates, reuses, and restores an own property', () => {
  const target = {value: 1};
  const first = jest.replaceProperty(target, 'value', 2);
  const second = jest.replaceProperty(target, 'value', 3);

  expect(second).toBe(first);
  expect(target.value).toBe(3);
  expect(first.replaceValue('changed')).toBe(first);
  expect(target.value).toBe('changed');

  first.restore();
  expect(target.value).toBe(1);
});

test('restoreAllMocks removes an inherited replacement', () => {
  const parent = {value: 'parent'};
  const target = Object.create(parent);

  jest.replaceProperty(target, 'value', 'child');
  expect(target.value).toBe('child');
  expect(Object.hasOwn(target, 'value')).toBe(true);

  jest.restoreAllMocks();
  expect(target.value).toBe('parent');
  expect(Object.hasOwn(target, 'value')).toBe(false);
});

test('replaceProperty rejects accessors, functions, and missing keys', () => {
  expect(() => jest.replaceProperty({}, 'missing', 1)).toThrow(
    'Property `missing` does not exist in the provided object',
  );
  expect(() => jest.replaceProperty({method() {}}, 'method', 1)).toThrow(
    "Cannot replace the `method` property because it is a function",
  );
  expect(() =>
    jest.replaceProperty(
      {
        get value() {
          return 1;
        },
      },
      'value',
      2,
    ),
  ).toThrow('Cannot replace the `value` property because it has a getter');
});

test('number and symbol keys work on objects and functions', () => {
  const symbol = Symbol('value');
  const target = function target() {};
  Object.defineProperties(target, {
    0: {configurable: true, value: 'zero', writable: true},
    [symbol]: {configurable: true, value: 'symbol', writable: true},
  });

  jest.replaceProperty(target, 0, 'changed zero');
  jest.replaceProperty(target, symbol, 'changed symbol');
  expect(target[0]).toBe('changed zero');
  expect(target[symbol]).toBe('changed symbol');

  jest.restoreAllMocks();
  expect(target[0]).toBe('zero');
  expect(target[symbol]).toBe('symbol');
});

test('clearAllMocks and resetAllMocks do not restore replaced properties', () => {
  const target = {value: 'original'};
  const replaced = jest.replaceProperty(target, 'value', 'replaced');

  jest.clearAllMocks();
  expect(target.value).toBe('replaced');
  jest.resetAllMocks();
  expect(target.value).toBe('replaced');

  replaced.restore();
  replaced.restore();
  expect(target.value).toBe('original');
  const next = jest.replaceProperty(target, 'value', 'new');
  expect(next.restore).not.toBe(replaced.restore);
  next.restore();
});

test('restoreAllMocks restores spies and properties together', () => {
  const target = {
    method() {
      return 'actual';
    },
    value: 'actual',
  };
  jest.spyOn(target, 'method').mockReturnValue('mocked');
  jest.replaceProperty(target, 'value', 'mocked');

  jest.restoreAllMocks();

  expect(target.method()).toBe('actual');
  expect(target.value).toBe('actual');
});

test('replaceProperty rejects primitive, setter, and nonconfigurable targets', () => {
  expect(() => jest.replaceProperty(null, 'value', 1)).toThrow(
    'Cannot use replaceProperty on a primitive value; null given',
  );
  expect(() => jest.replaceProperty({}, null, 1)).toThrow(
    'No property name supplied',
  );
  expect(() => {
    const target = {};
    Object.defineProperty(target, 'value', {
      configurable: false,
      value: 1,
    });
    jest.replaceProperty(target, 'value', 2);
  }).toThrow('Property `value` is not declared configurable');
  expect(() =>
    jest.replaceProperty(
      {
        set value(_value) {},
      },
      'value',
      2,
    ),
  ).toThrow('Cannot replace the `value` property because it has a setter');
});
