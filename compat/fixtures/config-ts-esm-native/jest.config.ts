import {basename} from 'node:path';

type Config = {
  testEnvironment: 'node';
  testMatch: string[];
};

if (!basename(import.meta.dirname)) {
  throw new Error('import.meta.dirname did not identify the config directory');
}
if (!import.meta.resolve('./configured.check.cjs').startsWith('file:')) {
  throw new Error('import.meta.resolve did not return a file URL');
}

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/*.check.cjs'],
};

export default config;
