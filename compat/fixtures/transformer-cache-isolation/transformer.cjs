require('./consumer.cjs');

module.exports = {
  process(source) {
    return {code: source};
  },
};
