// Error messages, codes and positions (Wireshark 4.6 wording), checkFilter statuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFilter, checkFilter, validateFilter, FILTER_ERRORS } from '../../src/domain/filter/index.js';
import { FIELDS } from './filter.fixtures.mjs';

const err = (text) => {
  const r = compileFilter(text, { fields: FIELDS });
  assert.equal(r.ok, false, `${text} should not compile`);
  return r;
};

test('error messages, codes and positions', () => {
  const cases = [
    ['foo', FILTER_ERRORS.UNKNOWN_FIELD, 0, '"foo" is not a valid protocol or protocol field.'],
    ['TCP', FILTER_ERRORS.UNKNOWN_FIELD, 0, '"TCP" is not a valid protocol or protocol field.'],
    ['tcp.port ==', FILTER_ERRORS.UNEXPECTED_END, 11, 'Unexpected end of filter expression.'],
    ['(tcp', FILTER_ERRORS.UNEXPECTED_END, 4, 'Unexpected end of filter expression.'],
    ['tcp)', FILTER_ERRORS.UNEXPECTED_TOKEN, 3, '")" was unexpected in this context.'],
    ['tcp AND udp', FILTER_ERRORS.UNEXPECTED_TOKEN, 4, '"AND" was unexpected in this context.'],
    ['tcp.port == 80 80', FILTER_ERRORS.UNEXPECTED_TOKEN, 15, '"80" was unexpected in this context.'],
    ['tcp.port == 80 ||| x', FILTER_ERRORS.UNEXPECTED_TOKEN, 17, '"|" was unexpected in this context.'],
    ['tcp.port in {}', FILTER_ERRORS.UNEXPECTED_TOKEN, 13, '"}" was unexpected in this context.'],
    ['tcp.port == abc', FILTER_ERRORS.INVALID_VALUE, 12, '"abc" cannot be converted to Unsigned integer (16 bits).'],
    ['tcp.port == 80.5', FILTER_ERRORS.INVALID_VALUE, 12, 'Double 80.5 cannot be converted to Unsigned integer (16 bits).'],
    ['tcp.port == "80"', FILTER_ERRORS.STRING_NOT_ALLOWED, 12, 'Unsigned integer (16 bits) cannot be converted from a string ("80").'],
    ['"abc"', FILTER_ERRORS.NOT_A_FIELD, 0, 'abc is neither a field nor a protocol name.'],
    ['tcp.port contains 3', FILTER_ERRORS.CANNOT_COMPARE, 0, 'tcp.port (type=Unsigned integer (16 bits)) cannot participate in contains comparison.'],
    ['ip.ttl matches "x"', FILTER_ERRORS.CANNOT_COMPARE, 0, 'ip.ttl (type=Unsigned integer (8 bits)) cannot participate in matches comparison.'],
    ['ip.proto == tcp', FILTER_ERRORS.INCOMPATIBLE_TYPES, 12, 'ip.proto <FT_UINT8> and tcp <FT_PROTOCOL> are not of compatible types.'],
    ['1 == 1', FILTER_ERRORS.CONSTANT_EXPRESSION, 0, 'Constant expression is invalid.'],
    ['frame[1:', FILTER_ERRORS.UNCLOSED_SLICE, 5, 'The right bracket was missing from a slice.'],
    ['frame[a] == 1', FILTER_ERRORS.BAD_SLICE, 6, '"a" is not a valid slice.'],
    ['tcp.port[0] == 1', FILTER_ERRORS.CANNOT_SLICE, 0, '"tcp.port" is a Unsigned integer (16 bits) and cannot be sliced into a sequence of bytes.'],
    ['ip.src == 1.2.3', FILTER_ERRORS.INVALID_ADDRESS, 10, '"1.2.3" is not a valid hostname or IPv4 address.'],
    ['ip.addr == 10.0.0.300', FILTER_ERRORS.INVALID_ADDRESS, 11, '"10.0.0.300" is not a valid hostname or IPv4 address.'],
    ['ip.addr == 10.0.0.0/33', FILTER_ERRORS.INVALID_ADDRESS, 11, 'Netmask bits in a CIDR IPv4 address should be <= 32, not 33'],
    ['eth.src == 00:11:22:33:44:55:66', FILTER_ERRORS.TOO_MANY_BYTES, 11, '"00:11:22:33:44:55:66" contains too many bytes to be a valid Ethernet address.'],
    ['len(tcp.port) == 2', FILTER_ERRORS.BAD_FUNCTION_ARG, 4, 'Argument does not support the len() function'],
    ['lower(tcp.port) == "x"', FILTER_ERRORS.BAD_FUNCTION_ARG, 6, 'Only string type fields can be used as parameter for lower()'],
    ['bogus(tcp)', FILTER_ERRORS.UNKNOWN_FUNCTION, 0, "Function 'bogus' does not exist"],
    ['len(tcp, udp) == 1', FILTER_ERRORS.BAD_ARG_COUNT, 0, 'Function len() needs 1 argument.'],
    ['frame contains "\\q"', FILTER_ERRORS.BAD_ESCAPE, 16, '\\q is not a valid character escape sequence'],
    ['frame contains "abc', FILTER_ERRORS.UNCLOSED_STRING, 15, 'The string was not terminated.'],
    ["frame contains 'ab'", FILTER_ERRORS.BAD_CHAR, 15, "'ab' is not a valid character constant."],
    ['frame matches "(["', FILTER_ERRORS.BAD_REGEX, 14, null],
    ['$tcp.port == 1', FILTER_ERRORS.CONSTANT_EXPRESSION, 0, 'Constant expression is invalid.'],
    ['${tcp.port', FILTER_ERRORS.BAD_REFERENCE, 0, 'Missing closing brace in field reference.'],
    ['tcp.port#', FILTER_ERRORS.UNEXPECTED_END, 9, null],
    ['"x"#2 == 1', FILTER_ERRORS.BAD_LAYER, 3, 'Layer operator can only be applied to a field.'],
    ['http.host - 1 == 2', FILTER_ERRORS.NOT_NUMERIC, 0, 'http.host (type=Character string) cannot participate in arithmetic.'],
    ['tcp.port == 80 && ', FILTER_ERRORS.UNEXPECTED_END, 18, 'Unexpected end of filter expression.'],
    ['tcp.port ~ 80', FILTER_ERRORS.CANNOT_COMPARE, 0, null],
  ];
  for (const [text, code, at, message] of cases) {
    const r = err(text);
    assert.equal(r.code, code, `${text}: code (${r.error})`);
    assert.equal(r.at, at, `${text}: position (${r.error})`);
    if (message) assert.equal(r.error, message, text);
    assert.ok(Object.values(FILTER_ERRORS).includes(r.code));
  }
});

test('checkFilter / validateFilter statuses for the filter bar', () => {
  assert.equal(checkFilter('', { fields: FIELDS }), 'empty');
  assert.equal(checkFilter('   ', { fields: FIELDS }), 'empty');
  assert.equal(checkFilter('tcp.port == 80', { fields: FIELDS }), 'valid');
  assert.equal(checkFilter('tcp.port ==', { fields: FIELDS }), 'invalid');
  assert.equal(checkFilter('tcp.port ~= 80', { fields: FIELDS }), 'deprecated');
  assert.equal(checkFilter('tcp.port in {80 443}', { fields: FIELDS }), 'deprecated');
  const v = validateFilter('ip.src == 1.2.3', { fields: FIELDS });
  assert.equal(v.status, 'invalid');
  assert.equal(v.at, 10);
  assert.equal(v.end, 15);
  assert.equal(v.code, FILTER_ERRORS.INVALID_ADDRESS);
  const dep = validateFilter('tcp.port in {80 443}', { fields: FIELDS });
  assert.equal(dep.deprecated.length, 1);
  assert.match(dep.deprecated[0].message, /commas/);
});

test('error codes are unique strings', () => {
  const codes = Object.values(FILTER_ERRORS);
  assert.equal(new Set(codes).size, codes.length);
  for (const c of codes) assert.match(c, /^[a-z-]+$/);
});
