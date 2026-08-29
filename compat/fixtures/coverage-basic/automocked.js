function initialize() {
  return 'initialized';
}

const initialized = initialize();

function unused() {
  return 'unused';
}

module.exports = {initialize, initialized, unused};
