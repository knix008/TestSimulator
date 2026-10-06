/** An error that carries an HTTP status and a copyable detail block for the error dialog. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: string;

  constructor(message: string, code = "ERROR", status = 500, detail = "") {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail || message;
  }
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) {
    return new ApiError(error.message, "ERROR", 500, error.stack || error.message);
  }
  return new ApiError(String(error));
}

/** Keeps anything that looks like a credential out of error text sent to the browser. */
export function redact(text: string): string {
  return text
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1***@")
    .replace(/(password|token|secret)(["'\s:=]+)[^\s"',}]+/gi, "$1$2***");
}
