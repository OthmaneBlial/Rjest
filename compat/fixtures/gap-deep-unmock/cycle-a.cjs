exports.name = 'a';

const child = require('./cycle-b.cjs');

exports.childRead = child.read;
exports.read = function read() {
  return `a:${child.read()}`;
};
