'use strict';

const { URL } = require('url');
const { truncate } = require('./client');
const { matchDbError } = require('./passive');
const { dangerousMethods, ssrfProbe } = require('./extra');

let counter = 0;
function marker(prefix) {
  counter += 1;
  return `mcc${prefix}${Date.now().toString(36)}${counter}x`;
}

function fFinding(rule, point, res, extra) {
  return {
    rule,
    url: point.url,
    method: point.method,
    param: point.param || extra.param || null,
    evidence: truncate(extra.evidence || '', 400),
    request: truncate(`${res.request.method} ${res.request.url}${res.request.body ? '\n\n' + res.request.body : ''}`, 400),
    response: truncate(`HTTP ${res.status}\n${headerStr(res.headers)}\n\n${res.body || ''}`, 1200),
    ...(extra.message ? { message: extra.message } : {}),
  };
}

function headerStr(h) {
  return Object.entries(h || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}

// Derive injection points (GET query params and form fields) from a page.
function deriveInjectionPoints(page) {
  const points = [];
  // Query parameters on the page URL
  try {
    const u = new URL(page.url);
    const params = {};
    for (const [k, v] of u.searchParams) params[k] = v;
    for (const name of Object.keys(params)) {
      points.push({
        method: 'GET',
        url: `${u.protocol}//${u.host}${u.pathname}`,
        params: { ...params },
        param: name,
        isBody: false,
        baseValue: params[name],
      });
    }
  } catch { /* ignore */ }

  // Forms (GET/POST only)
  for (const form of page.forms || []) {
    const method = form.method === 'POST' ? 'POST' : 'GET';
    let actionUrl;
    try {
      actionUrl = new URL(form.action || page.url, page.url).href;
    } catch {
      continue;
    }
    const params = {};
    for (const fl of form.fields || []) {
      if (!fl.name) continue;
      if (fl.type === 'submit' || fl.type === 'button' || fl.type === 'file') continue;
      params[fl.name] = fl.value || '1';
    }
    for (const name of Object.keys(params)) {
      const u = new URL(actionUrl);
      points.push({
        method,
        url: `${u.protocol}//${u.host}${u.pathname}`,
        params: { ...params },
        param: name,
        isBody: method === 'POST',
        baseValue: params[name] || '1',
      });
    }
  }
  return points;
}

// Build a sender bound to one injection point that sets param = value.
function makeSender(client, point) {
  return (value, opts = {}) => {
    const params = { ...point.params, [point.param]: value };
    if (point.isBody) {
      const body = new URLSearchParams(params).toString();
      return client.request(point.url, { method: 'POST', body, ...opts });
    }
    const u = new URL(point.url);
    u.search = new URLSearchParams(params).toString();
    return client.request(u.href, { method: 'GET', ...opts });
  };
}

async function reflectedXss(send, point) {
  const m = marker('xss');
  const payload = `'"<${m}>`;
  const res = await send(payload);
  const body = res.body || '';
  const findings = [];
  if (body.includes(`<${m}>`)) {
    findings.push(fFinding('dast:xss-reflected', point, res, {
      evidence: `Unescaped <${m}> reflected in HTML context`,
      message: {
        en: `Parameter '${point.param}' reflects < and > unescaped (HTML context); injected markup executes.`,
        ko: `파라미터 '${point.param}'가 < 와 >를 이스케이프 없이 HTML 문맥에 반사해 마크업이 실행돼요.`,
      },
    }));
  } else if (body.includes(`"${m}`) && /<[^>]+"$/m.test('')) {
    // attribute context handled below
  } else if (body.includes(`"${m}`) || body.includes(`'${m}`)) {
    findings.push(fFinding('dast:xss-reflected', point, res, {
      evidence: `Unescaped quote before ${m} (attribute context)`,
      message: {
        en: `Parameter '${point.param}' reflects an unescaped quote (attribute context); attribute breakout is possible.`,
        ko: `파라미터 '${point.param}'가 따옴표를 이스케이프 없이 반사해(속성 문맥) 속성 탈출이 가능해요.`,
      },
    }));
  }
  return findings;
}

async function sqlInjection(send, point, baseline) {
  const findings = [];
  // Error-based: append a single quote.
  const qres = await send(`${point.baseValue}'`);
  const db = matchDbError(qres.body || '');
  const baseDb = matchDbError((baseline && baseline.body) || '');
  if (db && !baseDb) {
    findings.push(fFinding('dast:sqli-error', point, qres, {
      evidence: `${db} error triggered by appended quote`,
      message: {
        en: `Parameter '${point.param}' triggered a ${db} error with a single quote — likely SQL injection.`,
        ko: `파라미터 '${point.param}'에 따옴표를 넣자 ${db} 오류가 나 SQL 인젝션 가능성이 높아요.`,
      },
    }));
    return findings; // error-based is conclusive; skip boolean to save requests
  }
  // Boolean-based: true vs false condition.
  if (baseline) {
    const tRes = await send(`${point.baseValue}' AND '1'='1`);
    const fRes = await send(`${point.baseValue}' AND '1'='2`);
    const base = (baseline.body || '').length;
    const tl = (tRes.body || '').length;
    const fl = (fRes.body || '').length;
    const closeToBase = Math.abs(tl - base) <= Math.max(8, base * 0.05);
    const falseDiffers = Math.abs(tl - fl) > Math.max(16, tl * 0.1);
    if (closeToBase && falseDiffers && tRes.status === baseline.status) {
      findings.push(fFinding('dast:sqli-boolean', point, fRes, {
        evidence: `true(len ${tl}) vs false(len ${fl}) vs baseline(len ${base})`,
        message: {
          en: `Parameter '${point.param}' changes the response between AND 1=1 and AND 1=2 — likely boolean-based SQL injection.`,
          ko: `파라미터 '${point.param}'가 AND 1=1 과 AND 1=2 에서 응답이 달라져 불리언 기반 SQL 인젝션 가능성이 있어요.`,
        },
      }));
    }
  }
  return findings;
}

const TRAVERSAL_SIGNS = [/root:.*:0:0:/, /\[extensions\]/i, /\[fonts\]/i];

async function pathTraversal(send, point, count) {
  const findings = [];
  const payloads = ['../../../../../../etc/passwd', '..%2f..%2f..%2f..%2f..%2fetc%2fpasswd', '....//....//....//etc/passwd'].slice(0, count || 99);
  for (const p of payloads) {
    const res = await send(p);
    const body = res.body || '';
    if (TRAVERSAL_SIGNS.some((re) => re.test(body))) {
      findings.push(fFinding('dast:path-traversal', point, res, {
        evidence: 'Known benign file signature returned (e.g. root:...:0:0:)',
        message: {
          en: `Parameter '${point.param}' served a known system file via ../ traversal.`,
          ko: `파라미터 '${point.param}'가 ../ 순회로 알려진 시스템 파일을 반환했어요.`,
        },
      }));
      break;
    }
  }
  return findings;
}

async function openRedirect(send, point) {
  const findings = [];
  const payload = 'https://example.com/mcc';
  const res = await send(payload); // redirects are never followed by the client
  const loc = res.location || '';
  let host = '';
  try {
    host = new URL(loc, point.url).hostname;
  } catch { /* ignore */ }
  if (res.status >= 300 && res.status < 400 && host === 'example.com') {
    findings.push(fFinding('dast:open-redirect', point, res, {
      evidence: `Location: ${loc}`,
      message: {
        en: `Parameter '${point.param}' sets the redirect target to an external domain (example.com).`,
        ko: `파라미터 '${point.param}'가 리다이렉트 대상을 외부 도메인(example.com)으로 설정했어요.`,
      },
    }));
  }
  return findings;
}

async function ssti(send, point, count) {
  const findings = [];
  const a = 100 + Math.floor(Math.random() * 800);
  const b = 7;
  const product = String(a * b);
  const expr = `${a}*${b}`;
  for (const payload of [`{{${expr}}}`, `\${${expr}}`, `#{${expr}}`].slice(0, count || 99)) {
    const res = await send(payload);
    const body = res.body || '';
    if (body.includes(product) && !body.includes(expr)) {
      findings.push(fFinding('dast:ssti', point, res, {
        evidence: `${payload} evaluated to ${product}`,
        message: {
          en: `Parameter '${point.param}' evaluated template expression ${payload} to ${product} — server-side template injection.`,
          ko: `파라미터 '${point.param}'가 템플릿 식 ${payload}을(를) ${product}로 계산해 SSTI예요.`,
        },
      }));
      break;
    }
  }
  return findings;
}

async function commandInjection(send, point, count) {
  // Echo-marker only. No timing/sleep payloads. Two distinct markers so the
  // concatenated output cannot match mere reflection of the raw payload.
  const findings = [];
  const left = marker('cia');
  const right = marker('cib');
  const combined = left + right;
  const payloads = [`${left}$(echo ${right})`, `${left}\`echo ${right}\``, `${left};echo ${right}`].slice(0, count || 99);
  for (const payload of payloads) {
    const res = await send(payload);
    const body = res.body || '';
    if (body.includes(combined) && !body.includes('echo ' + right)) {
      findings.push(fFinding('dast:command-injection', point, res, {
        evidence: `echo-marker produced ${combined} without the literal command`,
        message: {
          en: `Parameter '${point.param}' executed an echo command (markers joined as ${combined}) — OS command injection.`,
          ko: `파라미터 '${point.param}'가 echo 명령을 실행해(마커가 ${combined}로 합쳐짐) OS 명령 인젝션이에요.`,
        },
      }));
      break;
    }
  }
  return findings;
}

async function crlfInjection(send, point, count) {
  const findings = [];
  const m = marker('crlf');
  const payloads = [`x%0d%0aX-MCC-Injected: ${m}`, `x\r\nX-MCC-Injected: ${m}`].slice(0, count || 99);
  for (const payload of payloads) {
    const res = await send(payload);
    const hv = res.headers['x-mcc-injected'];
    if (hv && String(hv).includes(m)) {
      findings.push(fFinding('dast:crlf-injection', point, res, {
        evidence: `Injected response header X-MCC-Injected: ${m}`,
        message: {
          en: `Parameter '${point.param}' injected a response header via CRLF — HTTP response splitting.`,
          ko: `파라미터 '${point.param}'가 CRLF로 응답 헤더를 주입해 HTTP 응답 분리가 가능해요.`,
        },
      }));
      break;
    }
  }
  return findings;
}

// Method checks operate on a URL (not a param): OPTIONS + TRACE only.
async function methodChecks(client, url) {
  const findings = [];
  try {
    const opt = await client.request(url, { method: 'OPTIONS' });
    if (opt.headers['allow']) {
      findings.push({
        rule: 'dast:http-options',
        url,
        method: 'OPTIONS',
        param: null,
        evidence: `Allow: ${opt.headers['allow']}`,
        request: `OPTIONS ${url}`,
        response: truncate(`HTTP ${opt.status}\n${headerStr(opt.headers)}`, 600),
      });
      // Flag advertised write methods without ever sending PUT/DELETE/PATCH.
      for (const dm of dangerousMethods(opt.headers['allow'], url)) findings.push(dm);
    }
  } catch { /* ignore */ }
  try {
    const tr = await client.request(url, { method: 'TRACE' });
    if (tr.status === 200 && /TRACE\s/i.test(tr.body || '')) {
      findings.push({
        rule: 'dast:http-trace',
        url,
        method: 'TRACE',
        param: null,
        evidence: 'TRACE echoed the request (XST possible)',
        request: `TRACE ${url}`,
        response: truncate(`HTTP ${tr.status}\n\n${tr.body || ''}`, 600),
      });
    }
  } catch { /* ignore */ }
  return findings;
}

// Run all param probes for one injection point. `opts` carries the policy:
//   enabled(ruleKey) -> bool (default: all on)
//   payloadCount     -> cap payloads per family (strength; default: all)
//   ssrfCallback     -> SsrfCallback instance to enable the SSRF probe
async function probePoint(client, point, baseline, opts = {}) {
  const send = makeSender(client, point);
  const enabled = opts.enabled || (() => true);
  const count = opts.payloadCount || 99;
  const findings = [];
  const run = async (fn, ...args) => {
    try {
      findings.push(...(await fn(...args)));
    } catch (err) {
      if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err;
      // network/other errors on a single probe are non-fatal
    }
  };
  if (enabled('dast:xss-reflected')) await run(reflectedXss, send, point);
  if (enabled('dast:sqli-error') || enabled('dast:sqli-boolean')) await run(sqlInjection, send, point, baseline);
  if (enabled('dast:path-traversal')) await run(pathTraversal, send, point, count);
  if (enabled('dast:open-redirect')) await run(openRedirect, send, point);
  if (enabled('dast:ssti')) await run(ssti, send, point, count);
  if (enabled('dast:command-injection')) await run(commandInjection, send, point, count);
  if (enabled('dast:crlf-injection')) await run(crlfInjection, send, point, count);
  if (opts.ssrfCallback && enabled('dast:ssrf')) await run(ssrfProbe, send, point, opts.ssrfCallback);
  return findings;
}

module.exports = {
  deriveInjectionPoints,
  makeSender,
  probePoint,
  methodChecks,
  reflectedXss,
  sqlInjection,
  pathTraversal,
  openRedirect,
  ssti,
  commandInjection,
  crlfInjection,
};
