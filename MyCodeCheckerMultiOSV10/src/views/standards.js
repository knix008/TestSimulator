// Coding-standard helpers shared by the issue browser, the rules view and
// the compliance pages.

import { t } from '../lib/i18n';

const arr = (v) => (v == null || v === false ? [] : Array.isArray(v) ? v : [v]);

export const ISSUE_STANDARDS = [
  { value: 'mois', get label() { return t('std_mois49'); }, icon: 'shield' },
  { value: 'misraC', label: 'MISRA C', icon: 'shield' },
  { value: 'misraCpp', label: 'MISRA C++', icon: 'shield' },
  { value: 'cert', label: 'CERT', icon: 'shield' },
  { value: 'cweTop25', label: 'CWE Top 25', icon: 'alert' },
  { value: 'owasp', label: 'OWASP', icon: 'lock' },
];

// Merged standards of an issue and its rule.
export function standardsOf(issue, rule) {
  const out = {};
  for (const src of [rule && rule.standards, issue && issue.standards]) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v === true || v === false) { out[k] = out[k] || v; continue; }
      out[k] = [...new Set([...arr(out[k] === true ? [] : out[k]), ...arr(v)])];
    }
  }
  const cwe = (issue && issue.cwe) || (rule && rule.cwe);
  if (cwe && !arr(out.cwe).includes(cwe)) out.cwe = [...arr(out.cwe), cwe];
  const cert = (issue && issue.cert) || (rule && rule.cert);
  if (cert && !out.certC && !out.certCpp) out.cert = [cert];
  const tags = [...((rule && rule.tags) || []), ...((issue && issue.tags) || [])];
  if (tags.includes('cwe-top25')) out.cweTop25 = true;
  return out;
}

export function matchesStandard(std, id) {
  if (!id) return true;
  if (id === 'misraC') return arr(std.misraC2012).length + arr(std.misraC2023).length > 0;
  if (id === 'misraCpp') return arr(std.misraCpp2023).length > 0;
  if (id === 'cert') return arr(std.certC).length + arr(std.certCpp).length + arr(std.cert).length > 0;
  if (id === 'cweTop25') return std.cweTop25 === true || arr(std.cweTop25).length > 0;
  if (id === 'owasp') return arr(std.owasp2021).length + arr(std.owasp2017).length > 0;
  if (id === 'mois') return arr(std.mois2021).length > 0;
  return true;
}

// Chips: [{ kind, text }]
export function standardChips(std) {
  const chips = [];
  const add = (kind, prefix, list) => { for (const v of arr(list)) chips.push({ kind, text: prefix ? `${prefix} ${v}` : String(v) }); };
  add('misra', 'MISRA C:2012', std.misraC2012);
  add('misra', 'MISRA C:2023', std.misraC2023);
  add('misra', 'MISRA C++:2023', std.misraCpp2023);
  add('cert', 'CERT', std.certC);
  add('cert', 'CERT', std.certCpp);
  add('cert', 'CERT', std.cert);
  add('cwe', '', arr(std.cwe).map((c) => (/^\d+$/.test(String(c)) ? `CWE-${c}` : c)));
  if (std.cweTop25 === true) chips.push({ kind: 'cwe', text: 'CWE Top 25' });
  add('owasp', 'OWASP 2021', std.owasp2021);
  add('owasp', 'OWASP 2017', std.owasp2017);
  add('mois', t('std_mois_short'), std.mois2021);
  return chips;
}

export function engineOf(x) {
  return (x && (x.engine || x.externalEngine)) || 'core';
}

export const ENGINE_ICON = { core: 'search', sca: 'package', taint: 'flow', misra: 'shield', 'misra-c': 'shield', 'misra-cpp': 'shield', cert: 'shield', cfamily: 'code', dast: 'globe', defectAnalysis: 'alert' };
