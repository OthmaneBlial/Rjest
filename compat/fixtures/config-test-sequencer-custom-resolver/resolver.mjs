import { fileURLToPath } from "node:url";

const mappings = await Promise.resolve(
  new Map([["jest-sequencer-mapped-order", "./sequencer.cjs"]])
);
const rootDir = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

export default (request, options) => {
  if (
    typeof options.defaultResolver !== "function" ||
    typeof options.defaultAsyncResolver !== "function"
  ) {
    throw new TypeError("custom resolver defaults must be functions");
  }
  const mapped = mappings.get(request);
  if (mapped) {
    if (options.basedir !== rootDir) {
      throw new Error(`unexpected resolver basedir ${options.basedir}`);
    }
    return fileURLToPath(new URL(mapped, import.meta.url));
  }
  return options.defaultResolver(request, options);
};
