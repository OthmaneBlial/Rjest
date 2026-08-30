const loadActualFromDefiningModule = require('../library/load-actual');

module.exports = function callLoaderFromAnotherDirectory() {
  return loadActualFromDefiningModule();
};
