const {jest: jestObject} = require('@jest/globals');

const injected = {kind: 'nested injected mock'};
const returned = jestObject.setMock('./local-target.cjs', injected);

module.exports = {injected, jestObject, returned};
