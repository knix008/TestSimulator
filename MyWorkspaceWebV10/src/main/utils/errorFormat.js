function formatError(error) {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  const lines = [];
  const message = error.message || String(error);
  lines.push(message);

  if (error.code) {
    lines.push(`Code: ${error.code}`);
  }

  if (error.stack) {
    lines.push('');
    lines.push(error.stack);
  }

  if (error.cause) {
    lines.push('');
    lines.push('Caused by:');
    lines.push(formatError(error.cause));
  }

  return lines.join('\n').trim();
}

function errorSummary(error, fallback = '오류가 발생했습니다.') {
  if (!error) {
    return fallback;
  }
  if (typeof error === 'string') {
    return error.split('\n')[0] || fallback;
  }
  return error.message || fallback;
}

module.exports = {
  formatError,
  errorSummary
};
