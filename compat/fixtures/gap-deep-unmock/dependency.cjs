const leaf = require('./leaf.cjs');

module.exports = {
  leafRead: leaf.read,
  read() {
    return `dependency:${leaf.read()}`;
  },
};
