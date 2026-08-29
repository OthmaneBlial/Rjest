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
