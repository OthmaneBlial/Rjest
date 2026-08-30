const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = async () => {
  writeFileSync(join(__dirname, 'setup-started.txt'), 'setup started\n');
  await Promise.resolve();
  throw new Error('intentional global setup failure');
};
