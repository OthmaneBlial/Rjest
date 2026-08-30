import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const dependency = require('./value.cjs');

test('loads a relative CommonJS dependency from an ESM test', () => {
  expect(dependency).toEqual({value: 42});
  expect(globalThis.setupValue).toBe(73);
});
