'use strict';

// API surface scanning: GraphQL, SOAP/WSDL and Postman collection import.
// All requests go through the rate-limited, scope-gated client. Only safe
// methods (GET/POST) and non-destructive payloads are used.

const { truncate } = require('./client');
const { matchDbError } = require('./passive');
const { resolveUrl } = require('./scope');

let counter = 0;
function marker(prefix) {
  counter += 1;
  return `mcc${prefix}${Date.now().toString(36)}${counter}x`;
}

function headerStr(h) {
  return Object.entries(h || {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}

function apiFinding(rule, url, method, extra) {
  return {
    rule,
    url,
    method: method || 'POST',
    param: extra.param || null,
    evidence: truncate(extra.evidence || '', 400),
    request: truncate(extra.request || '', 600),
    response: truncate(extra.response || '', 1200),
    ...(extra.message ? { message: extra.message } : {}),
    ...(extra.severity ? { severity: extra.severity } : {}),
    ...(extra.type ? { type: extra.type } : {}),
  };
}

// ---- GraphQL ---------------------------------------------------------------

const INTROSPECTION_QUERY =
  'query IntrospectionQuery { __schema { queryType { name } mutationType { name } ' +
  'types { name kind fields { name args { name type { kind name ofType { kind name } } } } } } }';

async function postGraphql(client, url, payload) {
  return client.request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Parse an introspection result into a list of operations with string args.
function parseIntrospection(schema) {
  const ops = [];
  if (!schema || !schema.types) return ops;
  const typeByName = new Map(schema.types.map((t) => [t.name, t]));
  const roots = [];
  if (schema.queryType && schema.queryType.name) roots.push({ root: schema.queryType.name, kind: 'query' });
  if (schema.mutationType && schema.mutationType.name) roots.push({ root: schema.mutationType.name, kind: 'mutation' });
  for (const { root, kind } of roots) {
    const t = typeByName.get(root);
    if (!t || !t.fields) continue;
    for (const field of t.fields) {
      const args = (field.args || []).map((a) => ({
        name: a.name,
        typeName: typeName(a.type),
      }));
      ops.push({ kind, name: field.name, args });
    }
  }
  return ops;
}

function typeName(t) {
  if (!t) return '';
  if (t.name) return t.name;
  if (t.ofType) return typeName(t.ofType);
  return '';
}

// Scan a GraphQL endpoint. Returns findings. `payloadCount` controls strength.
async function graphqlScan(client, url, opts = {}) {
  const findings = [];
  const payloadCount = opts.payloadCount || 2;
  const enabled = opts.enabled || (() => true);

  // 1) Introspection enabled?
  let schema = null;
  if (enabled('dast:graphql-introspection')) {
    try {
      const res = await postGraphql(client, url, { query: INTROSPECTION_QUERY });
      let data;
      try { data = JSON.parse(res.body || '{}'); } catch { data = {}; }
      schema = data && data.data && data.data.__schema;
      if (schema) {
        findings.push(apiFinding('dast:graphql-introspection', url, 'POST', {
          evidence: 'GraphQL introspection (__schema) is enabled',
          request: `POST ${url}\n\n{"query":"IntrospectionQuery ..."}`,
          response: `HTTP ${res.status}\n${headerStr(res.headers)}\n\n` + (res.body || ''),
          message: {
            en: 'The GraphQL endpoint answers introspection queries, exposing its full schema to anyone.',
            ko: 'GraphQL 엔드포인트가 introspection 쿼리에 응답해 전체 스키마가 외부에 노출됩니다.',
          },
        }));
      }
    } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; }
  }

  // 2) Argument injection on string-typed query arguments (DB-error based).
  const ops = parseIntrospection(schema);
  if (enabled('dast:sqli-error')) {
    let injected = 0;
    for (const op of ops) {
      if (op.kind !== 'query') continue;
      const strArgs = op.args.filter((a) => /String|ID/i.test(a.typeName));
      if (!strArgs.length) continue;
      for (const arg of strArgs.slice(0, payloadCount)) {
        if (injected >= payloadCount) break;
        injected += 1;
        const q = `query { ${op.name}(${arg.name}: "'\\"") { __typename } }`;
        let res;
        try { res = await postGraphql(client, url, { query: q }); }
        catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; continue; }
        const db = matchDbError(res.body || '');
        if (db) {
          findings.push(apiFinding('dast:sqli-error', url, 'POST', {
            param: `${op.name}.${arg.name}`,
            evidence: `${db} error from GraphQL argument ${op.name}.${arg.name}`,
            request: `POST ${url}\n\n${q}`,
            response: `HTTP ${res.status}\n\n` + (res.body || ''),
            message: {
              en: `GraphQL argument '${arg.name}' of '${op.name}' triggered a ${db} error — likely SQL injection.`,
              ko: `GraphQL '${op.name}'의 인자 '${arg.name}'에서 ${db} 오류가 발생해 SQL 인젝션 가능성이 높습니다.`,
            },
          }));
        }
      }
      if (injected >= payloadCount) break;
    }
  }

  // 3) Query batching accepted? (array of operations)
  if (enabled('dast:graphql-batching')) {
    try {
      const batch = [{ query: '{ __typename }' }, { query: '{ __typename }' }, { query: '{ __typename }' }];
      const res = await postGraphql(client, url, batch);
      let data;
      try { data = JSON.parse(res.body || ''); } catch { data = null; }
      if (Array.isArray(data) && data.length >= 2) {
        findings.push(apiFinding('dast:graphql-batching', url, 'POST', {
          evidence: `Batched array of ${batch.length} operations was accepted (${data.length} results)`,
          request: `POST ${url}\n\n[{query},{query},{query}]`,
          response: `HTTP ${res.status}\n\n` + (res.body || ''),
          message: {
            en: 'The endpoint accepts batched arrays of operations, enabling rate-limit bypass and brute-force amplification.',
            ko: '엔드포인트가 배열 형태의 일괄 요청을 허용해 요청 제한 우회와 무차별 대입 증폭이 가능합니다.',
          },
        }));
      }
    } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; }
  }

  // 4) Deeply nested query accepted without a depth limit?
  if (enabled('dast:graphql-deep-query') && schema) {
    const self = findSelfReference(schema);
    if (self) {
      const deep = buildDeepQuery(self.root, self.field, 12);
      try {
        const res = await postGraphql(client, url, { query: deep });
        let data;
        try { data = JSON.parse(res.body || ''); } catch { data = null; }
        const rejected = data && Array.isArray(data.errors) && data.errors.some((e) => /depth|complex|limit/i.test(JSON.stringify(e)));
        if (res.status < 500 && !rejected) {
          findings.push(apiFinding('dast:graphql-deep-query', url, 'POST', {
            evidence: 'A 12-level nested query was not rejected (no depth/complexity limit)',
            request: `POST ${url}\n\n${deep.slice(0, 300)}`,
            response: `HTTP ${res.status}\n\n` + (res.body || '').slice(0, 300),
            message: {
              en: 'The endpoint accepts deeply nested queries without a depth/complexity limit, enabling denial-of-service amplification.',
              ko: '엔드포인트가 깊이·복잡도 제한 없이 깊게 중첩된 쿼리를 허용해 서비스 거부 증폭이 가능합니다.',
            },
          }));
        }
      } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; }
    }
  }

  return findings;
}

// Find a self-referential field (a field whose type references the root type)
// to build a depth-abuse query without guessing field names blindly.
function findSelfReference(schema) {
  if (!schema || !schema.queryType) return null;
  const rootName = schema.queryType.name;
  const typeByName = new Map((schema.types || []).map((t) => [t.name, t]));
  const rootType = typeByName.get(rootName);
  if (!rootType || !rootType.fields) return null;
  for (const field of rootType.fields) {
    const tn = fieldTypeName(field);
    const ft = typeByName.get(tn);
    if (ft && ft.fields) {
      for (const sub of ft.fields) {
        if (fieldTypeName(sub) === tn) {
          return { root: field.name, field: sub.name };
        }
      }
    }
  }
  // Fall back: root field returning an object with any sub-field.
  for (const field of rootType.fields) {
    const ft = typeByName.get(fieldTypeName(field));
    if (ft && ft.fields && ft.fields.length) return { root: field.name, field: ft.fields[0].name };
  }
  return null;
}

function fieldTypeName(field) {
  if (!field) return '';
  if (field.type) return typeName(field.type);
  return '';
}

function buildDeepQuery(root, field, depth) {
  let inner = '__typename';
  for (let i = 0; i < depth; i++) inner = `${field} { ${inner} }`;
  return `query { ${root} { ${inner} } }`;
}

// ---- SOAP / WSDL -----------------------------------------------------------

function parseWsdl(xml) {
  const out = { operations: [], endpoint: '', targetNamespace: '' };
  if (!xml) return out;
  const tns = xml.match(/targetNamespace\s*=\s*"([^"]+)"/);
  if (tns) out.targetNamespace = tns[1];
  const addr = xml.match(/<(?:\w+:)?address\s+location\s*=\s*"([^"]+)"/i);
  if (addr) out.endpoint = addr[1];
  const seen = new Set();
  const re = /<(?:\w+:)?operation\s+name\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(xml))) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.operations.push(m[1]); }
  }
  return out;
}

function soapEnvelope(op, ns, body) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body>' +
    `<${op} xmlns="${ns || 'urn:mcc'}">${body}</${op}>` +
    '</soap:Body></soap:Envelope>';
}

// Scan a SOAP service described by a WSDL (url or xml). Returns findings.
async function soapScan(client, scope, wsdl, opts = {}) {
  const findings = [];
  const enabled = opts.enabled || (() => true);
  let xml = wsdl;
  let wsdlUrl = null;
  if (typeof wsdl === 'string' && /^https?:\/\//i.test(wsdl)) {
    wsdlUrl = wsdl;
    if (!scope.inScope(wsdl)) return findings;
    try { const r = await client.request(wsdl, { method: 'GET' }); xml = r.body; }
    catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; return findings; }
  }
  const parsed = parseWsdl(xml);
  let endpoint = parsed.endpoint;
  if ((!endpoint || !scope.inScope(endpoint)) && wsdlUrl) {
    // Common convention: service endpoint is the WSDL url without ?wsdl.
    endpoint = resolveUrl(wsdlUrl, wsdlUrl.replace(/\?.*$/, '')) || wsdlUrl;
  }
  if (!endpoint || !scope.inScope(endpoint)) return findings;
  const ns = parsed.targetNamespace || 'urn:mcc';

  const ops = parsed.operations.slice(0, opts.payloadCount && opts.payloadCount < 99 ? Math.max(2, opts.payloadCount) : parsed.operations.length);
  for (const op of ops) {
    // 1) Injection: a quote inside a parameter value → DB error signature.
    if (enabled('dast:soap-injection')) {
      const body = `<arg>'\"</arg>`;
      const env = soapEnvelope(op, ns, body);
      let res;
      try {
        res = await client.request(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: `"${ns}/${op}"` },
          body: env,
        });
      } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; continue; }
      const db = matchDbError(res.body || '');
      if (db) {
        findings.push(apiFinding('dast:soap-injection', endpoint, 'POST', {
          param: op,
          evidence: `${db} error from SOAP operation ${op}`,
          request: `POST ${endpoint}\n\n${env}`,
          response: `HTTP ${res.status}\n\n` + (res.body || ''),
          message: {
            en: `SOAP operation '${op}' returned a ${db} error for an injected quote — likely SQL injection.`,
            ko: `SOAP 오퍼레이션 '${op}'가 주입된 따옴표에 ${db} 오류를 반환해 SQL 인젝션 가능성이 높습니다.`,
          },
        }));
      }
    }

    // 2) XXE: define an internal entity and see if it is expanded (parser
    // resolves entities). Non-destructive — the entity value is a local marker.
    if (enabled('dast:soap-xxe')) {
      const m = marker('xxe');
      const env =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        `<!DOCTYPE soap:Envelope [ <!ENTITY xxe "${m}"> ]>` +
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
        `<soap:Body><${op} xmlns="${ns}"><arg>&xxe;</arg></${op}></soap:Body></soap:Envelope>`;
      let res;
      try {
        res = await client.request(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: `"${ns}/${op}"` },
          body: env,
        });
      } catch (err) { if (err.code === 'CANCELLED' || err.code === 'BUDGET') throw err; continue; }
      if ((res.body || '').includes(m)) {
        findings.push(apiFinding('dast:soap-xxe', endpoint, 'POST', {
          param: op,
          evidence: `Internal XML entity expanded to the marker ${m} (external entities likely resolvable)`,
          request: `POST ${endpoint}\n\n${env}`,
          response: `HTTP ${res.status}\n\n` + (res.body || ''),
          message: {
            en: `The SOAP parser expanded a declared XML entity in '${op}', indicating it processes DOCTYPE/entities (XXE-prone).`,
            ko: `SOAP 파서가 '${op}'에서 선언된 XML 엔터티를 확장해 DOCTYPE/엔터티를 처리함을 보여줍니다(XXE 위험).`,
          },
        }));
      }
    }
  }
  return findings;
}

// ---- Postman collection v2.1 ----------------------------------------------

// Import a Postman collection (v2.1) into seed requests: [{ url, method, body }].
function parsePostman(collection, baseUrl) {
  const seeds = [];
  if (!collection || typeof collection !== 'object') return seeds;
  const vars = {};
  for (const v of collection.variable || []) if (v && v.key) vars[v.key] = v.value;

  const substVar = (s) => String(s == null ? '' : s).replace(/\{\{([^}]+)\}\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

  const walk = (items) => {
    for (const item of items || []) {
      if (!item) continue;
      if (Array.isArray(item.item)) { walk(item.item); continue; }
      const req = item.request;
      if (!req) continue;
      const method = (typeof req === 'string' ? 'GET' : (req.method || 'GET')).toUpperCase();
      let rawUrl = '';
      const urlObj = typeof req === 'string' ? req : req.url;
      if (typeof urlObj === 'string') rawUrl = urlObj;
      else if (urlObj && typeof urlObj === 'object') {
        if (urlObj.raw) rawUrl = urlObj.raw;
        else {
          const host = Array.isArray(urlObj.host) ? urlObj.host.join('.') : (urlObj.host || '');
          const pth = Array.isArray(urlObj.path) ? urlObj.path.join('/') : (urlObj.path || '');
          const proto = urlObj.protocol ? urlObj.protocol + '://' : '';
          rawUrl = `${proto}${host}${pth ? '/' + pth : ''}`;
          const query = (urlObj.query || []).filter((q) => q && q.key).map((q) => `${q.key}=${q.value || ''}`).join('&');
          if (query) rawUrl += '?' + query;
        }
      }
      rawUrl = substVar(rawUrl);
      let abs = rawUrl;
      if (!/^https?:\/\//i.test(rawUrl) && baseUrl) abs = resolveUrl(baseUrl, rawUrl) || rawUrl;
      let body;
      if (req && typeof req === 'object' && req.body) {
        if (req.body.mode === 'raw') body = substVar(req.body.raw || '');
        else if (req.body.mode === 'urlencoded') {
          body = (req.body.urlencoded || []).filter((p) => p && p.key).map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(substVar(p.value || ''))}`).join('&');
        }
      }
      if (abs) seeds.push({ url: abs, method, body });
    }
  };
  walk(collection.item);
  return seeds;
}

module.exports = {
  graphqlScan,
  parseIntrospection,
  INTROSPECTION_QUERY,
  parseWsdl,
  soapScan,
  parsePostman,
  buildDeepQuery,
};
