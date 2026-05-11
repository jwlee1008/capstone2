if (!Array.prototype.toReversed) {
  Object.defineProperty(Array.prototype, 'toReversed', {
    configurable: true,
    value() {
      return Array.from(this).reverse();
    },
  });
}
