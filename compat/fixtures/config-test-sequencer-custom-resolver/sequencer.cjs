module.exports = class ResolverMappedSequencer {
  sort(tests) {
    return [...tests].sort((left, right) =>
      right.path.localeCompare(left.path)
    );
  }

  cacheResults() {}
};
