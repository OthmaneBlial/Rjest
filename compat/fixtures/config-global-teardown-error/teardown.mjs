import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export default async function teardown() {
  writeFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'teardown-started.txt'),
    'teardown started\n',
  );
  await Promise.resolve();
  throw new Error('intentional global teardown failure');
}
