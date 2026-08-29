const hookTarget = require('hook-target');
const mainFieldTarget = require('@rjest-fixture/math');
const aliasTarget = require('resolver-alias');
const extensionTarget = require('./targets/extension.js');

test('uses the sync hook for CommonJS', () => {
  expect(hookTarget.source).toBe('sync');
});

test('forwards mutable options to the synchronous default resolver', () => {
  expect(mainFieldTarget.source).toBe('module');
  expect(aliasTarget.source).toBe('alias');
  expect(extensionTarget.source).toBe('extension-alias');
});
