// SIP (RFC 3261) over UDP/TCP and SDP (RFC 4566). SDP media lines bind RTP/RTCP conversations.
import { registerProtocol, ascii, utf8, findLineEnd, printable } from '../core.js';
import { rtpPtName, rtpSetup } from './rtp.js';
import { textLines } from './iot.js';

const METHODS = new Set(['INVITE', 'ACK', 'BYE', 'CANCEL', 'OPTIONS', 'REGISTER', 'PRACK', 'SUBSCRIBE', 'NOTIFY', 'PUBLISH', 'INFO', 'REFER', 'MESSAGE', 'UPDATE']);
// compact header forms (RFC 3261 7.3.3 and extensions)
const COMPACT = { v: 'Via', f: 'From', t: 'To', i: 'Call-ID', m: 'Contact', l: 'Content-Length', c: 'Content-Type', k: 'Supported', s: 'Subject', e: 'Content-Encoding', o: 'Event', u: 'Allow-Events', r: 'Refer-To', b: 'Referred-By', x: 'Session-Expires', a: 'Accept-Contact', j: 'Reject-Contact', d: 'Request-Disposition', y: 'Identity', n: 'Identity-Info' };
const HDRS = ['Accept', 'Accept-Contact', 'Accept-Encoding', 'Accept-Language', 'Alert-Info', 'Allow', 'Allow-Events', 'Authentication-Info', 'Authorization', 'Call-ID', 'Call-Info', 'Contact', 'Content-Disposition', 'Content-Encoding', 'Content-Language', 'Content-Length', 'Content-Type', 'CSeq', 'Date', 'Error-Info', 'Event', 'Expires', 'From', 'In-Reply-To', 'Max-Forwards', 'MIME-Version', 'Min-Expires', 'Min-SE', 'Organization', 'Priority', 'Proxy-Authenticate', 'Proxy-Authorization', 'Proxy-Require', 'RAck', 'Reason', 'Record-Route', 'Refer-To', 'Reply-To', 'Require', 'Retry-After', 'Route', 'RSeq', 'Server', 'Session-Expires', 'Subject', 'Subscription-State', 'Supported', 'Timestamp', 'To', 'Unsupported', 'User-Agent', 'Via', 'Warning', 'WWW-Authenticate', 'Path', 'Privacy', 'Reject-Contact', 'Request-Disposition', 'Service-Route', 'Identity'];
const UINT_HDRS = new Set(['Content-Length', 'Expires', 'Max-Forwards', 'Retry-After', 'RSeq']);
const HDR_BY_LOWER = new Map(HDRS.map((h) => [h.toLowerCase(), h]));
for (const [k, v] of Object.entries(COMPACT)) HDR_BY_LOWER.set(k, v);

const fields = [
  ['sip.Method', 'Method', 'string'],
  ['sip.Request-Line', 'Request-Line', 'string'],
  ['sip.r-uri', 'Request-URI', 'string'],
  ['sip.r-uri.user', 'Request-URI User Part', 'string'],
  ['sip.r-uri.host', 'Request-URI Host Part', 'string'],
  ['sip.r-uri.port', 'Request-URI Host Port', 'string'],
  ['sip.Status-Code', 'Status-Code', 'uint32'],
  ['sip.Status-Line', 'Status-Line', 'string'],
  ['sip.resend', 'Resent Packet', 'bool'],
  ['sip.resend-original', 'Suspected resend of frame', 'framenum'],
  ['sip.response-request', 'Request Frame', 'framenum'],
  ['sip.response-time', 'Response Time (ms)', 'uint32'],
  ['sip.msg_hdr', 'Message Header', 'string'],
  ['sip.msg_body', 'Message Body', 'bytes'],
  ['sip.call_id_generated', 'Generated Call-ID', 'string'],
  ['sip.display.info', 'SIP Display info', 'string'],
  ['sip.tag', 'SIP tag', 'string'],
  ['sip.CSeq.seq', 'Sequence Number', 'uint32'],
  ['sip.CSeq.method', 'Method', 'string'],
  ['sip.Via.transport', 'Transport', 'string'],
  ['sip.Via.sent-by.address', 'Sent-by Address', 'string'],
  ['sip.Via.sent-by.port', 'Sent-by port', 'uint16'],
  ['sip.Via.branch', 'Branch', 'string'],
  ['sip.Via.rport', 'RPort', 'string'],
  ['sip.Via.received', 'Received', 'string'],
  ['sip.Via.maddr', 'Maddr', 'string'],
  ['sip.Via.ttl', 'TTL', 'string'],
  ['sip.contact.uri', 'Contact URI', 'string'],
  ['sip.contact.user', 'Contact URI User Part', 'string'],
  ['sip.contact.host', 'Contact URI Host Part', 'string'],
  ['sip.contact.port', 'Contact URI Host Port', 'string'],
  ['sip.contact.parameter', 'Contact parameter', 'string'],
  ['sip.unknown-header', 'Unknown Header', 'string'],
];
for (const who of ['from', 'to']) {
  const W = who === 'from' ? 'from' : 'to';
  fields.push([`sip.${W}.display.info`, `SIP ${W} display info`, 'string'], [`sip.${W}.addr`, `SIP ${W} address`, 'string'],
    [`sip.${W}.user`, `SIP ${W} address User Part`, 'string'], [`sip.${W}.host`, `SIP ${W} address Host Part`, 'string'],
    [`sip.${W}.port`, `SIP ${W} address Host Port`, 'string'], [`sip.${W}.tag`, `SIP ${W} tag`, 'string']);
}
for (const h of HDRS) fields.push([`sip.${h}`, h, UINT_HDRS.has(h) ? 'uint32' : 'string']);

registerProtocol({
  abbrev: 'sip', name: 'Session Initiation Protocol', short: 'SIP',
  fields,
  experts: [['sip.malformed', 'warn', 'Malformed', 'Malformed SIP header']],
  tables: { 'udp.port': [5060], 'tcp.port': [5060] },
  heuristics: { udp: sipHeur, tcp: sipHeur },
  tcpPdu(ctx, off, end) {
    const d = ctx.d;
    // headers end at the first empty line; the body length comes from Content-Length
    let o = off, clen = 0;
    for (;;) {
      const le = findLineEnd(d, o, end);
      if (!le) return -1;
      if (le.eol === o) return le.next - off + clen;
      const line = ascii(d, o, le.eol - o);
      const c = line.indexOf(':');
      if (c > 0) {
        const n = line.slice(0, c).trim().toLowerCase();
        if (n === 'content-length' || n === 'l') clen = parseInt(line.slice(c + 1), 10) || 0;
      }
      o = le.next;
    }
  },
  dissect: dissectSip,
});

function sipHeur(ctx, off, end) {
  const d = ctx.d;
  // cheap reject: every SIP start line begins with an upper-case letter
  if (end - off < 12 || d[off] < 0x41 || d[off] > 0x5a) return false;
  const le = findLineEnd(d, off, Math.min(end, off + 512));
  if (!le) return false;
  const line = ascii(d, off, le.eol - off);
  if (line.startsWith('SIP/2.0 ')) return true;
  if (!line.endsWith(' SIP/2.0')) return false;
  return METHODS.has(line.slice(0, line.indexOf(' ')));
}

/** Parse a SIP name-addr / addr-spec: '"Alice" <sip:alice@h:5060;p>;tag=x'. */
function parseAddr(v) {
  let display = '', uri = v, params = '';
  const lt = v.indexOf('<');
  if (lt >= 0) {
    display = v.slice(0, lt).trim();
    const gt = v.indexOf('>', lt);
    uri = v.slice(lt + 1, gt < 0 ? v.length : gt);
    params = gt < 0 ? '' : v.slice(gt + 1);
  } else {
    const sc = v.indexOf(';');
    if (sc >= 0) { uri = v.slice(0, sc); params = v.slice(sc); }
  }
  const u = parseUri(uri);
  let tag = null;
  const m = params.split(';').map((s) => s.trim()).filter(Boolean);
  for (const p of m) if (p.startsWith('tag=')) tag = p.slice(4);
  return { display, uri, ...u, params: m, tag };
}
function parseUri(uri) {
  const colon = uri.indexOf(':');
  let rest = colon >= 0 ? uri.slice(colon + 1) : uri;
  const sc = rest.indexOf(';');
  if (sc >= 0) rest = rest.slice(0, sc);
  const q = rest.indexOf('?');
  if (q >= 0) rest = rest.slice(0, q);
  const at = rest.lastIndexOf('@');
  const user = at >= 0 ? rest.slice(0, at) : null;
  let hostport = at >= 0 ? rest.slice(at + 1) : rest;
  let port = null;
  if (hostport.startsWith('[')) {
    const e = hostport.indexOf(']');
    if (hostport[e + 1] === ':') port = hostport.slice(e + 2);
    hostport = hostport.slice(0, e + 1);
  } else {
    const pc = hostport.lastIndexOf(':');
    if (pc >= 0) { port = hostport.slice(pc + 1); hostport = hostport.slice(0, pc); }
  }
  return { user, host: hostport, port };
}

function dissectSip(ctx, off, end) {
  const d = ctx.d;
  const le = findLineEnd(d, off, end);
  if (!le) return false;
  const first = utf8(d, off, le.eol - off);
  const isResp = first.startsWith('SIP/2.0 ');
  let method = '', ruri = '', code = 0, reason = '';
  if (isResp) {
    code = parseInt(first.slice(8, 11), 10);
    reason = first.slice(12);
    if (!(code >= 100 && code <= 699)) return false;
  } else {
    const sp1 = first.indexOf(' '), sp2 = first.lastIndexOf(' ');
    if (sp1 < 0 || sp2 <= sp1 || !first.endsWith('SIP/2.0')) return false;
    method = first.slice(0, sp1);
    ruri = first.slice(sp1 + 1, sp2);
  }
  // headers
  const hdrs = [];
  let o = le.next, bodyOff = end;
  while (o < end) {
    const l = findLineEnd(d, o, end);
    if (!l) { hdrs.push({ o, len: end - o, line: utf8(d, o, end - o) }); o = end; break; }
    if (l.eol === o) { bodyOff = l.next; break; }
    let line = utf8(d, o, l.eol - o);
    let next = l.next;
    // folded continuation lines
    while (next < end && (d[next] === 0x20 || d[next] === 0x09)) {
      const c = findLineEnd(d, next, end);
      if (!c) break;
      line += ' ' + utf8(d, next, c.eol - next).trim();
      next = c.next;
    }
    hdrs.push({ o, len: next - o, line });
    o = next;
  }
  let callId = '', cseqNum = 0, cseqMethod = '', ctype = '', clen = -1, contacts = 0;
  for (const h of hdrs) {
    const c = h.line.indexOf(':');
    if (c < 0) continue;
    h.name = HDR_BY_LOWER.get(h.line.slice(0, c).trim().toLowerCase()) || h.line.slice(0, c).trim();
    h.value = h.line.slice(c + 1).trim();
    switch (h.name) {
      case 'Call-ID': callId = h.value; break;
      case 'CSeq': { const sp = h.value.indexOf(' '); cseqNum = parseInt(h.value, 10) >>> 0; cseqMethod = sp > 0 ? h.value.slice(sp + 1).trim() : ''; break; }
      case 'Content-Type': ctype = h.value.toLowerCase(); break;
      case 'Content-Length': clen = parseInt(h.value, 10); break;
      case 'Contact': contacts += h.value === '*' ? 0 : h.value.split(',').length; break;
    }
  }
  const bodyEnd = clen >= 0 ? Math.min(end, bodyOff + clen) : end;
  const msgEnd = clen >= 0 && bodyOff + clen <= end ? bodyOff + clen : end;

  // first pass: resend detection and request/response pairing
  const fd = ctx.fd;
  if (ctx.first) {
    const st = ctx.session.st('sip', () => ({ seen: new Map(), reqs: new Map() }));
    const ep = ctx.net ? `${ctx.net.src}:${ctx.srcport}>${ctx.net.dst}:${ctx.dstport}` : '';
    const key = `${ep}|${callId}|${cseqNum}|${cseqMethod}|${isResp ? code : method}`;
    const prev = st.seen.get(key);
    const r = { resend: !!prev, orig: prev || 0 };
    if (!prev) st.seen.set(key, ctx.no);
    // a response pairs with the request sent the opposite way (proxies forward the same transaction)
    const a = ctx.net ? ctx.net.src : '', b = ctx.net ? ctx.net.dst : '';
    const rk = `${callId}|${cseqNum}|${cseqMethod}|`;
    if (!isResp) { if (!st.reqs.has(rk + a + '>' + b) && method !== 'ACK') st.reqs.set(rk + a + '>' + b, { no: ctx.no, rel: fd.rel }); }
    else {
      const q = st.reqs.get(rk + b + '>' + a);
      if (q) { r.req = q.no; r.time = Math.round((fd.rel - q.rel) * 1000); }
    }
    fd.sip = r;
  }
  const s = fd.sip || { resend: false };

  const hasSdp = ctype.startsWith('application/sdp') && bodyOff < bodyEnd;
  ctx.setProtocol(hasSdp ? 'SIP/SDP' : 'SIP');
  let info = isResp ? `Status: ${code} ${reason}` : `Request: ${method} ${ruri}`;
  if (isResp && code >= 200 && cseqMethod) info += ` (${cseqMethod})`;
  if (cseqMethod === 'REGISTER' && (!isResp || (code >= 200 && code < 300))) {
    info += contacts ? `  (${contacts} binding${contacts === 1 ? '' : 's'})` : (isResp ? '' : '  (fetch bindings)');
  }
  info += ' | ';
  if (ctx.infoOwner === 'sip' && ctx.info) ctx.info += info; else { ctx.info = info; ctx.infoOwner = 'sip'; }

  const t = ctx.proto('sip', off, msgEnd - off, `Session Initiation Protocol (${isResp ? code : method})`);
  if (ctx.tree) {
    if (isResp) {
      const sl = ctx.add(t, 'sip.Status-Line', off, le.eol - off, first);
      ctx.add(sl, 'sip.Status-Code', off + 8, 3, code);
      ctx.gen(sl, 'sip.resend', !!s.resend);
      if (s.resend) ctx.gen(sl, 'sip.resend-original', s.orig);
      if (s.req) {
        ctx.gen(sl, 'sip.response-request', s.req, `Request Frame: ${s.req}`);
        ctx.gen(sl, 'sip.response-time', s.time);
      }
    } else {
      const rl = ctx.add(t, 'sip.Request-Line', off, le.eol - off, first);
      ctx.add(rl, 'sip.Method', off, method.length, method);
      const ro = off + method.length + 1;
      const ru = ctx.add(rl, 'sip.r-uri', ro, ruri.length, ruri);
      const u = parseUri(ruri);
      if (u.user !== null) ctx.add(ru, 'sip.r-uri.user', ro, 0, u.user);
      ctx.add(ru, 'sip.r-uri.host', ro, 0, u.host);
      if (u.port) ctx.add(ru, 'sip.r-uri.port', ro, 0, u.port);
      ctx.gen(rl, 'sip.resend', !!s.resend);
      if (s.resend) ctx.gen(rl, 'sip.resend-original', s.orig);
    }
    const mh = ctx.add(t, 'sip.msg_hdr', le.next, Math.max(0, bodyOff - le.next), '', 'Message Header');
    for (const h of hdrs) header(ctx, mh, h);
  }
  if (bodyOff < bodyEnd) {
    const bn = ctx.add(t, 'sip.msg_body', bodyOff, bodyEnd - bodyOff, d.subarray(bodyOff, bodyEnd), 'Message Body');
    if (hasSdp) sdp(ctx, bn, bodyOff, bodyEnd, callId, !isResp);
    else if (ctype.startsWith('text/plain')) textLines(ctx, bn, bodyOff, bodyEnd, 'text/plain');
  }
  return msgEnd - off;
}

function header(ctx, parent, h) {
  const { o, len } = h;
  if (!h.name) { ctx.text(parent, printable(h.line), o, len); return; }
  const abbrev = `sip.${h.name}`;
  const known = HDRS.includes(h.name);
  if (!known) { ctx.add(parent, 'sip.unknown-header', o, len, h.line, printable(h.line)); return; }
  const v = h.value;
  const label = `${h.name}: ${printable(v)}`;
  if (UINT_HDRS.has(h.name)) { ctx.add(parent, abbrev, o, len, parseInt(v, 10) >>> 0, label); return; }
  const n = ctx.add(parent, abbrev, o, len, v, label);
  switch (h.name) {
    case 'Via': {
      for (const one of v.split(',')) {
        const m = one.trim();
        const sp = m.indexOf(' ');
        const proto = m.slice(0, sp);
        const transport = proto.split('/')[2] || '';
        const rest = m.slice(sp + 1).trim();
        const parts = rest.split(';').map((x) => x.trim());
        const hp = parseUri('x:' + parts[0]);
        ctx.add(n, 'sip.Via.transport', o, 0, transport);
        ctx.add(n, 'sip.Via.sent-by.address', o, 0, hp.host);
        if (hp.port) ctx.add(n, 'sip.Via.sent-by.port', o, 0, parseInt(hp.port, 10));
        for (const p of parts.slice(1)) {
          const eq = p.indexOf('=');
          const k = (eq < 0 ? p : p.slice(0, eq)).toLowerCase(), val = eq < 0 ? p : p.slice(eq + 1);
          if (k === 'branch') ctx.add(n, 'sip.Via.branch', o, 0, val);
          else if (k === 'rport') ctx.add(n, 'sip.Via.rport', o, 0, val);
          else if (k === 'received') ctx.add(n, 'sip.Via.received', o, 0, val);
          else if (k === 'maddr') ctx.add(n, 'sip.Via.maddr', o, 0, val);
          else if (k === 'ttl') ctx.add(n, 'sip.Via.ttl', o, 0, val);
        }
      }
      break;
    }
    case 'From': case 'To': {
      const w = h.name === 'From' ? 'from' : 'to';
      const a = parseAddr(v);
      if (a.display) { ctx.add(n, `sip.${w}.display.info`, o, 0, a.display); ctx.hidden(n, 'sip.display.info', o, 0, a.display); }
      const an = ctx.add(n, `sip.${w}.addr`, o, 0, a.uri);
      if (a.user !== null) ctx.add(an, `sip.${w}.user`, o, 0, a.user);
      ctx.add(an, `sip.${w}.host`, o, 0, a.host);
      if (a.port) ctx.add(an, `sip.${w}.port`, o, 0, a.port);
      if (a.tag) { ctx.add(n, `sip.${w}.tag`, o, 0, a.tag); ctx.hidden(n, 'sip.tag', o, 0, a.tag); }
      break;
    }
    case 'Contact': {
      if (v === '*') break;
      for (const one of v.split(',')) {
        const a = parseAddr(one.trim());
        const cn = ctx.add(n, 'sip.contact.uri', o, 0, a.uri);
        if (a.user !== null) ctx.add(cn, 'sip.contact.user', o, 0, a.user);
        ctx.add(cn, 'sip.contact.host', o, 0, a.host);
        if (a.port) ctx.add(cn, 'sip.contact.port', o, 0, a.port);
        for (const p of a.params) ctx.add(n, 'sip.contact.parameter', o, 0, p);
      }
      break;
    }
    case 'Call-ID':
      ctx.gen(parent, 'sip.call_id_generated', v);
      break;
    case 'CSeq': {
      const sp = v.indexOf(' ');
      ctx.add(n, 'sip.CSeq.seq', o, 0, parseInt(v, 10) >>> 0);
      ctx.add(n, 'sip.CSeq.method', o, 0, sp > 0 ? v.slice(sp + 1).trim() : '');
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// SDP
const SDP_LINES = {
  v: ['sdp.version', 'Session Description Protocol Version (v)'], o: ['sdp.owner', 'Owner/Creator, Session Id (o)'],
  s: ['sdp.session_name', 'Session Name (s)'], i: ['sdp.session_info', 'Session Information (i)'], u: ['sdp.uri', 'URI of Description (u)'],
  e: ['sdp.email', 'E-mail Address (e)'], p: ['sdp.phone', 'Phone Number (p)'], c: ['sdp.connection_info', 'Connection Information (c)'],
  b: ['sdp.bandwidth', 'Bandwidth Information (b)'], t: ['sdp.time', 'Time Description, active time (t)'], r: ['sdp.repeat_time', 'Repeat Time (r)'],
  z: ['sdp.timezone', 'Time Zone Adjustments (z)'], k: ['sdp.encryption_key', 'Encryption Key (k)'], m: ['sdp.media', 'Media Description, name and address (m)'],
};
registerProtocol({
  abbrev: 'sdp', name: 'Session Description Protocol', short: 'SDP',
  fields: [
    ...Object.values(SDP_LINES).map(([a, n]) => [a, n, 'string']),
    ['sdp.session_attr', 'Session Attribute (a)', 'string'],
    ['sdp.media_attr', 'Media Attribute (a)', 'string'],
    ['sdp.media_title', 'Media Title (i)', 'string'],
    ['sdp.owner.username', 'Owner Username', 'string'],
    ['sdp.owner.sessionid', 'Session ID', 'string'],
    ['sdp.owner.version', 'Session Version', 'string'],
    ['sdp.owner.network_type', 'Owner Network Type', 'string'],
    ['sdp.owner.address_type', 'Owner Address Type', 'string'],
    ['sdp.owner.address', 'Owner Address', 'string'],
    ['sdp.connection_info.network_type', 'Connection Network Type', 'string'],
    ['sdp.connection_info.address_type', 'Connection Address Type', 'string'],
    ['sdp.connection_info.address', 'Connection Address', 'string'],
    ['sdp.time.start', 'Session Start Time', 'string'],
    ['sdp.time.stop', 'Session Stop Time', 'string'],
    ['sdp.bandwidth.modifier', 'Bandwidth Modifier', 'string'],
    ['sdp.bandwidth.value', 'Bandwidth Value', 'string'],
    ['sdp.session_attr.field', 'Session Attribute Fieldname', 'string'],
    ['sdp.session_attr.value', 'Session Attribute Value', 'string'],
    ['sdp.media.media', 'Media Type', 'string'],
    ['sdp.media.port', 'Media Port', 'uint16'],
    ['sdp.media.port_string', 'Media Port', 'string'],
    ['sdp.media.portcount', 'Media Port Count', 'string'],
    ['sdp.media.proto', 'Media Protocol', 'string'],
    ['sdp.media.format', 'Media Format', 'string'],
    ['sdp.media_attribute.field', 'Media Attribute Fieldname', 'string'],
    ['sdp.media_attribute.value', 'Media Attribute Value', 'string'],
    ['sdp.mime.type', 'MIME Type', 'string'],
    ['sdp.sample_rate', 'Sample Rate', 'string'],
    ['sdp.channels', 'Audio Channels', 'string'],
  ],
  tables: {},
  dissect(ctx, off, end) { sdp(ctx, null, off, end, ''); return end - off; },
});

/** Dissect SDP below `parent` (the SIP body) and set up RTP/RTCP for its media. */
export function sdp(ctx, parent, off, end, callId, isOffer = true) {
  const d = ctx.d;
  const t = parent ? ctx.subProto(parent, 'sdp', off, end - off) : ctx.proto('sdp', off, end - off);
  let connAddr = null, inMedia = false;
  const media = [];
  for (let o = off; o < end;) {
    const le = findLineEnd(d, o, end);
    const eol = le ? le.eol : end, next = le ? le.next : end;
    const lo = o;
    const line = utf8(d, o, eol - o);
    o = next;
    if (line.length < 2 || line[1] !== '=') { if (line) ctx.text(t, printable(line), lo, eol - lo); continue; }
    const k = line[0], v = line.slice(2);
    if (k === 'a') {
      const ab = inMedia ? 'sdp.media_attr' : 'sdp.session_attr';
      const n = ctx.add(t, ab, lo, line.length, v, `${inMedia ? 'Media' : 'Session'} Attribute (a): ${printable(v)}`);
      if (ctx.tree) attribute(ctx, n, lo, v, inMedia);
      continue;
    }
    const def = SDP_LINES[k];
    if (!def) { ctx.text(t, printable(line), lo, line.length); continue; }
    const n = ctx.add(t, def[0], lo, line.length, v, `${def[1]}: ${printable(v)}`);
    const parts = v.split(' ');
    switch (k) {
      case 'o':
        if (ctx.tree) ['username', 'sessionid', 'version', 'network_type', 'address_type', 'address'].forEach((f, i) => { if (parts[i] !== undefined) ctx.add(n, `sdp.owner.${f}`, lo, 0, parts[i]); });
        break;
      case 'c': {
        if (ctx.tree) ['network_type', 'address_type', 'address'].forEach((f, i) => { if (parts[i] !== undefined) ctx.add(n, `sdp.connection_info.${f}`, lo, 0, parts[i]); });
        const a = (parts[2] || '').split('/')[0];
        if (inMedia && media.length) media[media.length - 1].addr = a; else connAddr = a;
        break;
      }
      case 't':
        ctx.add(n, 'sdp.time.start', lo, 0, parts[0] || '');
        if (parts[1] !== undefined) ctx.add(n, 'sdp.time.stop', lo, 0, parts[1]);
        break;
      case 'b': {
        const c = v.indexOf(':');
        if (c > 0) { ctx.add(n, 'sdp.bandwidth.modifier', lo, 0, v.slice(0, c)); ctx.add(n, 'sdp.bandwidth.value', lo, 0, v.slice(c + 1)); }
        break;
      }
      case 'm': {
        inMedia = true;
        const [port, count] = (parts[1] || '').split('/');
        const pn = parseInt(port, 10);
        media.push({ type: parts[0], port: pn, proto: parts[2] || '', addr: null });
        if (ctx.tree) {
          ctx.add(n, 'sdp.media.media', lo, 0, parts[0]);
          ctx.hidden(n, 'sdp.media.port_string', lo, 0, port);
          ctx.add(n, 'sdp.media.port', lo, 0, pn);
          if (count) ctx.add(n, 'sdp.media.portcount', lo, 0, count);
          ctx.add(n, 'sdp.media.proto', lo, 0, parts[2] || '');
          const rtp = (parts[2] || '').startsWith('RTP/');
          for (const f of parts.slice(3)) ctx.add(n, 'sdp.media.format', lo, 0, rtp && /^\d+$/.test(f) ? rtpPtName(+f) : f);
        }
        break;
      }
    }
  }
  if (callId) ctx.gen(t, 'sip.call_id_generated', callId);
  // bind RTP/RTCP media streams (first pass; frame order makes later SDP win)
  if (ctx.first && !ctx.inError) {
    // Wireshark reports the offer's frame as the setup frame of both directions of a call
    const offers = ctx.session.st('sdpOffer', () => new Map());
    let setupFrame = ctx.no;
    if (callId) { if (isOffer) offers.set(callId, ctx.no); else setupFrame = offers.get(callId) || ctx.no; }
    for (const m of media) {
      const addr = m.addr || connAddr;
      if (!addr || !m.port || !m.proto.startsWith('RTP/')) continue;
      rtpSetup(ctx.session, addr, m.port, ctx.no, callId, setupFrame);
    }
  }
}

function attribute(ctx, n, lo, v, inMedia) {
  const c = v.indexOf(':');
  const name = c < 0 ? v : v.slice(0, c), val = c < 0 ? null : v.slice(c + 1);
  if (c < 0) return; // flag attributes (sendrecv...) have no children in Wireshark
  ctx.add(n, inMedia ? 'sdp.media_attribute.field' : 'sdp.session_attr.field', lo, 0, name);
  if (name === 'rtpmap' && inMedia) {
    const sp = val.indexOf(' ');
    ctx.add(n, 'sdp.media.format', lo, 0, val.slice(0, sp));
    const enc = val.slice(sp + 1).split('/');
    ctx.add(n, 'sdp.mime.type', lo, 0, enc[0]);
    if (enc[1]) ctx.add(n, 'sdp.sample_rate', lo, 0, enc[1]);
    if (enc[2]) ctx.add(n, 'sdp.channels', lo, 0, enc[2]);
    return;
  }
  ctx.add(n, inMedia ? 'sdp.media_attribute.value' : 'sdp.session_attr.value', lo, 0, val);
}
