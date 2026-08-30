const {writeFileSync} = require('node:fs');

writeFileSync('file-error.marker', 'file with an execution error ran');
require('./missing-module.cjs');
