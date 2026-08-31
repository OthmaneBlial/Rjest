globalThis.cliRestoreTarget = {
  method() {
    return 'actual';
  },
};

jest.spyOn(globalThis.cliRestoreTarget, 'method').mockReturnValue('mocked');
