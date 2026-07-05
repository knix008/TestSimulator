const { formatError } = require('./errorFormat');

function success(payload = {}) {
  return { ok: true, ...payload };
}

function failure(error, message) {
  if (typeof error === 'string') {
    return {
      ok: false,
      message: message || error,
      details: error
    };
  }

  return {
    ok: false,
    message: message || error?.message || '오류가 발생했습니다.',
    details: formatError(error)
  };
}

function wrapHandler(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return failure(error);
    }
  };
}

module.exports = {
  success,
  failure,
  wrapHandler
};
