globalThis.cliNegationMock = jest.fn(() => 'setup implementation');
globalThis.cliNegationTarget = {
  method() {
    return 'actual';
  },
};
jest.spyOn(globalThis.cliNegationTarget, 'method').mockReturnValue('mocked');
globalThis.cliNegationSetupInstance = require('./counter.cjs');
