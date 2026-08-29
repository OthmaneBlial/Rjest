await Promise.resolve();

async function createTransformer(config) {
  await Promise.resolve();
  return {
    async processAsync(source, filename, options) {
      await Promise.resolve();
      if (!options.supportsStaticESM) {
        throw new Error(`Expected ESM transform options for ${filename}`);
      }
      return {
        code: source
          .replaceAll('__ASYNC_TRANSFORM_VALUE__', String(config.value))
          .replace(
            '__INJECTED_EXPORT__',
            "export {value as injected} from './inserted.mjs';",
          ),
      };
    },
  };
}

export default {createTransformer};
