module.exports = {
  process(source) {
    return {code: source.replace('TRANSFORM_TOKEN', "'cli transformed'")};
  },
};
