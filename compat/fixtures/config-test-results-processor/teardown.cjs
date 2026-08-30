const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = async () => {
  process.env.RJEST_PROCESSOR_TEARDOWN = 'teardown';
  writeFileSync(join(__dirname, 'teardown-complete.txt'), 'complete\n');
};
