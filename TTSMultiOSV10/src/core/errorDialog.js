export function formatError(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n\n${error.stack || ''}`.trim();
  }

  return typeof error === 'string' ? error : JSON.stringify(error, null, 2);
}
