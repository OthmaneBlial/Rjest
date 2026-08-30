const dependency = require('virtual-transform-dependency');

module.exports = {
  process() {
    return { code: dependency.transformedSource };
  },
};
