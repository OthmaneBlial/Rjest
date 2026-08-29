const loadedWithDocument = typeof document !== 'undefined';

module.exports = {
  test(value) {
    return value && value.rjestSerializerFixture === true;
  },
  serialize(value) {
    return `${loadedWithDocument ? 'document-ready' : 'document-missing'}:${value.label}`;
  },
};
