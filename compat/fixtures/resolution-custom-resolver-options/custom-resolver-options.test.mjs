import {expect, test} from '@jest/globals';
import {source as hookSource} from 'hook-target';
import mainFieldTarget from '@rjest-fixture/math';
import aliasTarget from 'resolver-alias';
import extensionTarget from './targets/extension.js';

test('uses the async hook for native ESM', async () => {
  expect(hookSource).toBe('async');
  expect((await import('hook-target')).source).toBe('async');
});

test('forwards mutable options to the asynchronous default resolver', () => {
  expect(mainFieldTarget.source).toBe('module');
  expect(aliasTarget.source).toBe('alias');
  expect(extensionTarget.source).toBe('extension-alias');
});
