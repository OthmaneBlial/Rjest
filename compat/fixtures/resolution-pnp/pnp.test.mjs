import {createRequire} from 'node:module';
import {expect, jest, test} from '@jest/globals';
import {flavor as staticFlavor} from 'pnp-conditional';

const require = createRequire(import.meta.url);

jest.unstable_mockModule('pnp-mock-target', () => ({value: 'mocked'}));

test('uses PnP import and require export conditions', async () => {
  expect(process.versions.pnp).toBeTruthy();
  expect(staticFlavor).toBe('import');
  await expect(import('pnp-conditional')).resolves.toMatchObject({
    flavor: 'import',
  });
  expect(require('pnp-conditional')).toEqual({flavor: 'require'});
});

test('mocks a PnP-resolved ESM package', async () => {
  await expect(import('pnp-mock-target')).resolves.toMatchObject({
    value: 'mocked',
  });
});

test('surfaces undeclared PnP dependency errors', () => {
  expect(() => require('pnp-conditional/undeclared')).toThrow(
    /isn't declared in its dependencies/,
  );
});

test('uses the runner snapshot formatter without a project declaration', () => {
  expect({
    display: 'flex',
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'center',
  }).toMatchInlineSnapshot(`
    {
      "alignItems": "flex-start",
      "display": "flex",
      "flexDirection": "row",
      "justifyContent": "center",
    }
  `);
});
