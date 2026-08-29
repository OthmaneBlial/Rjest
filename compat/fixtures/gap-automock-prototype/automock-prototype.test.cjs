jest.mock('./service.cjs');

const {service} = require('./service.cjs');

test('automatic mocks include methods inherited from an object prototype', () => {
  expect(service.dispatch).toEqual(expect.any(Function));
  service.dispatch.mockReturnValue('mocked');
  expect(service.dispatch('value')).toBe('mocked');
  expect(service.dispatch).toHaveBeenCalledWith('value');
});
