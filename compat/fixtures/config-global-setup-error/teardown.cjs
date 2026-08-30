const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = () => {
  writeFileSync(join(__dirname, 'teardown-should-not-run.txt'), 'unexpected\n');
};
