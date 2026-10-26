// DAST building blocks: scan policies, API description parsers, JWT and
// HTTP-method checks. Pure functions only; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pol = require('../core/dast/policies.js');
const api = require('../core/dast/apiscan.js');
const extra = require('../core/dast/extra.js');
const dast = require('../core/dast/index.js');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

test('built-in policies and their resolution', () => {
  const ids = pol.policies().map((p) => p.id);
  assert.deepEqual(ids, ['Light', 'Default', 'OWASP Top 10', 'API', 'Full']);
  assert.deepEqual(dast.policies().map((p) => p.id), ids);
  const light = pol.resolvePolicy('light');
  assert.equal(light.id, 'Light');
  assert.equal(pol.resolvePolicy('nope').id, 'Default', 'unknown ids fall back to Default');
  const custom = pol.resolvePolicy({ id: 'Mine', active: [], passive: ['dast:missing-csp'], strength: 'high' });
  assert.equal(custom.activeOn, false);
  assert.equal(custom.passiveEnabled('dast:missing-csp'), true);
  assert.equal(custom.passiveEnabled('dast:other'), false);
  assert.equal(custom.payloadCount, pol.strengthToCount('high'));
  assert.ok(pol.strengthToCount('low') < pol.strengthToCount('medium'));
});

test('policy threshold compares finding severities', () => {
  assert.equal(pol.thresholdBreached([{ severity: 'MINOR' }], 'MAJOR'), false);
  assert.equal(pol.thresholdBreached([{ severity: 'CRITICAL' }], 'MAJOR'), true);
  assert.equal(pol.thresholdBreached([], 'INFO'), false);
});

test('GraphQL introspection result becomes operations with argument types', () => {
  const schema = {
    queryType: { name: 'Query' }, mutationType: { name: 'Mutation' },
    types: [
      { name: 'Query', fields: [{ name: 'user', args: [{ name: 'id', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'ID' } } }] }] },
      { name: 'Mutation', fields: [{ name: 'rename', args: [{ name: 'name', type: { kind: 'SCALAR', name: 'String' } }] }] },
    ],
  };
  const ops = api.parseIntrospection(schema);
  assert.deepEqual(ops.map((o) => `${o.kind}:${o.name}`), ['query:user', 'mutation:rename']);
  assert.equal(ops[0].args[0].name, 'id');
  assert.deepEqual(api.parseIntrospection(null), []);
  assert.match(api.INTROSPECTION_QUERY, /__schema/);
});

test('WSDL operations, endpoint and namespace', () => {
  const wsdl = `<definitions targetNamespace="urn:shop" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/">
    <portType><operation name="GetOrder"/><operation name="ListOrders"/></portType>
    <binding><operation name="GetOrder"/></binding>
    <service><port><soap:address location="http://127.0.0.1:9/soap"/></port></service></definitions>`;
  const w = api.parseWsdl(wsdl);
  assert.deepEqual(w.operations, ['GetOrder', 'ListOrders']);
  assert.equal(w.endpoint, 'http://127.0.0.1:9/soap');
  assert.equal(w.targetNamespace, 'urn:shop');
});

test('Postman v2.1 collections become seeds with variables, folders and bodies', () => {
  const seeds = api.parsePostman({
    variable: [{ key: 'base', value: 'http://127.0.0.1:9' }],
    item: [
      { name: 'folder', item: [{ request: { method: 'get', url: { raw: '{{base}}/items?q=1' } } }] },
      { request: { method: 'POST', url: '/login', body: { mode: 'urlencoded', urlencoded: [{ key: 'user', value: 'a b' }] } } },
      { request: 'http://127.0.0.1:9/plain' },
    ],
  }, 'http://127.0.0.1:9');
  assert.deepEqual(seeds.map((s) => `${s.method} ${s.url}`), ['GET http://127.0.0.1:9/items?q=1', 'POST http://127.0.0.1:9/login', 'GET http://127.0.0.1:9/plain']);
  assert.equal(seeds[1].body, 'user=a%20b');
});

test('JWT checks: unsigned or alg none, and symmetric signing', () => {
  const none = `${b64({ alg: 'none' })}.${b64({ sub: '1' })}.`;
  assert.deepEqual(extra.analyzeJwt(none, 'Authorization header').map((f) => f.rule), ['dast:jwt-none-alg']);
  const hs = `${b64({ alg: 'HS256' })}.${b64({ sub: '1' })}.c2ln`;
  assert.ok(extra.analyzeJwt(hs, 'Authorization header').some((f) => f.rule === 'dast:jwt-weak-alg'));
  const rs = `${b64({ alg: 'RS256' })}.${b64({ sub: '1' })}.c2ln`;
  assert.deepEqual(extra.analyzeJwt(rs, 'Authorization header'), []);
  assert.equal(extra.parseJwt('not-a-jwt'), null);
});

test('write methods advertised in Allow are reported, read-only ones are not', () => {
  assert.deepEqual(extra.dangerousMethods('GET, HEAD, OPTIONS', 'http://x/').length, 0);
  const f = extra.dangerousMethods('GET, PUT, DELETE', 'http://x/');
  assert.equal(f[0].rule, 'dast:http-dangerous-method');
  assert.match(f[0].evidence, /PUT, DELETE/);
});

test('every new DAST rule is in the catalog with Korean text', () => {
  const keys = new Set(dast.catalog().map((r) => r.key));
  for (const k of ['dast:ssrf', 'dast:jwt-none-alg', 'dast:jwt-weak-alg', 'dast:http-dangerous-method', 'dast:rate-limit-missing', 'dast:graphql-introspection', 'dast:graphql-batching', 'dast:graphql-deep-query', 'dast:soap-injection', 'dast:soap-xxe']) {
    assert.ok(keys.has(k), k);
  }
  for (const r of dast.catalog()) assert.ok(r.name.ko && r.name.en, r.key);
});
