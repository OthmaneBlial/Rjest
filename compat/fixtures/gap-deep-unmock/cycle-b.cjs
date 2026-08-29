const parent = require('./cycle-a.cjs');

exports.read = function read() {
  return `b:${parent.name}`;
};
