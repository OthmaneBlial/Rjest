const {readFileSync} = require('node:fs');

module.exports = () => readFileSync('unused');
