function isError(error) {
  return error !== null && typeof error === 'object' && Object.prototype.hasOwnProperty.call(error, 'message');
}
function unknownToError(error) {
  if (isError(error)) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}
export { unknownToError };
//# sourceMappingURL=error.cjs.map
