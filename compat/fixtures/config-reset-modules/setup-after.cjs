jest.mock('./mocked.cjs', () => ({kind: 'factory mock', marker: {}}));
globalThis.resetModulesSetupActual = require('./counter.cjs');
globalThis.resetModulesSetupMock = require('./mocked.cjs');
