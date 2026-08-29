import {expect, test} from '@jest/globals';
import {condition} from 'condition-target';
import virtualTarget from 'virtual-target';
import {condition as packageCondition} from '@rjest-fixture/math';

test('uses import conditions for native ESM resolution', () => {
  expect(condition).toBe('import');
  expect(virtualTarget.value).toBe('actual-custom-target');
  expect(packageCondition).toBe('import');
});

test('uses the custom resolver for dynamic native ESM imports', async () => {
  expect((await import('condition-target')).condition).toBe('import');
});
