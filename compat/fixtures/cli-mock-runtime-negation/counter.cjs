globalThis.cliNegationEvaluations = (globalThis.cliNegationEvaluations ?? 0) + 1;

module.exports = {evaluation: globalThis.cliNegationEvaluations};
