const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = class StreamingReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
    this.events = [];
  }

  onTestCaseStart(_test, info) {
    this.events.push(
      `start:${info.title}:${info.fullName}:${typeof info.startedAt}:${typeof info.mode}`,
    );
    writeFileSync(join(this.rootDir, `${info.title}.started`), 'started\n');
  }

  onTestCaseResult(_test, result) {
    const startedAtType = result.startedAt === null ? 'null' : typeof result.startedAt;
    this.events.push(
      `result:${result.title}:${result.status}:${startedAtType}:${result.invocations}`,
    );
    writeFileSync(
      join(this.rootDir, `${result.title}.completed`),
      `${result.status}\n`,
    );
  }

  onRunComplete() {
    writeFileSync(
      join(this.rootDir, 'reporter-stream.json'),
      `${JSON.stringify(this.events, null, 2)}\n`,
    );
  }
};
