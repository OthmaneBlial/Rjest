module.exports = {
  createTransformer(config) {
    return {
      async processAsync(source, filename, options) {
        await Promise.resolve();
        if (!options.supportsStaticESM) {
          throw new Error(`Expected ESM transform options for ${filename}`);
        }
        return {
          code: source.replaceAll('__ASYNC_TRANSFORM_VALUE__', String(config.value)),
        };
      },
    };
  },
};
