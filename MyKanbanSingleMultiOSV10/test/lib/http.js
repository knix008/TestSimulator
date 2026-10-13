/* Small fetch-based HTTP client that keeps the session cookie between requests. */

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = '';
  }

  async raw(method, urlPath, { body, form, headers = {} } = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const res = await fetch(this.baseUrl + urlPath, { method, headers: h, body: payload });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    if (setCookies.length) this.cookie = setCookies.map((v) => v.split(';')[0]).join('; ');

    const contentType = res.headers.get('content-type') || '';
    const buffer = Buffer.from(await res.arrayBuffer());
    let parsed = buffer.toString('utf8');
    if (contentType.includes('application/json')) {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    return { status: res.status, body: parsed, headers: res.headers, buffer };
  }

  request(method, apiPath, body) { return this.raw(method, `/api${apiPath}`, { body }); }
  get(p) { return this.request('GET', p); }
  post(p, body) { return this.request('POST', p, body); }
  put(p, body) { return this.request('PUT', p, body); }
  patch(p, body) { return this.request('PATCH', p, body); }
  delete(p) { return this.request('DELETE', p); }

  upload(apiPath, { filename = 'test.txt', content = 'hello', type = 'text/plain' } = {}) {
    const form = new FormData();
    form.append('file', new Blob([content], { type }), filename);
    return this.raw('POST', `/api${apiPath}`, { form });
  }

  login(username, password) {
    return this.post('/auth/login', { username, password });
  }
}

module.exports = { ApiClient };
