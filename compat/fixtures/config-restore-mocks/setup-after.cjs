globalThis.restoreMocksSetupTarget = {
  method() {
    return 'actual setup method';
  },
  value: 'actual setup value',
};

jest
  .spyOn(globalThis.restoreMocksSetupTarget, 'method')
  .mockReturnValue('mocked setup method');
jest.replaceProperty(
  globalThis.restoreMocksSetupTarget,
  'value',
  'mocked setup value',
);
