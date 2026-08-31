module.exports = {
  process(source, filename) {
    if (filename.includes('/ignored/')) {
      throw new Error('ignored module was transformed');
    }
    return {code: source};
  },
};
