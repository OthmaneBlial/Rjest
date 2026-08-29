import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const aliases = await Promise.resolve(
  new Map([['tla-resolver-target', 'target.cjs']]),
);

export default {
  sync(request, options) {
    const target = aliases.get(request);
    return target
      ? path.join(directory, target)
      : options.defaultResolver(request, options);
  },
};
