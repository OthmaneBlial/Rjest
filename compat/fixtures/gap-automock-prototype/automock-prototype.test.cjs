jest.mock('./service.cjs');

const {service} = require('./service.cjs');

test('automatic mocks include methods inherited from an object prototype', () => {
  expect(service.dispatch).toEqual(expect.any(Function));
  service.dispatch.mockReturnValue('mocked');
  expect(service.dispatch('value')).toBe('mocked');
  expect(service.dispatch).toHaveBeenCalledWith('value');
});

test('spyOn replaces and restores a getter-backed function export', () => {
  const original = jest.fn(value => `actual:${value}`);
  const barrel = {};
  Object.defineProperty(barrel, 'dispatch', {
    configurable: true,
    enumerable: true,
    get: () => original,
  });

  const spy = jest.spyOn(barrel, 'dispatch');
  expect(barrel.dispatch('value')).toBe('actual:value');
  expect(spy).toHaveBeenCalledWith('value');
  spy.mockRestore();
  expect(barrel.dispatch).toBe(original);
});

test('automock metadata side effects use an isolated mock registry', () => {
  jest.isolateModules(() => {
    jest.mock('./metadata-dependency.cjs');
    jest.mock('./metadata-side-effect.cjs');

    const {hook} = require('./metadata-dependency.cjs');
    require('./metadata-side-effect.cjs');

    expect(hook).not.toHaveBeenCalled();
  });
});
