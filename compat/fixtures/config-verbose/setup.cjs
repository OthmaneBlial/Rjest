const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = globalConfig => {
  writeFileSync(
    join(__dirname, 'verbose-config.json'),
    `${JSON.stringify({verbose: globalConfig.verbose}, null, 2)}\n`,
  );
};
