test('loads a factory-backed module which does not exist on disk', () => {
  jest.mock(
    'rjest-virtual-package',
    () => ({answer: 42}),
    {virtual: true},
  );

  expect(require('rjest-virtual-package')).toEqual({answer: 42});
});

test('supports doMock for virtual relative paths', () => {
  jest.doMock('./missing/config.json', () => ({enabled: true}), {
    virtual: true,
  });

  expect(require('./missing/config.json')).toEqual({enabled: true});
});
