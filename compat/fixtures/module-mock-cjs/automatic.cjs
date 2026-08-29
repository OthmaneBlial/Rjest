module.exports = {
  work(value) {
    return value * 2;
  },
  nested: {
    transform(value) {
      return value.toUpperCase();
    },
  },
  values: [1, 2, 3],
  label: 'kept',
};
