// Error types shared by the core and the HTTP layer.
// Every error that reaches the UI has a stable `code` (the UI translates by code) and an English `message`.

export class AppError extends Error {
  /**
   * @param {string} code    stable machine code, e.g. 'ISSUE_NOT_FOUND'
   * @param {string} message English text
   * @param {number} [status] HTTP status
   * @param {object} [details]
   */
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
  toJSON() {
    const e = { code: this.code, message: this.message };
    if (this.details !== undefined) e.details = this.details;
    return e;
  }
}

export class ValidationError extends AppError {
  constructor(code, message, details) { super(code, message, 400, details); this.name = 'ValidationError'; }
}
export class NotFoundError extends AppError {
  constructor(code, message, details) { super(code, message, 404, details); this.name = 'NotFoundError'; }
}
export class ConflictError extends AppError {
  /** @param {object} [current] the current row, sent as details.current */
  constructor(message = 'The item was changed by someone else', current = null, code = 'CONFLICT') {
    super(code, message, 409, { current });
    this.name = 'ConflictError';
  }
}
export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', message = 'You do not have permission to do this') { super(code, message, 403); this.name = 'ForbiddenError'; }
}
export class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = 'Login required') { super(code, message, 401); this.name = 'UnauthorizedError'; }
}

/** Throws a ValidationError unless `cond` holds. */
export function check(cond, code, message, details) {
  if (!cond) throw new ValidationError(code, message, details);
}

/** Throws NotFoundError when `row` is null/undefined, else returns it. */
export function found(row, code, message) {
  if (row == null) throw new NotFoundError(code, message);
  return row;
}
