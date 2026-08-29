const dependency = require('./dependency.cjs');

module.exports = {
  dependencyRead: dependency.read,
  leafRead: dependency.leafRead,
  read() {
    return `entry:${dependency.read()}`;
  },
};
