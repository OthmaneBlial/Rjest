test('runs setup files in the Jest lifecycle order', () => {
  expect(globalThis.__rjestSetupState).toMatchObject({
    afterEnvExpectType: 'function',
    afterEnvTestType: 'function',
    documentType: 'object',
    expectType: 'undefined',
    jestType: 'object',
    order: ['setupFiles', 'setupFilesAfterEnv'],
    testType: 'undefined',
  });
  expect(globalThis.__rjestSetupState.setupMock('value')).toBe('setup:value');
  expect(globalThis.__rjestSetupState.setupMock).toHaveBeenCalledWith('value');
});
