const {existsSync, readFileSync, writeFileSync} = require('node:fs');
const {join} = require('node:path');

const artifact = join(__dirname, 'global-hooks.json');

exports.append = event => {
  const events = existsSync(artifact)
    ? JSON.parse(readFileSync(artifact, 'utf8'))
    : [];
  events.push(event);
  writeFileSync(artifact, `${JSON.stringify(events, null, 2)}\n`);
};
