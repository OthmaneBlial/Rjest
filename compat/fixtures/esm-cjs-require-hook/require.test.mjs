import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const dependency = require('./value.cjs');
const packageDependency = require('@rjest-fixture/math');

test('loads a relative CommonJS dependency from an ESM test', () => {
  expect(dependency).toEqual({value: 42});
  expect(packageDependency).toEqual({condition: 'require', setupValue: 73});
  expect(globalThis.setupValue).toBe(73);
  expect(globalThis.setupCondition).toBe('import');
});
