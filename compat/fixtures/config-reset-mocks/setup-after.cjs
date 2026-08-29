globalThis.resetMocksSetupMock = jest.fn(() => 'setup implementation');
globalThis.resetMocksSetupTarget = {
  method() {
    return 'actual method';
  },
  value: 'actual value',
};

jest
  .spyOn(globalThis.resetMocksSetupTarget, 'method')
  .mockReturnValue('setup spy implementation');
jest.replaceProperty(
  globalThis.resetMocksSetupTarget,
  'value',
  'setup replaced value',
);
