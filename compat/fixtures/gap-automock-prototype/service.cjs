class Service {
  dispatch(value) {
    return `actual:${value}`;
  }
}

const service = new Service();
Object.defineProperty(module.exports, '__esModule', {value: true});
Object.defineProperty(module.exports, 'service', {
  enumerable: true,
  get: () => service,
});
