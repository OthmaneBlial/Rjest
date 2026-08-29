jest.mock('./dependency.cjs', () => {
  const actual = jest.requireActual('./dependency.cjs');
  return {
    ...actual,
    calculate: jest.fn((left, right) => left * right),
    label: 'mocked',
  };
});
jest.mock('./automatic.cjs');

const dependency = require('./dependency.cjs');
const automatic = require('./automatic.cjs');

test('uses an explicit CommonJS module factory', () => {
  expect(dependency.calculate(3, 4)).toBe(12);
  expect(dependency.calculate).toHaveBeenCalledWith(3, 4);
  expect(dependency.label).toBe('mocked');
  expect(jest.requireActual('./dependency.cjs').calculate(3, 4)).toBe(7);
});

test('generates recursive automatic mocks', () => {
  expect(jest.isMockFunction(automatic.work)).toBe(true);
  expect(jest.isMockFunction(automatic.nested.transform)).toBe(true);
  expect(automatic.values).toEqual([]);
  expect(automatic.label).toBe('kept');
  automatic.work('input');
  expect(automatic.work).toHaveBeenCalledWith('input');
});

test('creates standalone module mocks', () => {
  const generated = jest.createMockFromModule('./automatic.cjs');
  expect(jest.isMockFunction(generated.work)).toBe(true);
  expect(generated.values).toEqual([]);
});

test('spies on getters and setters', () => {
  const getterSubject = {
    get value() {
      return 'initial';
    },
  };
  let stored = 'initial';
  const setterSubject = {
    set value(next) {
      stored = next;
    },
  };
  const getter = jest.spyOn(getterSubject, 'value', 'get');
  const setter = jest.spyOn(setterSubject, 'value', 'set');
  expect(getterSubject.value).toBe('initial');
  setterSubject.value = 'changed';
  expect(getter).toHaveBeenCalledTimes(1);
  expect(setter).toHaveBeenCalledWith('changed');
  expect(stored).toBe('changed');
  jest.restoreAllMocks();
  expect(
    jest.isMockFunction(
      Object.getOwnPropertyDescriptor(getterSubject, 'value').get,
    ),
  ).toBe(false);
  expect(
    jest.isMockFunction(
      Object.getOwnPropertyDescriptor(setterSubject, 'value').set,
    ),
  ).toBe(false);
  setterSubject.value = 'restored';
  expect(stored).toBe('restored');
  expect(getter).toHaveBeenCalledTimes(1);
  expect(setter).toHaveBeenCalledTimes(1);
});
