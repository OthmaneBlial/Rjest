/**
 * @fixture-value from-docblock
 * @jest-environment-options {"overridden":"docblock","fromDocblock":true}
 */

beforeEach(() => {
  expect(environmentCurrentHook).toBe('beforeEach');
});

afterEach(() => {
  expect(environmentCurrentHook).toBe('afterEach');
});

test('runs inside the configured custom environment', () => {
  expect(environmentConstructor).toEqual({
    consoleAvailable: true,
    fromConfig: 'configured',
    fromDocblock: true,
    overridden: 'docblock',
    pragma: 'from-docblock',
    rootDirMatches: true,
    testFile: 'custom-environment.test.js',
  });
  expect(environmentSetup).toBe('ready');
  expect(environmentRootDescribeBlock).toEqual({
    name: 'ROOT_DESCRIBE_BLOCK',
    parentIsUndefined: true,
  });
  expect(environmentCurrentTest).toBe(
    'runs inside the configured custom environment',
  );
});
