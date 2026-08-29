const child = require('./factory-child.cjs');

module.exports = {
  childRead: child.read,
  read() {
    return `factory entry:${child.read()}`;
  },
};
