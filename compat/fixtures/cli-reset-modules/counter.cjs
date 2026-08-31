globalThis.cliModuleEvaluations = (globalThis.cliModuleEvaluations ?? 0) + 1;

module.exports = {evaluation: globalThis.cliModuleEvaluations};
