const callLoaderFromAnotherDirectory = require('./consumer/call-loader');

test('binds the injected jest object to the module that defines the function', () => {
  expect(callLoaderFromAnotherDirectory()).toEqual({source: 'library actual'});
});
