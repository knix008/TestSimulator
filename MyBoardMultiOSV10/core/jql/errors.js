// JqlError: a ValidationError with a position into the query text.
import { ValidationError } from '../errors.js';

export class JqlError extends ValidationError {
  /**
   * @param {'JQL_SYNTAX'|'JQL_UNKNOWN_FIELD'|'JQL_BAD_OPERATOR'|'JQL_BAD_VALUE'|'JQL_UNKNOWN_FUNCTION'} code
   * @param {string} message English text
   * @param {number} position 0-based offset into the query text
   * @param {number} [length] length of the offending text
   * @param {string[]} [expected] what would have been valid here
   */
  constructor(code, message, position, length = 0, expected = undefined) {
    const details = { position, length };
    if (expected) details.expected = expected;
    super(code, message, details);
    this.name = 'JqlError';
  }
}
