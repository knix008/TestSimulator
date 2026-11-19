// Automatic analysis of a capture: the problems (expert information of every packet) and findings
// that a network engineer would look for first — TCP trouble, DNS and HTTP errors, old TLS, cleartext
// credentials, duplicate IP addresses, rogue DHCP servers, port scans, broadcast storms, malformed
// packets — plus an overview (top talkers, protocols). Each finding carries a display filter that shows
// its packets. Texts are i18n keys with parameters (the UI translates); no DOM.
//
// analyzeCapture(frames, summaries, getDissection, { indices, limitProblems }) → {
//   overview: { packets, bytes, duration, start, end, protocols: [{ name, packets }], talkers: [{ address, packets, bytes }] },
//   problems: [{ no, severity, group, protocol, message }],
//   findings: [{ id, severity: 'info'|'note'|'warn'|'error', key, params, filter, count, frames: [no] }],
// }

const RANK = { chat: 1, note: 2, warn: 3, error: 4 };
const first = (d, name) => d?.fields?.get(name)?.[0]?.value;
const has = (d, name) => Boolean(d?.fields?.get(name)?.length);
const all = (d, name) => (d?.fields?.get(name) ?? []).map((n) => n.value);
const num = (value) => (typeof value === 'bigint' ? Number(value) : Number(value));

const TLS_NAMES = { 0x0300: 'SSL 3.0', 0x0301: 'TLS 1.0', 0x0302: 'TLS 1.1' };
const DNS_RCODES = { 1: 'FormErr', 2: 'ServFail', 3: 'NXDomain', 4: 'NotImp', 5: 'Refused' };

/** Analysis of the frames (or of `indices` only). Synchronous; the app runs it in slices with `step`. */
export function createAnalyzer({ limitProblems = 20000 } = {}) {
  const st = {
    packets: 0, bytes: 0, start: Infinity, end: -Infinity, protocols: new Map(), talkers: new Map(),
    problems: [], problemCount: 0, tcp: 0, retrans: [], dupAck: [], zeroWin: [], rst: [], lost: [], outOfOrder: [],
    dnsQueries: 0, dnsErrors: new Map(), dnsErrorFrames: [], http4: [], http5: [], oldTls: new Map(), oldTlsFrames: [],
    creds: [], credProtocols: new Set(), arp: new Map(), arpConflicts: new Map(), dhcpServers: new Map(), broadcast: 0, broadcastFrames: [],
    synTargets: new Map(), icmpUnreach: [], ttlExceeded: [], malformed: [], cleartext: new Map(),
  };

  function add(frame, summary, d) {
    const no = frame.no;
    const len = frame.len ?? frame.caplen ?? 0;
    const time = frame.sec + frame.nsec / 1e9;
    st.packets += 1;
    st.bytes += len;
    st.start = Math.min(st.start, time);
    st.end = Math.max(st.end, time);
    const proto = summary?.protocol || d?.columns?.protocol || '';
    st.protocols.set(proto, (st.protocols.get(proto) ?? 0) + 1);
    for (const side of ['src', 'dst']) {
      const address = first(d, `ip.${side}`) ?? first(d, `ipv6.${side}`) ?? first(d, `eth.${side}`);
      if (address == null) continue;
      const key = String(address);
      const tk = st.talkers.get(key) ?? { address: key, packets: 0, bytes: 0 };
      tk.packets += 1;
      tk.bytes += len;
      st.talkers.set(key, tk);
    }

    // Problems: every expert item of the packet.
    for (const e of d?.expert ?? []) {
      st.problemCount += 1;
      if (st.problems.length < limitProblems) st.problems.push({ no, severity: e.severity, group: e.group ?? '', protocol: (e.abbrev ?? '').split('.')[0] || proto, message: e.message ?? '' });
      if (/malformed/i.test(e.group ?? '') || /malformed/i.test(e.message ?? '')) st.malformed.push(no);
    }
    if (has(d, '_ws.malformed') && !st.malformed.includes(no)) st.malformed.push(no);

    // TCP.
    if (has(d, 'tcp')) {
      st.tcp += 1;
      if (has(d, 'tcp.analysis.retransmission') || has(d, 'tcp.analysis.fast_retransmission')) st.retrans.push(no);
      if (has(d, 'tcp.analysis.duplicate_ack')) st.dupAck.push(no);
      if (has(d, 'tcp.analysis.zero_window')) st.zeroWin.push(no);
      if (has(d, 'tcp.analysis.lost_segment')) st.lost.push(no);
      if (has(d, 'tcp.analysis.out_of_order')) st.outOfOrder.push(no);
      if (first(d, 'tcp.flags.reset')) st.rst.push(no);
      // Port scan: SYN without ACK from one source to many ports.
      if (first(d, 'tcp.flags.syn') && !first(d, 'tcp.flags.ack')) {
        const src = String(first(d, 'ip.src') ?? first(d, 'ipv6.src') ?? '');
        const target = st.synTargets.get(src) ?? { ports: new Set(), hosts: new Set(), frames: [] };
        target.ports.add(num(first(d, 'tcp.dstport')));
        target.hosts.add(String(first(d, 'ip.dst') ?? first(d, 'ipv6.dst') ?? ''));
        if (target.frames.length < 50) target.frames.push(no);
        st.synTargets.set(src, target);
      }
    }

    // DNS.
    if (has(d, 'dns')) {
      if (!first(d, 'dns.flags.response')) st.dnsQueries += 1;
      const rcode = num(first(d, 'dns.flags.rcode'));
      if (first(d, 'dns.flags.response') && rcode) {
        const name = DNS_RCODES[rcode] ?? `rcode ${rcode}`;
        st.dnsErrors.set(name, (st.dnsErrors.get(name) ?? 0) + 1);
        st.dnsErrorFrames.push(no);
      }
    }

    // HTTP.
    const code = num(first(d, 'http.response.code'));
    if (code >= 500) st.http5.push(no); else if (code >= 400) st.http4.push(no);

    // TLS versions below 1.2 offered or chosen.
    for (const version of [first(d, 'tls.handshake.version'), first(d, 'tls.record.version')]) {
      const v = num(version);
      if (TLS_NAMES[v] && has(d, 'tls.handshake.type')) {
        st.oldTls.set(TLS_NAMES[v], (st.oldTls.get(TLS_NAMES[v]) ?? 0) + 1);
        st.oldTlsFrames.push(no);
        break;
      }
    }

    // Cleartext credentials and protocols.
    if (has(d, 'http.authorization') || has(d, 'http.authbasic')) { st.creds.push(no); st.credProtocols.add('HTTP'); }
    for (const p of ['ftp', 'pop', 'imap', 'smtp']) {
      const cmd = String(first(d, `${p}.request.command`) ?? '').toUpperCase();
      if (cmd === 'PASS' || cmd === 'LOGIN' || cmd === 'AUTH' || cmd === 'USER') { st.creds.push(no); st.credProtocols.add(p.toUpperCase()); }
    }
    for (const p of ['telnet', 'ftp', 'http', 'pop', 'imap', 'smtp', 'snmp', 'tftp']) if (has(d, p)) st.cleartext.set(p.toUpperCase(), (st.cleartext.get(p.toUpperCase()) ?? 0) + 1);

    // ARP: one IP claimed by two MAC addresses.
    const arpIp = first(d, 'arp.src.proto_ipv4');
    const arpMac = first(d, 'arp.src.hw_mac');
    if (arpIp && arpMac && arpIp !== '0.0.0.0') {
      const seen = st.arp.get(arpIp);
      if (!seen) st.arp.set(arpIp, String(arpMac));
      else if (seen !== String(arpMac)) {
        const c = st.arpConflicts.get(arpIp) ?? { macs: new Set([seen]), frames: [] };
        c.macs.add(String(arpMac));
        c.frames.push(no);
        st.arpConflicts.set(arpIp, c);
      }
    }

    // DHCP offers / acks: who answers.
    const dhcpType = num(first(d, 'dhcp.option.dhcp'));
    if (dhcpType === 2 || dhcpType === 5) {
      const server = String(first(d, 'dhcp.option.dhcp_server_id') ?? first(d, 'ip.src') ?? '');
      if (server) st.dhcpServers.set(server, (st.dhcpServers.get(server) ?? 0) + 1);
    }

    // Broadcast frames.
    if (String(first(d, 'eth.dst') ?? '').toLowerCase() === 'ff:ff:ff:ff:ff:ff') { st.broadcast += 1; if (st.broadcastFrames.length < 50) st.broadcastFrames.push(no); }

    // ICMP errors.
    const icmpType = num(first(d, 'icmp.type'));
    if (icmpType === 3 || num(first(d, 'icmpv6.type')) === 1) st.icmpUnreach.push(no);
    if (icmpType === 11 || num(first(d, 'icmpv6.type')) === 3) st.ttlExceeded.push(no);
  }

  function result() {
    const findings = [];
    const push = (id, severity, key, params, filter, frames = []) => findings.push({ id, severity, key, params, filter, count: params.count ?? frames.length, frames: frames.slice(0, 200) });
    const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
    if (st.retrans.length) push('retrans', pct(st.retrans.length, st.tcp) >= 2 ? 'warn' : 'note', 'retrans', { count: st.retrans.length, percent: pct(st.retrans.length, st.tcp) }, 'tcp.analysis.retransmission || tcp.analysis.fast_retransmission', st.retrans);
    if (st.dupAck.length) push('dupack', 'note', 'dupAck', { count: st.dupAck.length }, 'tcp.analysis.duplicate_ack', st.dupAck);
    if (st.lost.length) push('lost', 'warn', 'lostSegment', { count: st.lost.length }, 'tcp.analysis.lost_segment', st.lost);
    if (st.outOfOrder.length) push('ooo', 'note', 'outOfOrder', { count: st.outOfOrder.length }, 'tcp.analysis.out_of_order', st.outOfOrder);
    if (st.zeroWin.length) push('zerowin', 'warn', 'zeroWindow', { count: st.zeroWin.length }, 'tcp.analysis.zero_window', st.zeroWin);
    if (st.rst.length) push('rst', st.rst.length > 20 ? 'warn' : 'note', 'tcpReset', { count: st.rst.length }, 'tcp.flags.reset == 1', st.rst);
    if (st.dnsErrorFrames.length) push('dns', 'warn', 'dnsErrors', { count: st.dnsErrorFrames.length, kinds: [...st.dnsErrors].map(([k, v]) => `${k} ${v}`).join(', ') }, 'dns.flags.rcode != 0', st.dnsErrorFrames);
    if (st.http5.length) push('http5', 'error', 'http5xx', { count: st.http5.length }, 'http.response.code >= 500', st.http5);
    if (st.http4.length) push('http4', 'warn', 'http4xx', { count: st.http4.length }, 'http.response.code >= 400 && http.response.code < 500', st.http4);
    if (st.oldTlsFrames.length) push('tls', 'warn', 'oldTls', { count: st.oldTlsFrames.length, versions: [...st.oldTls.keys()].join(', ') }, 'tls.handshake.version < 0x0303', st.oldTlsFrames);
    if (st.creds.length) push('creds', 'error', 'cleartextCredentials', { count: st.creds.length, protocols: [...st.credProtocols].join(', ') }, 'http.authorization || ftp.request.command == "PASS" || pop.request.command == "PASS" || imap.request.command == "LOGIN"', st.creds);
    for (const [ip, c] of st.arpConflicts) push(`arp-${ip}`, 'error', 'duplicateIp', { ip, macs: [...c.macs].join(', '), count: c.frames.length }, `arp.src.proto_ipv4 == ${ip}`, c.frames);
    if (st.dhcpServers.size > 1) push('dhcp', 'warn', 'multipleDhcp', { servers: [...st.dhcpServers.keys()].join(', '), count: st.dhcpServers.size }, 'dhcp.option.dhcp == 2 || dhcp.option.dhcp == 5');
    for (const [src, target] of st.synTargets) {
      if (target.ports.size >= 20) push(`scan-${src}`, 'error', 'portScan', { src, ports: target.ports.size, hosts: target.hosts.size, count: target.ports.size }, `ip.src == ${src} && tcp.flags.syn == 1 && tcp.flags.ack == 0`, target.frames);
    }
    if (st.packets >= 50 && pct(st.broadcast, st.packets) >= 10) push('bcast', 'warn', 'broadcast', { percent: pct(st.broadcast, st.packets), count: st.broadcast }, 'eth.dst == ff:ff:ff:ff:ff:ff', st.broadcastFrames);
    if (st.icmpUnreach.length) push('unreach', 'note', 'unreachable', { count: st.icmpUnreach.length }, 'icmp.type == 3 || icmpv6.type == 1', st.icmpUnreach);
    if (st.ttlExceeded.length) push('ttl', 'note', 'ttlExceeded', { count: st.ttlExceeded.length }, 'icmp.type == 11 || icmpv6.type == 3', st.ttlExceeded);
    if (st.malformed.length) push('malformed', 'error', 'malformed', { count: st.malformed.length }, '_ws.malformed', st.malformed);
    const clear = [...st.cleartext].filter(([name]) => name !== 'HTTP' || st.cleartext.get('HTTP') > 0);
    if (clear.length) push('cleartext', 'info', 'cleartextProtocols', { protocols: clear.map(([n, c]) => `${n} (${c})`).join(', '), count: clear.reduce((n, [, c]) => n + c, 0) }, clear.map(([n]) => n.toLowerCase()).join(' || '));
    if (!findings.some((f) => f.severity === 'warn' || f.severity === 'error')) push('healthy', 'info', 'healthy', { count: st.packets });
    const order = { error: 0, warn: 1, note: 2, info: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
    return {
      overview: {
        packets: st.packets, bytes: st.bytes, start: Number.isFinite(st.start) ? st.start : 0, end: Number.isFinite(st.end) ? st.end : 0,
        duration: Number.isFinite(st.start) ? st.end - st.start : 0,
        protocols: [...st.protocols].map(([name, packets]) => ({ name, packets })).sort((a, b) => b.packets - a.packets),
        talkers: [...st.talkers.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 20),
        problemCount: st.problemCount,
        severities: Object.fromEntries(['error', 'warn', 'note', 'chat'].map((s) => [s, st.problems.filter((p) => p.severity === s).length])),
      },
      problems: st.problems.sort((a, b) => (RANK[b.severity] ?? 0) - (RANK[a.severity] ?? 0) || a.no - b.no),
      findings,
    };
  }

  return { add, result };
}

/** One-shot analysis (tests, small captures). */
export function analyzeCapture(frames, summaries, getDissection, { indices = null, limitProblems = 20000 } = {}) {
  const analyzer = createAnalyzer({ limitProblems });
  for (const i of indices ?? frames.map((_, k) => k)) {
    let d = null;
    try { d = getDissection(frames[i]); } catch { d = null; }
    analyzer.add(frames[i], summaries[i], d);
  }
  return analyzer.result();
}

// ───────────────────────── report

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bytesText = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kB` : `${n} B`);

/**
 * A report document. data: { title, file, analysis, log: [{ time, level, text }], hierarchy?: rows, conversations?: rows },
 * sections: Set of 'overview' | 'findings' | 'problems' | 'protocols' | 'talkers' | 'log'. t(key, params) translates.
 * Returns { html, markdown, lines, blocks, title } (lines: plain text for the print window; blocks: docexport.js).
 */
export function buildReport(data, sections, t) {
  const a = data.analysis;
  const md = [];
  const html = [];
  const lines = [];
  const blocks = [];
  const date = new Date().toLocaleString();
  const h = (level, text) => { if (level > 1) blocks.push({ type: 'h', level, text }); md.push(`${'#'.repeat(level)} ${text}`, ''); html.push(`<h${level}>${esc(text)}</h${level}>`); lines.push(level === 1 ? text.toUpperCase() : text, level === 1 ? '='.repeat(Math.min(80, text.length)) : '-'.repeat(Math.min(80, text.length))); };
  const p = (text) => { blocks.push({ type: 'p', text }); md.push(text, ''); html.push(`<p>${esc(text)}</p>`); lines.push(text, ''); };
  const table = (heads, rows) => {
    if (!rows.length) { p(t('report.none')); return; }
    blocks.push({ type: 'table', columns: heads.map((label) => ({ label: String(label) })), rows: rows.map((r) => ({ cells: r.map((c) => String(c ?? '')) })) });
    md.push(`| ${heads.join(' | ')} |`, `| ${heads.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`), '');
    html.push(`<table><thead><tr>${heads.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    const widths = heads.map((x, i) => Math.min(40, Math.max(String(x).length, ...rows.map((r) => String(r[i]).length))));
    const fmt = (r) => r.map((c, i) => String(c).slice(0, widths[i]).padEnd(widths[i])).join('  ');
    lines.push(fmt(heads), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(fmt), '');
  };
  h(1, t('report.heading', { title: data.title }));
  p(t('report.generated', { date, file: data.file ?? data.title }));
  if (sections.has('overview')) {
    h(2, t('report.overview'));
    const o = a.overview;
    table([t('report.item'), t('report.value')], [
      [t('report.packets'), o.packets], [t('report.bytes'), bytesText(o.bytes)], [t('report.duration'), `${o.duration.toFixed(3)} s`],
      [t('report.start'), o.start ? new Date(o.start * 1000).toLocaleString() : '-'], [t('report.end'), o.end ? new Date(o.end * 1000).toLocaleString() : '-'],
      [t('report.avgRate'), o.duration > 0 ? `${(o.packets / o.duration).toFixed(1)} pkt/s, ${bytesText(o.bytes / o.duration)}/s` : '-'],
      [t('report.problems'), `${o.problemCount} (${t('expert.error')} ${o.severities.error}, ${t('expert.warn')} ${o.severities.warn}, ${t('expert.note')} ${o.severities.note})`],
    ]);
  }
  if (sections.has('findings')) {
    h(2, t('report.findings'));
    table([t('report.severity'), t('report.finding'), t('report.detail'), t('report.count'), t('report.filter')], a.findings.map((f) => [t(`severity.${f.severity}`), t(`finding.${f.key}.title`, f.params), t(`finding.${f.key}.detail`, f.params), f.count, f.filter ?? '']));
  }
  if (sections.has('protocols')) {
    h(2, t('report.protocols'));
    table([t('column.protocol'), t('report.packets'), '%'], a.overview.protocols.slice(0, 30).map((x) => [x.name, x.packets, ((x.packets / Math.max(1, a.overview.packets)) * 100).toFixed(1)]));
  }
  if (sections.has('talkers')) {
    h(2, t('report.talkers'));
    table([t('capopts.addresses'), t('report.packets'), t('report.bytes')], a.overview.talkers.map((x) => [x.address, x.packets, bytesText(x.bytes)]));
  }
  if (sections.has('problems')) {
    h(2, t('report.problemList'));
    const list = a.problems.slice(0, 500);
    table([t('column.no'), t('report.severity'), t('report.group'), t('column.protocol'), t('report.message')], list.map((x) => [x.no, t(`expert.${x.severity}`), x.group, x.protocol, x.message]));
    if (a.problems.length > list.length) p(t('report.more', { count: a.problems.length - list.length }));
  }
  if (sections.has('log')) {
    h(2, t('report.log'));
    table([t('report.time'), t('report.level'), t('report.message')], (data.log ?? []).map((x) => [new Date(x.time).toLocaleTimeString(), x.level, x.text]));
  }
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('report.heading', { title: data.title }))}</title><style>
body{font:14px/1.5 "Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif;margin:32px auto;max-width:1100px;color:#1d2433;padding:0 20px}
h1{font-size:24px;border-bottom:3px solid #2b6cf6;padding-bottom:6px}h2{font-size:18px;margin-top:28px;color:#2b4fbf}
table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:13px}th,td{border:1px solid #d5dbe6;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#eef3fc}tr:nth-child(even) td{background:#f8fafd}td:last-child{font-family:Consolas,"D2Coding",monospace;font-size:12px}
@media print{body{margin:0;max-width:none}}</style></head><body>${html.join('\n')}<p style="color:#7a8599;font-size:12px">MyNetManager</p></body></html>`;
  // blocks: the same report for docexport.js (PDF, Word); its title is the first heading.
  return { html: page, markdown: md.join('\n'), lines, blocks, title: t('report.heading', { title: data.title }) };
}
