'use strict';

// Shared value checks for the generic secret rules (core/rules.js
// secrets:hardcoded-password / hardcoded-token / connection-string and
// secrets.js generic-high-entropy). A name-based rule only knows that a
// literal sits next to a word like "password"; these helpers tell a stored
// credential apart from the look-alikes that real code is full of: UI labels
// and i18n strings, field-name constants, placeholders, password hashes,
// literal prefixes of a built value, and fixtures in test code.

// Test and generated code. Name-based secret rules skip it (fixtures and
// mocks use made-up credentials); provider-format rules (AWS, GitHub, ...)
// still run there, because a real token in a test is still a leak.
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|specs?|testdata|test-?data|fixtures?|__fixtures__|__mocks__|mocks?|e2e)\/|(?:^|\/)[^/]*[._-](?:test|spec|tests)\.[^/]+$|(?:^|\/)test_[^/]+\.py$|(?:^|\/)[^/]*_test\.(?:go|py|rb|rs|exs?|dart)$|(?:^|\/)tests?_[^/]*\.rs$|(?:^|\/)[^/]*Tests?\.(?:java|kt|cs|scala|swift|groovy|vb)$|(?:^|\/)[^/]*(?:Spec|IT)\.(?:java|kt|scala|groovy)$/;
const GENERATED_PATH = /(?:^|\/)(?:generated|__generated__|gen)\/|\.(?:g|generated|designer)\.[^/]+$|\.pb\.go$|_pb2\.py$/i;

// A file's path: the file ({ path }) or the path itself.
const pathOf = (file) => String((file && typeof file === 'object' ? file.path : file) || '').replace(/\\/g, '/');

function isTestPath(file) {
  return !!file && TEST_PATH.test(pathOf(file));
}

function isGeneratedPath(file) {
  return !!file && GENERATED_PATH.test(pathOf(file));
}

// Fixture or generated file: a name-based secret rule does not apply.
function fixturePath(file) {
  return isTestPath(file) || isGeneratedPath(file);
}

// A value that stands for a secret instead of being one.
const PLACEHOLDER_VALUE = /^\s*$|\$\{|\$\(|\{\{|^<[^>]*>$|^\[[^\]]*\]$|%\(?\w*\)?s|%s|^\{\w*\}$|^:\w+$|^\$[A-Za-z_]\w*$|^%\w+%$|x{4,}|\*{3,}|•{3,}|#{4,}|\.{3,}|change[-_ ]?me|example|placeholder|dummy|sample|redacted|^(?:your|my)[-_ ]|^(?:none|null|nil|undefined|todo|tbd|fixme|empty|default)$/i;

// The word "password" itself in a few languages: a label, not a secret.
const PASSWORD_WORDS = /^(?:pass(?:word|wd|phrase)?|pwd|pw|secret|token|api[-_ ]?key|passwort|kennwort|contrase(?:ñ|n)a|mot de passe|senha|parola|wachtwoord|lösenord|hasło)s?:?$/i;

// UI text: a label or a sentence ("Password", "비밀번호", "Enter the password").
function isLabel(value) {
  const v = String(value);
  if (/\s/.test(v.trim())) return true;
  if (/[^\x00-\x7f]/.test(v)) return true;
  if (/^[A-Za-z][a-z]+[:?]$/.test(v)) return true;
  return PASSWORD_WORDS.test(v.trim());
}

// A field or parameter name used as a constant: 'access_token',
// 'client_secret', 'newPassword', 'ACCESS_TOKEN', or the key's own name.
function isNameConstant(value, key) {
  const v = String(value);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key && norm(v) && norm(v) === norm(key)) return true;
  if (!/^[A-Za-z]+(?:[_.-]?[A-Za-z]+)*$/.test(v)) return false;
  const words = /(?:pass(?:word|wd)?|pwd|secret|token|key|credential|auth)/i;
  if (!words.test(v)) return false;
  // Needs a word boundary inside (snake / kebab / dot / camel / CONSTANT).
  return /[_.-]/.test(v) || /[a-z][A-Z]/.test(v) || /^[A-Z][A-Z]+$/.test(v);
}

// A stored password hash, not the password (bcrypt, argon2, crypt, LDAP).
const HASH_VALUE = /^\$(?:2[abxy]?|argon2(?:id|i|d)|[156]|y|scrypt|pbkdf2[\w-]*)\$|^\{(?:SSHA|SHA|SMD5|MD5|CRYPT|BCRYPT|PBKDF2)\}/i;

// The literal is only a prefix or suffix of a value built at run time:
// 'b64:' + encode(pw), "Bearer " + token.
function isConcatenated(line, start, end) {
  const before = String(line).slice(0, start);
  const after = String(line).slice(end);
  return /^\s*(?:\+|\.\s*(?:concat|format|replace)\s*\(|%\s*[\w(])/.test(after) || /\+\s*$/.test(before);
}

// Values that the generic password / token rules treat as not a secret.
function benignValue(value, key, line, start, end) {
  const v = String(value);
  return PLACEHOLDER_VALUE.test(v) || isLabel(v) || isNameConstant(v, key) || HASH_VALUE.test(v)
    || (line != null && start != null && isConcatenated(line, start, end));
}

const PASSWORD_ASSIGN = /([\w$.-]*(?:password|passwd|pwd))['"]?\s*(?::|=>?|:=)\s*(['"])((?:(?!\2).){4,}?)\2/gi;
const TOKEN_ASSIGN = /([\w$.-]*(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token))['"]?\s*(?::|=>?|:=)\s*(['"])([A-Za-z0-9_+\/=-]{8,})\2/gi;

// True when every password-like assignment on the line is benign.
function allBenign(re, line, extra) {
  re.lastIndex = 0;
  let m;
  let any = false;
  while ((m = re.exec(line))) {
    any = true;
    const start = m.index + m[0].length - m[3].length - 2;
    const end = m.index + m[0].length;
    if (!benignValue(m[3], m[1], line, start, end) && !(extra && extra(m[3], m[1]))) return false;
  }
  return any;
}

// skip(raw, code, file) for secrets:hardcoded-password.
function passwordSkip(raw, file) {
  const line = String(raw);
  if (fixturePath(file)) return true;
  if (/process\.env|os\.environ|getenv|System\.getenv|ENV\[|secretref|\$\{/i.test(line)) return true;
  return allBenign(PASSWORD_ASSIGN, line);
}

// Lower-case words only ("fresh-value") or a CONSTANT_NAME: a real token
// has digits or mixed case.
const WORDY = (v) => /^[a-z]+(?:[-_][a-z]+)*$/.test(v) || /^[A-Z]+(?:_[A-Z]+)*$/.test(v);

// skip(raw, code, file) for secrets:hardcoded-token.
function tokenSkip(raw, file) {
  const line = String(raw);
  if (fixturePath(file)) return true;
  if (/process\.env|os\.environ|getenv|\$\{|example|placeholder|changeme|your-/i.test(line)) return true;
  return allBenign(TOKEN_ASSIGN, line, (v) => WORDY(v));
}

// skip(raw, code, file) for secrets:connection-string: the password part of
// scheme://user:password@host is a placeholder or a variable.
const URI_PASSWORD = /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^:\s'"]+:([^@\s'"]+)@/gi;
function connectionSkip(raw, file) {
  const line = String(raw);
  if (isGeneratedPath(file)) return true;
  URI_PASSWORD.lastIndex = 0;
  let m;
  let any = false;
  while ((m = URI_PASSWORD.exec(line))) {
    any = true;
    const pw = m[1];
    if (!(PLACEHOLDER_VALUE.test(pw) || /^\$\w+$|^%\w+%$|^\{\w*\}$|^<[^>]*>$|^(?:pass(?:word)?|pwd|pw|secret|\*+)$/i.test(pw) || /[{}$%]/.test(pw))) return false;
  }
  return any;
}

// skip(raw, code, file) for the per-language hard-coded password rules
// (swift / dart / scala / objc: let passwordKey = "password"). The variable
// holds a key, a field name or a label when its name says so
// (tokenKey, passwordField, secretName) or its value is benign.
const NAMED_SECRET = /(\w*(?:password|passwd|pwd|secret|apiKey|token)\w*)\s*(?::\s*[\w.?]+\s*)?=\s*@?(["'])((?:(?!\2).){4,}?)\2/gi;
const KEY_NAME_SUFFIX = /(?:Key|Keys|Name|Field|Label|Title|Placeholder|Hint|Prompt|Message|Msg|Text|Url|URL|Uri|Path|Header|Id|ID|Type|Kind|Param|Column|Attr|Attribute|Identifier|Account|Service|Endpoint)$/;
function namedSecretSkip(raw, file) {
  const line = String(raw);
  if (fixturePath(file)) return true;
  NAMED_SECRET.lastIndex = 0;
  let m;
  let any = false;
  while ((m = NAMED_SECRET.exec(line))) {
    any = true;
    // ...Key is a lookup key (tokenKey), except for the secret keys themselves (apiKey, secretKey).
    const secretKey = /(?:api|secret|private|access|signing|encryption|master|client|app)_?key$/i.test(m[1]);
    if ((KEY_NAME_SUFFIX.test(m[1]) && !secretKey) || /^k[A-Z]\w*Key$/.test(m[1])) continue;
    if (benignValue(m[3], m[1])) continue;
    return false;
  }
  return any;
}

module.exports = {
  namedSecretSkip,
  TEST_PATH, isTestPath, isGeneratedPath, fixturePath,
  PLACEHOLDER_VALUE, isLabel, isNameConstant, benignValue,
  passwordSkip, tokenSkip, connectionSkip,
};
