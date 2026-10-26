'use strict';

// XML text helpers shared by the OOXML writers.

/** Drop characters XML 1.0 cannot carry (C0 controls except tab/LF/CR, lone surrogates, U+FFFE/U+FFFF). */
function clean(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/g, '$1');
}

/** Escape for element text and attribute values. */
function x(s) {
  return clean(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** W3C date-time without milliseconds (what Office writes). */
function w3cdtf(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { clean, x, DECL, w3cdtf };
