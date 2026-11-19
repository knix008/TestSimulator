// Display-filter error codes. Messages are English (close to Wireshark 4.6 wording); the UI
// translates by `code` and substitutes `args` when it wants to.

export const FILTER_ERRORS = Object.freeze({
  UNEXPECTED_END: 'unexpected-end',           // Unexpected end of filter expression.
  UNEXPECTED_TOKEN: 'unexpected-token',       // "X" was unexpected in this context.
  UNKNOWN_FIELD: 'unknown-field',             // "X" is not a valid protocol or protocol field.
  NOT_A_FIELD: 'not-a-field',                 // X is neither a field nor a protocol name.  (a bare "string")
  INVALID_VALUE: 'invalid-value',             // "X" cannot be converted to Unsigned integer (16 bits).
  STRING_NOT_ALLOWED: 'string-not-allowed',   // Unsigned integer (16 bits) cannot be converted from a string ("80").
  INVALID_ADDRESS: 'invalid-address',         // "X" is not a valid hostname or IPv4 address.
  TOO_MANY_BYTES: 'too-many-bytes',           // "X" contains too many bytes to be a valid Ethernet address.
  INCOMPATIBLE_TYPES: 'incompatible-types',   // a <FT_UINT8> and b <FT_PROTOCOL> are not of compatible types.
  CANNOT_COMPARE: 'cannot-compare',           // tcp.port (type=…) cannot participate in contains comparison.
  CANNOT_SLICE: 'cannot-slice',               // "tcp.port" is a … and cannot be sliced into a sequence of bytes.
  BAD_SLICE: 'bad-slice',                     // "X" is not a valid slice / layer range.
  UNCLOSED_SLICE: 'unclosed-slice',           // The right bracket was missing from a slice.
  UNCLOSED_STRING: 'unclosed-string',         // The string was not terminated.
  BAD_ESCAPE: 'bad-escape',                   // \q is not a valid character escape sequence
  BAD_CHAR: 'bad-char',                       // 'xy' is not a valid character constant.
  BAD_REGEX: 'bad-regex',                     // Invalid regular expression: …
  UNKNOWN_FUNCTION: 'unknown-function',       // Function 'X' does not exist
  BAD_ARG_COUNT: 'bad-arg-count',             // Function len() needs 1 argument(s).
  BAD_FUNCTION_ARG: 'bad-function-arg',       // Argument does not support the len() function / Only string type fields …
  CONSTANT_EXPRESSION: 'constant-expression', // Constant expression is invalid.
  NOT_NUMERIC: 'not-numeric',                 // X is not a numeric type and cannot be used in arithmetic.
  BAD_REFERENCE: 'bad-reference',             // Invalid field reference.
  BAD_LAYER: 'bad-layer',                     // Layer operator can only be applied to a field.
  INVALID_CHARACTER: 'invalid-character',     // "X" is not a valid character here.
});

export class FilterError extends Error {
  constructor(code, message, at = 0, end = at, args) {
    super(message);
    this.code = code;
    this.at = at;
    this.end = end;
    this.args = args || null;
  }
}

/** Wireshark-style type names used in messages ("Unsigned integer (16 bits)"). */
export function typeDescription(ft, info) {
  const bits = info && info.bits;
  switch (ft) {
    case 'uint': return `Unsigned integer${bits ? ` (${bits} bits)` : ''}`;
    case 'int': return `Signed integer${bits ? ` (${bits} bits)` : ''}`;
    case 'uint64': return 'Unsigned integer (64 bits)';
    case 'int64': return 'Signed integer (64 bits)';
    case 'framenum': return 'Frame number';
    case 'char': return 'Character (8 bits)';
    case 'bool': return 'Boolean';
    case 'float': return 'Floating point (single-precision)';
    case 'double': return 'Floating point (double-precision)';
    case 'string': return 'Character string';
    case 'bytes': return 'Byte sequence';
    case 'ether': return 'Ethernet or other MAC address';
    case 'ipv4': return 'IPv4 address';
    case 'ipv6': return 'IPv6 address';
    case 'abs_time': return 'Date and time';
    case 'rel_time': return 'Time offset';
    case 'guid': return 'Globally Unique Identifier';
    case 'oid': return 'ASN.1 object identifier';
    case 'protocol': return 'Protocol';
    case 'none': return 'Label';
    default: return ft || 'Unknown';
  }
}

/** Wireshark's FT_ names, used in "not of compatible types" messages. */
export function ftName(ft, info) {
  const bits = info && info.bits;
  switch (ft) {
    case 'uint': return `FT_UINT${bits || 32}`;
    case 'int': return `FT_INT${bits || 32}`;
    case 'uint64': return 'FT_UINT64';
    case 'int64': return 'FT_INT64';
    case 'bool': return 'FT_BOOLEAN';
    case 'float': return 'FT_FLOAT';
    case 'double': return 'FT_DOUBLE';
    case 'string': return 'FT_STRING';
    case 'bytes': return 'FT_BYTES';
    case 'ether': return 'FT_ETHER';
    case 'ipv4': return 'FT_IPv4';
    case 'ipv6': return 'FT_IPv6';
    case 'abs_time': return 'FT_ABSOLUTE_TIME';
    case 'rel_time': return 'FT_RELATIVE_TIME';
    case 'framenum': return 'FT_FRAMENUM';
    case 'guid': return 'FT_GUID';
    case 'oid': return 'FT_OID';
    case 'char': return 'FT_CHAR';
    case 'protocol': return 'FT_PROTOCOL';
    case 'none': return 'FT_NONE';
    default: return 'FT_' + String(ft || 'unknown').toUpperCase();
  }
}
