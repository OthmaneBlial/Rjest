import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {TestEnvironment: JsdomEnvironment} = require(
  path.join(
    process.env.RJEST_COMPAT_TOOL_NODE_MODULES,
    'jest-environment-jsdom',
  ),
);

await Promise.resolve();

export default class FixtureJsdomEnvironment extends JsdomEnvironment {
  constructor(config, context) {
    super(config, context);
    this.testPath = context.testPath;
    this.global.environmentModuleKind = 'top-level-await-esm';
  }

  async setup() {
    await super.setup();
    this.global.environmentJsdomSetup = this.global.document.readyState;
  }

  async teardown() {
    writeFileSync(
      path.join(path.dirname(this.testPath), 'environment-teardown.json'),
      JSON.stringify({
        moduleKind: this.global.environmentModuleKind,
        url: this.global.location.href,
      }),
    );
    await super.teardown();
  }
}
