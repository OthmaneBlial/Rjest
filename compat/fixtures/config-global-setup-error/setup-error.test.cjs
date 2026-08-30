const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

test('does not execute after setup fails', () => {
  writeFileSync(join(__dirname, 'test-should-not-run.txt'), 'unexpected\n');
  throw new Error('test should not execute');
});
