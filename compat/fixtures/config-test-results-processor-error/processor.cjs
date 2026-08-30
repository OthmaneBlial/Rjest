const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = results => {
  writeFileSync(
    join(__dirname, 'processor-started.json'),
    `${JSON.stringify({passedTests: results.numPassedTests})}\n`,
  );
  throw new Error('processor exploded');
};
