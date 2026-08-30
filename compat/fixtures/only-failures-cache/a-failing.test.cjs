const {writeFileSync} = require('node:fs');

const selectedTest = process.env.ONLY_FAILURES_SKIP_PRIMER === '1' ? test.skip : test;

selectedTest('remains in the failed-test cache', () => {
  writeFileSync('failing.marker', 'failing file executed');
  expect('received').toBe('expected');
});
