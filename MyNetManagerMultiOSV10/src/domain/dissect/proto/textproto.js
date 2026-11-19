// Line-oriented TCP application protocols: FTP / FTP-DATA, SMTP (+ IMF), POP, IMAP, Telnet.
import { registerProtocol, u16, utf8, ascii, printable } from '../core.js';
import { media, textLines } from './http.js';

// ---- helpers
/** Split [o, end) into lines: [{ s, e (text end), n (next) }]. A last line without LF is included. */
function lines(d, o, end) {
  const out = [];
  while (o < end) {
    let i = o;
    while (i < end && d[i] !== 10) i++;
    const e = i < end && i > o && d[i - 1] === 13 ? i - 1 : i;
    out.push({ s: o, e, n: i < end ? i + 1 : end });
    o = i + 1;
  }
  return out;
}
const txt = (d, l) => utf8(d, l.s, l.e - l.s);
const eolLabel = (d, l) => (l.n > l.e ? (l.n - l.e === 2 ? '\\r\\n' : '\\n') : '');
/** Is the packet going to the well-known server port? */
function toServer(ctx, ports) { return ports.includes(ctx.dstport) && !ports.includes(ctx.srcport) ? true : ports.includes(ctx.srcport) && !ports.includes(ctx.dstport) ? false : ctx.dstport < ctx.srcport; }
function isDigit(c) { return c >= 48 && c <= 57; }
function streamKey(ctx) { return ctx.tcpStream !== undefined ? ctx.tcpStream : -1; }

// ============================================================================================
// FTP
const FTP_CODES = { 110: 'Restart marker reply', 120: 'Service ready in nnn minutes', 125: 'Data connection already open; transfer starting', 150: 'File status okay; about to open data connection', 200: 'Command okay', 202: 'Command not implemented, superfluous at this site', 211: 'System status, or system help reply', 212: 'Directory status', 213: 'File status', 214: 'Help message', 215: 'NAME system type', 220: 'Service ready for new user', 221: 'Service closing control connection', 225: 'Data connection open; no transfer in progress', 226: 'Closing data connection', 227: 'Entering Passive Mode', 229: 'Entering Extended Passive Mode', 230: 'User logged in, proceed', 232: 'User logged in, authorized by security data exchange', 234: 'Security data exchange complete', 235: 'Security data exchange completed successfully', 250: 'Requested file action okay, completed', 257: 'PATHNAME created', 331: 'User name okay, need password', 332: 'Need account for login', 334: 'Requested security mechanism is ok', 335: 'Security data is acceptable, more is required', 336: 'Username okay, need password. Challenge is ...', 350: 'Requested file action pending further information', 421: 'Service not available, closing control connection', 425: 'Can\'t open data connection', 426: 'Connection closed; transfer aborted', 431: 'Need some unavailable resource to process security', 450: 'Requested file action not taken', 451: 'Requested action aborted: local error in processing', 452: 'Requested action not taken. Insufficient storage space in system', 500: 'Syntax error, command unrecognized', 501: 'Syntax error in parameters or arguments', 502: 'Command not implemented', 503: 'Bad sequence of commands', 504: 'Command not implemented for that parameter', 522: 'Network protocol not supported', 530: 'Not logged in', 532: 'Need account for storing files', 533: 'Command protection level denied for policy reasons', 534: 'Request denied for policy reasons', 535: 'Failed security check (hash, sequence, etc)', 536: 'Requested PROT level not supported by mechanism', 537: 'Command protection level not supported by security mechanism', 550: 'Requested action not taken: File unavailable', 551: 'Requested action aborted: page type unknown', 552: 'Requested file action aborted: Exceeded storage allocation', 553: 'Requested action not taken: File name not allowed', 631: 'Integrity protected reply', 632: 'Confidentiality and integrity protected reply', 633: 'Confidentiality protected reply' };
const DATA_CMDS = new Set(['RETR', 'STOR', 'STOU', 'APPE', 'LIST', 'NLST', 'MLSD']);

function ftpState(ctx) {
  const st = ctx.session.st('ftp', () => ({ streams: new Map(), data: new Map() }));
  const k = streamKey(ctx);
  let s = st.streams.get(k);
  if (!s) st.streams.set(k, s = { cwd: '', pendingPwd: false, cmd: null, cmdFrame: 0, setup: null });
  return { st, s };
}

registerProtocol({
  abbrev: 'ftp', name: 'File Transfer Protocol (FTP)', short: 'FTP',
  fields: [
    ['ftp.request', 'Request', 'bool'], ['ftp.response', 'Response', 'bool'],
    ['ftp.request.command', 'Request command', 'string'], ['ftp.request.arg', 'Request arg', 'string'],
    ['ftp.response.code', 'Response code', 'uint32', { strings: FTP_CODES }], ['ftp.response.arg', 'Response arg', 'string'],
    ['ftp.passive.ip', 'Passive IP address', 'ipv4'], ['ftp.passive.port', 'Passive port', 'uint16'],
    ['ftp.active.cip', 'Active IP address', 'ipv4'], ['ftp.active.port', 'Active port', 'uint16'],
    ['ftp.eprt.ip', 'Extended active IP address', 'ipv4'], ['ftp.eprt.ipv6', 'Extended active IPv6 address', 'ipv6'], ['ftp.eprt.port', 'Extended active port', 'uint16'],
    ['ftp.epsv.ip', 'Extended passive IPv4 address', 'ipv4'], ['ftp.epsv.port', 'Extended passive port', 'uint16'],
    ['ftp.current-working-directory', 'Current working directory', 'string'],
    ['ftp.command', 'Command', 'string'], ['ftp.command-frame', 'Command frame', 'framenum'],
  ],
  tables: { 'tcp.port': [21] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    const req = toServer(ctx, [21]);
    ctx.setProtocol('FTP');
    const t = ctx.proto('ftp', off, end - off);
    const ls = lines(d, off, end);
    if (!ls.length) return end - off;
    const { st, s } = ftpState(ctx);
    let fd = ctx.fd.ftp;
    if (ctx.first) fd = ctx.fd.ftp = {};
    ctx.hidden(t, req ? 'ftp.request' : 'ftp.response', off, 0, true);
    const first = txt(d, ls[0]);
    ctx.setInfo((req ? 'Request: ' : 'Response: ') + printable(first));
    for (const l of ls) {
      const text = txt(d, l);
      const n = ctx.text(t, printable(text) + eolLabel(d, l), l.s, l.n - l.s);
      if (req) {
        const sp = text.indexOf(' ');
        const cmd = sp < 0 ? text : text.slice(0, sp), arg = sp < 0 ? '' : text.slice(sp + 1);
        ctx.add(n, 'ftp.request.command', l.s, cmd.length, cmd);
        if (sp >= 0) ctx.add(n, 'ftp.request.arg', l.s + sp + 1, l.e - l.s - sp - 1, arg);
        const C = cmd.toUpperCase();
        if (ctx.first) {
          if (DATA_CMDS.has(C)) { s.cmd = text; s.cmdFrame = ctx.no; }
          if (C === 'PWD' || C === 'XPWD') s.pendingPwd = true;
          if (C === 'CWD' && arg) s.cwdPending = arg;
          if (C === 'PORT') {
            const v = arg.split(',').map(Number);
            if (v.length === 6 && v.every((x) => x >= 0 && x <= 255)) {
              const ip = v.slice(0, 4).join('.'), port = v[4] * 256 + v[5];
              fd.active = { ip, port };
              ctx.session.setConversationProto('tcp', ip, port, 'ftp-data', ctx.no);
              st.data.set(ip + ':' + port, { setup: ctx.no, method: 'PORT', ctl: s });
            }
          } else if (C === 'EPRT') {
            const p = arg.split(arg[0] || '|');
            if (p.length >= 4) {
              fd.eprt = { af: +p[1], ip: p[2], port: +p[3] };
              ctx.session.setConversationProto('tcp', p[2], +p[3], 'ftp-data', ctx.no);
              st.data.set(p[2] + ':' + p[3], { setup: ctx.no, method: 'EPRT', ctl: s });
            }
          }
        }
        if (fd.active && C === 'PORT') { ctx.add(n, 'ftp.active.cip', l.s, l.e - l.s, fd.active.ip); ctx.add(n, 'ftp.active.port', l.s, l.e - l.s, fd.active.port); }
        if (fd.eprt && C === 'EPRT') {
          if (fd.eprt.af === 2) ctx.add(n, 'ftp.eprt.ipv6', l.s, l.e - l.s, fd.eprt.ip);
          else ctx.add(n, 'ftp.eprt.ip', l.s, l.e - l.s, fd.eprt.ip);
          ctx.add(n, 'ftp.eprt.port', l.s, l.e - l.s, fd.eprt.port);
        }
      } else {
        const d0 = d[l.s];
        // only the first line of a (multi-line) reply carries code and argument
        if (l !== ls[0]) continue;
        if (l.e - l.s >= 3 && isDigit(d0) && isDigit(d[l.s + 1]) && isDigit(d[l.s + 2])) {
          const code = +ascii(d, l.s, 3);
          const arg = text.length > 4 ? text.slice(4) : '';
          ctx.add(n, 'ftp.response.code', l.s, 3, code);
          if (arg) ctx.add(n, 'ftp.response.arg', l.s + 4, l.e - l.s - 4, arg);
          if (ctx.first) {
            if (code === 227) {
              const m = PASV_RE.exec(arg);
              if (m) {
                const ip = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`, port = +m[5] * 256 + +m[6];
                fd.pasv = { ip, port };
                ctx.session.setConversationProto('tcp', ip, port, 'ftp-data', ctx.no);
                st.data.set(ip + ':' + port, { setup: ctx.no, method: 'PASV', ctl: s });
              }
            } else if (code === 229) {
              const m = EPSV_RE.exec(arg);
              if (m && ctx.net) {
                const ip = ctx.net.src, port = +m[1];
                fd.epsv = { ip, port };
                ctx.session.setConversationProto('tcp', ip, port, 'ftp-data', ctx.no);
                st.data.set(ip + ':' + port, { setup: ctx.no, method: 'EPASV', ctl: s });
              }
            } else if (code === 257 && s.pendingPwd) {
              const q1 = arg.indexOf('"'), q2 = arg.indexOf('"', q1 + 1);
              if (q1 >= 0 && q2 > q1) s.cwd = arg.slice(q1 + 1, q2);
              s.pendingPwd = false;
            } else if (code === 250 && s.cwdPending) {
              s.cwd = s.cwdPending.startsWith('/') || !s.cwd ? s.cwdPending : (s.cwd.replace(/\/$/, '') + '/' + s.cwdPending);
              s.cwdPending = null;
            }
          }
          if (fd.pasv && code === 227) { ctx.add(n, 'ftp.passive.ip', l.s, l.e - l.s, fd.pasv.ip); ctx.add(n, 'ftp.passive.port', l.s, l.e - l.s, fd.pasv.port); }
          if (fd.epsv && code === 229) { ctx.add(n, 'ftp.epsv.ip', l.s, l.e - l.s, fd.epsv.ip); ctx.add(n, 'ftp.epsv.port', l.s, l.e - l.s, fd.epsv.port); }
        } else if (l.e > l.s) ctx.add(n, 'ftp.response.arg', l.s, l.e - l.s, text);
      }
    }
    if (ctx.first) { fd.cwd = s.cwd; if (!req && s.cmd) { fd.cmd = s.cmd; fd.cmdFrame = s.cmdFrame; } }
    ctx.gen(t, 'ftp.current-working-directory', fd.cwd || '', `Current working directory: ${fd.cwd || ''}`);
    if (!req && fd.cmd && (fd.pasv || fd.epsv)) {
      ctx.gen(t, 'ftp.command', fd.cmd, `Command: ${fd.cmd}`);
      ctx.gen(t, 'ftp.command-frame', fd.cmdFrame, `Command frame: ${fd.cmdFrame}`);
    }
    return end - off;
  },
});
const PASV_RE = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/;
const EPSV_RE = /\(\|\|\|(\d+)\|\)/;

registerProtocol({
  abbrev: 'ftp-data', name: 'FTP Data', short: 'FTP-DATA',
  fields: [
    ['ftp-data.setup-frame', 'Setup frame', 'framenum'], ['ftp-data.setup-method', 'Setup method', 'string'],
    ['ftp-data.command', 'Command', 'string'], ['ftp-data.command-frame', 'Command frame', 'framenum'],
    ['ftp-data.current-working-directory', 'Current working directory', 'string'],
  ],
  tables: { 'tcp.port': [20] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.setProtocol('FTP-DATA');
    let fd = ctx.fd.ftpData;
    if (ctx.first) {
      const st = ctx.session.st('ftp', () => ({ streams: new Map(), data: new Map() }));
      const net = ctx.net;
      const e = net && (st.data.get(net.dst + ':' + ctx.dstport) || st.data.get(net.src + ':' + ctx.srcport));
      fd = ctx.fd.ftpData = e ? { setup: e.setup, method: e.method, cmd: e.ctl.cmd, cmdFrame: e.ctl.cmdFrame, cwd: e.ctl.cwd } : {};
    }
    const n = end - off;
    const t = ctx.proto('ftp-data', off, n, `FTP Data (${n} bytes data)`);
    if (fd.setup) {
      ctx.gen(t, 'ftp-data.setup-frame', fd.setup, `Setup frame: ${fd.setup}`);
      ctx.gen(t, 'ftp-data.setup-method', fd.method);
      if (fd.cmd) { ctx.gen(t, 'ftp-data.command', fd.cmd); ctx.add(t, 'ftp-data.command-frame', 0, 0, fd.cmdFrame, `Command frame: ${fd.cmdFrame}`); }
      ctx.gen(t, 'ftp-data.current-working-directory', fd.cwd || '');
    }
    ctx.setInfo(`FTP Data: ${n} bytes` + (fd.method ? ` (${fd.method})` : '') + (fd.cmd ? ` (${fd.cmd})` : ''));
    let text = true;
    for (let i = off; i < end; i++) { const c = d[i]; if (c < 32 && c !== 9 && c !== 10 && c !== 13) { text = false; break; } if (c >= 127) { text = false; break; } }
    if (text) textLines(ctx, off, end, null);
    else ctx.data(off, end);
    return n;
  },
});

// ============================================================================================
// SMTP + IMF
const SMTP_CODES = { 211: 'System status, or system help reply', 214: 'Help message', 220: '<domain> Service ready', 221: '<domain> Service closing transmission channel', 235: 'Authentication successful', 250: 'Requested mail action okay, completed', 251: 'User not local; will forward to <forward-path>', 252: 'Cannot VRFY user, but will accept message and attempt delivery', 334: 'AUTH input', 354: 'Start mail input; end with <CRLF>.<CRLF>', 421: '<domain> Service not available, closing transmission channel', 432: 'A password transition is needed', 450: 'Requested mail action not taken: mailbox unavailable', 451: 'Requested action aborted: local error in processing', 452: 'Requested action not taken: insufficient system storage', 454: 'Temporary authentication failed', 500: 'Syntax error, command unrecognized', 501: 'Syntax error in parameters or arguments', 502: 'Command not implemented', 503: 'Bad sequence of commands', 504: 'Command parameter not implemented', 530: 'Authentication required', 534: 'Authentication mechanism is too weak', 535: 'Authentication credentials invalid', 538: 'Encryption required for requested authentication mechanism', 550: 'Requested action not taken: mailbox unavailable', 551: 'User not local; please try <forward-path>', 552: 'Requested mail action aborted: exceeded storage allocation', 553: 'Requested action not taken: mailbox name not allowed', 554: 'Transaction failed' };

registerProtocol({
  abbrev: 'smtp', name: 'Simple Mail Transfer Protocol', short: 'SMTP',
  fields: [
    ['smtp.req', 'Request', 'bool'], ['smtp.rsp', 'Response', 'bool'],
    ['smtp.command_line', 'Command Line', 'string'], ['smtp.req.command', 'Command', 'string'], ['smtp.req.parameter', 'Request parameter', 'string'],
    ['smtp.response', 'Response', 'string'], ['smtp.response.code', 'Response code', 'uint32', { strings: SMTP_CODES }],
    ['smtp.rsp.parameter', 'Response parameter', 'string'], ['smtp.message', 'Message', 'string'],
    ['smtp.data.fragment', 'DATA fragment', 'framenum'], ['smtp.data.fragment.count', 'DATA fragment count', 'uint32'],
    ['smtp.data.reassembled.in', 'Reassembled DATA in frame', 'framenum'], ['smtp.data.reassembled.length', 'Reassembled DATA length', 'uint32'],
    ['smtp.eom', 'EOM', 'none'],
  ],
  tables: { 'tcp.port': [25, 587] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    const req = toServer(ctx, [25, 587, 465]);
    ctx.setProtocol('SMTP');
    const st = ctx.session.st('smtp', () => new Map());
    const k = streamKey(ctx);
    let s = st.get(k);
    if (!s) st.set(k, s = { dataMode: false, dataPending: false, chunks: [], frames: [] });
    let fd = ctx.fd.smtp;
    if (ctx.first) {
      fd = ctx.fd.smtp = { kind: 'cmd' };
      if (req && s.dataMode) {
        // message body until a line with a single '.'
        const chunk = d.slice(off, end);
        s.chunks.push(chunk); s.frames.push({ no: ctx.no, len: end - off });
        if (endsWithDot(d, off, end)) {
          fd.kind = 'eom';
          if (s.frames.length > 1) {
            let total = 0; for (const c of s.chunks) total += c.length;
            const all = new Uint8Array(total); let o = 0;
            for (const c of s.chunks) { all.set(c, o); o += c.length; }
            fd.reasm = { data: all, frames: s.frames.slice() };
            for (const f of s.frames) if (f.no !== ctx.no) { const x = ctx.session._fd(f.no).smtp; if (x) x.reasmIn = ctx.no; }
          }
          s.dataMode = false; s.chunks = []; s.frames = [];
        } else fd.kind = 'frag';
      } else if (!req && s.dataPending) {
        const code = +ascii(d, off, 3);
        if (code === 354) s.dataMode = true;
        s.dataPending = false;
      } else if (req) {
        const ls = lines(d, off, end);
        if (ls.length && /^(DATA)$/i.test(txt(d, ls[ls.length - 1]).trim())) s.dataPending = true;
      }
    }
    const t = ctx.proto('smtp', off, end - off);
    if (fd.kind === 'frag') {
      ctx.setInfo(`C: DATA fragment, ${end - off} bytes`);
      if (fd.reasmIn) ctx.gen(t, 'smtp.data.reassembled.in', fd.reasmIn, `Reassembled DATA in frame: ${fd.reasmIn}`);
      return end - off;
    }
    if (fd.kind === 'eom') {
      const body = (src, bo, be) => {
        // the terminating '.' line is SMTP; everything before it is the IMF message
        const dotStart = be - (src[be - 3] === 13 ? 5 : 3) + 2;
        const msgEnd = dotStart;
        ctx.call('imf', bo, msgEnd, { short: 'SMTP' });
        return dotStart;
      };
      let dotStart;
      if (fd.reasm) {
        const r = fd.reasm;
        if (ctx.tree) {
          const fn = ctx.text(t, `[${r.frames.length} DATA fragments (${r.data.length} bytes): ${r.frames.map((f) => `#${f.no}(${f.len})`).join(', ')}]`);
          for (const f of r.frames) ctx.gen(fn, 'smtp.data.fragment', f.no);
          ctx.gen(fn, 'smtp.data.fragment.count', r.frames.length);
          ctx.gen(fn, 'smtp.data.reassembled.length', r.data.length);
        }
        ctx.setInfo('');
        ctx.withSource(`Reassembled SMTP (${r.data.length} bytes)`, r.data, () => { body(r.data, 0, r.data.length); });
        dotStart = end - (d[end - 2] === 13 ? 3 : 2);
      } else {
        ctx.setInfo('');
        dotStart = body(d, off, end);
      }
      ctx.text(t, 'C: .', dotStart, end - dotStart);
      ctx.hidden(t, 'smtp.eom', dotStart, end - dotStart, null);
      ctx.info += ' | .';
      return end - off;
    }
    const ls = lines(d, off, end);
    if (req) {
      ctx.hidden(t, 'smtp.req', off, 0, true);
      const parts = [];
      for (const l of ls) {
        const text = txt(d, l);
        parts.push(text);
        const n = ctx.add(t, 'smtp.command_line', l.s, l.n - l.s, text + '\r\n', `Command Line: ${printable(text)}${eolLabel(d, l)}`);
        const sp = text.indexOf(' ');
        const cmd = sp < 0 ? text : text.slice(0, sp);
        ctx.add(n, 'smtp.req.command', l.s, cmd.length, cmd);
        if (sp >= 0) ctx.add(n, 'smtp.req.parameter', l.s + sp + 1, l.e - l.s - sp - 1, text.slice(sp + 1));
      }
      ctx.setInfo('C: ' + parts.map(printable).join(' | '));
    } else {
      ctx.hidden(t, 'smtp.rsp', off, 0, true);
      const parts = [];
      let n = null;
      for (let i = 0; i < ls.length; i++) {
        const l = ls[i];
        const text = txt(d, l);
        const code = +text.slice(0, 3);
        const par = text.slice(4);
        if (i === 0) {
          n = ctx.add(t, 'smtp.response', l.s, l.n - l.s, text, `Response: ${printable(text)}${eolLabel(d, l)}`);
          if (!isNaN(code)) ctx.add(n, 'smtp.response.code', l.s, 3, code);
          parts.push(printable(text));
        } else parts.push(printable(par));
        ctx.add(n, 'smtp.rsp.parameter', l.s + 4, Math.max(0, l.e - l.s - 4), par);
      }
      ctx.setInfo('S: ' + parts.join(' | '));
    }
    return end - off;
  },
});
function endsWithDot(d, off, end) {
  // "\r\n.\r\n" (or a segment that is exactly ".\r\n")
  if (end - off >= 5 && d[end - 5] === 13 && d[end - 4] === 10 && d[end - 3] === 46 && d[end - 2] === 13 && d[end - 1] === 10) return true;
  return end - off === 3 && d[off] === 46 && d[off + 1] === 13 && d[off + 2] === 10;
}

const IMF_HDRS = { from: 'imf.from', to: 'imf.to', cc: 'imf.cc', bcc: 'imf.bcc', subject: 'imf.subject', date: 'imf.date', 'message-id': 'imf.message_id', 'reply-to': 'imf.reply_to', sender: 'imf.sender', 'in-reply-to': 'imf.in_reply_to', references: 'imf.references', 'user-agent': 'imf.user_agent', 'mime-version': 'imf.mime_version', 'content-type': 'imf.content.type', 'content-transfer-encoding': 'imf.content.transfer_encoding', received: 'imf.received', 'return-path': 'imf.return_path', 'x-mailer': 'imf.xmailer' };
const ADDR_HDRS = new Set(['from', 'to', 'cc', 'bcc', 'reply-to', 'sender']);
registerProtocol({
  abbrev: 'imf', name: 'Internet Message Format', short: 'IMF',
  fields: [
    ...Object.entries(IMF_HDRS).map(([h, a]) => [a, h === 'message-id' ? 'Message-ID' : h === 'mime-version' ? 'MIME-Version' : h === 'x-mailer' ? 'X-Mailer' : h.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-'), 'string']),
    ['imf.content.type.type', 'Type', 'string'], ['imf.content.type.parameters', 'Parameters', 'string'],
    ['imf.address_list.item', 'Item', 'string'], ['imf.address', 'Address', 'string'], ['imf.display_name', 'Display-Name', 'string'],
    ['imf.extension', 'Unknown-Extension', 'string'],
  ],
  dissect(ctx, off, end, arg) {
    const d = ctx.d;
    const t = ctx.proto('imf', off, end - off);
    ctx.setProtocol((arg && arg.short ? arg.short : 'SMTP') + '/IMF');
    let o = off, from = null, subject = null, ctype = null;
    // headers (with folded continuation lines)
    while (o < end) {
      let e = o;
      while (e < end && d[e] !== 10) e++;
      if (e === o || (e === o + 1 && d[o] === 13)) { o = e + 1; break; }
      let ne = e + 1;
      while (ne < end && (d[ne] === 32 || d[ne] === 9)) { while (ne < end && d[ne] !== 10) ne++; ne++; }
      const raw = utf8(d, o, Math.min(ne, end) - o).replace(/\r?\n$/, '');
      const c = raw.indexOf(':');
      if (c > 0) {
        const name = raw.slice(0, c), lname = name.toLowerCase(), value = raw.slice(c + 1).replace(/\r?\n[ \t]+/g, ' ').trim();
        const a = IMF_HDRS[lname] || 'imf.extension';
        if (ADDR_HDRS.has(lname)) {
          const items = value.split(',').map((x) => x.trim()).filter(Boolean);
          const n = ctx.add(t, a, o, ne - o, value, `${name}: ${printable(value)}, ${items.length} item${items.length === 1 ? '' : 's'}`);
          for (const it of items) {
            const i = ctx.add(n, 'imf.address_list.item', o, ne - o, it, `Item: ${printable(it)}`);
            const lt = it.indexOf('<');
            if (lt > 0) ctx.add(i, 'imf.display_name', o, 0, it.slice(0, lt).trim().replace(/^"|"$/g, ''));
            ctx.add(i, 'imf.address', o, 0, lt >= 0 ? it.slice(lt + 1, it.indexOf('>', lt)) : it);
          }
        } else {
          const n = ctx.add(t, a, o, ne - o, value, `${name}: ${printable(value)}`);
          if (lname === 'content-type') {
            const sc = value.indexOf(';');
            ctx.add(n, 'imf.content.type.type', o, 0, sc < 0 ? value : value.slice(0, sc));
            if (sc >= 0) ctx.add(n, 'imf.content.type.parameters', o, 0, value.slice(sc + 1));
          }
        }
        if (lname === 'from') from = value;
        else if (lname === 'subject') subject = value;
        else if (lname === 'content-type') ctype = value.split(';')[0].trim().toLowerCase();
      }
      o = Math.min(ne, end);
    }
    ctx.setInfo(`from: ${from || ''}, subject: ${subject || ''}, `);
    if (o < end) {
      if (ctype && !ctype.startsWith('multipart/')) media(ctx, ctype, o, end, 'SMTP');
      else textLines(ctx, o, end, null);
    }
    return end - off;
  },
});

// ============================================================================================
// POP3
registerProtocol({
  abbrev: 'pop', name: 'Post Office Protocol', short: 'POP',
  fields: [
    ['pop.request', 'Request', 'string'], ['pop.request.command', 'Request command', 'string'], ['pop.request.parameter', 'Request parameter', 'string'],
    ['pop.request.data', 'Data', 'string'],
    ['pop.response', 'Response', 'string'], ['pop.response.indicator', 'Response indicator', 'string'], ['pop.response.description', 'Response description', 'string'],
    ['pop.response.data', 'Data', 'string'],
  ],
  tables: { 'tcp.port': [110] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    const req = toServer(ctx, [110]);
    ctx.setProtocol('POP');
    const t = ctx.proto('pop', off, end - off);
    const ls = lines(d, off, end);
    if (!ls.length) return end - off;
    const first = txt(d, ls[0]);
    const isStatus = first.startsWith('+OK') || first.startsWith('-ERR');
    if (req) {
      const sp = first.indexOf(' ');
      const n = ctx.add(t, 'pop.request', ls[0].s, ls[0].n - ls[0].s, first, `${printable(first)}${eolLabel(d, ls[0])}`);
      ctx.add(n, 'pop.request.command', ls[0].s, sp < 0 ? first.length : sp, sp < 0 ? first : first.slice(0, sp));
      if (sp >= 0) ctx.add(n, 'pop.request.parameter', ls[0].s + sp + 1, first.length - sp - 1, first.slice(sp + 1));
      for (const l of ls.slice(1)) ctx.add(t, 'pop.request.data', l.s, l.n - l.s, txt(d, l), `Data: ${printable(txt(d, l))}`);
      ctx.setInfo('C: ' + printable(first));
    } else if (isStatus) {
      const sp = first.indexOf(' ');
      const n = ctx.add(t, 'pop.response', ls[0].s, ls[0].n - ls[0].s, first, `${printable(first)}${eolLabel(d, ls[0])}`);
      ctx.add(n, 'pop.response.indicator', ls[0].s, sp < 0 ? first.length : sp, sp < 0 ? first : first.slice(0, sp));
      if (sp >= 0) ctx.add(n, 'pop.response.description', ls[0].s + sp + 1, first.length - sp - 1, first.slice(sp + 1));
      for (const l of ls.slice(1)) ctx.add(t, 'pop.response.data', l.s, l.n - l.s, '', `${printable(txt(d, l))}${eolLabel(d, l)}`);
      ctx.setInfo('S: ' + printable(first));
    } else {
      for (const l of ls) ctx.add(t, 'pop.response.data', l.s, l.n - l.s, txt(d, l), `${printable(txt(d, l))}${eolLabel(d, l)}`);
      ctx.setInfo('S: DATA fragment, ' + (end - off) + ' bytes');
    }
    return end - off;
  },
});

// ============================================================================================
// IMAP
registerProtocol({
  abbrev: 'imap', name: 'Internet Message Access Protocol', short: 'IMAP',
  fields: [
    ['imap.isrequest', 'Request', 'bool'], ['imap.line', 'Line', 'string'],
    ['imap.request', 'Request', 'string'], ['imap.request_tag', 'Request Tag', 'string'], ['imap.request.command', 'Request Command', 'string'],
    ['imap.response', 'Response', 'string'], ['imap.response_tag', 'Response Tag', 'string'], ['imap.response.command', 'Response Command', 'string'],
    ['imap.response.status', 'Response Status', 'string'], ['imap.tag', 'Tag', 'string'], ['imap.command', 'Command', 'string'],
    ['imap.request.folder', 'Request Folder', 'string'], ['imap.request.username', 'Request Username', 'string'], ['imap.request.password', 'Request Password', 'string'],
    ['imap.response_in', 'Response In', 'framenum'], ['imap.response_to', 'Request In', 'framenum'], ['imap.time', 'Response Time', 'rel_time'],
  ],
  tables: { 'tcp.port': [143] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    const req = toServer(ctx, [143]);
    ctx.setProtocol('IMAP');
    const t = ctx.proto('imap', off, end - off);
    const ls = lines(d, off, end);
    if (!ls.length) return end - off;
    // request/response matching by tag
    const st = ctx.session.st('imap', () => new Map());
    const k = streamKey(ctx);
    let s = st.get(k);
    if (!s) st.set(k, s = new Map());
    let fd = ctx.fd.imap;
    if (ctx.first) {
      fd = ctx.fd.imap = {};
      const first = txt(d, ls[0]);
      const tag = first.split(' ')[0];
      if (req) { s.set(tag, { no: ctx.no, rel: ctx.fd.rel, fd }); }
      else {
        for (const l of ls) {
          const tg = txt(d, l).split(' ')[0];
          const r = s.get(tg);
          if (r && tg !== '*' && tg !== '+') { r.fd.respIn = ctx.no; fd.respTo = r.no; fd.time = ctx.fd.rel - r.rel; s.delete(tg); }
        }
      }
    }
    ctx.hidden(t, 'imap.isrequest', off, 0, req);
    for (const l of ls) {
      const text = txt(d, l);
      const n = ctx.add(t, 'imap.line', l.s, l.n - l.s, text, `Line: ${printable(text)}${eolLabel(d, l)}`);
      const parts = text.split(' ');
      if (req) {
        ctx.add(n, 'imap.request_tag', l.s, parts[0].length, parts[0]);
        ctx.hidden(n, 'imap.tag', l.s, parts[0].length, parts[0]);
        if (parts[1]) {
          ctx.add(n, 'imap.request.command', l.s + parts[0].length + 1, parts[1].length, parts[1]);
          ctx.hidden(n, 'imap.command', l.s, 0, parts[1]);
          const C = parts[1].toUpperCase();
          if (C === 'LOGIN') {
            if (parts[2]) ctx.add(n, 'imap.request.username', l.s, 0, parts[2].replace(/^"|"$/g, ''));
            if (parts[3]) ctx.add(n, 'imap.request.password', l.s, 0, parts[3].replace(/^"|"$/g, ''));
          } else if ((C === 'SELECT' || C === 'EXAMINE' || C === 'CREATE' || C === 'DELETE' || C === 'SUBSCRIBE') && parts[2]) ctx.add(n, 'imap.request.folder', l.s, 0, parts[2].replace(/^"|"$/g, ''));
        }
      } else {
        ctx.add(n, 'imap.response_tag', l.s, parts[0].length, parts[0]);
        ctx.hidden(n, 'imap.tag', l.s, parts[0].length, parts[0]);
        if (parts[1]) {
          const P = parts[1].toUpperCase();
          if (parts[0] !== '*' && parts[0] !== '+' && (P === 'OK' || P === 'NO' || P === 'BAD' || P === 'BYE' || P === 'PREAUTH')) ctx.add(n, 'imap.response.status', l.s + parts[0].length + 1, parts[1].length, parts[1]);
          else ctx.add(n, 'imap.response.command', l.s + parts[0].length + 1, parts[1].length, parts[1]);
        }
      }
    }
    if (fd.respIn) ctx.gen(t, 'imap.response_in', fd.respIn, `Response In: ${fd.respIn}`);
    if (fd.respTo) { ctx.gen(t, 'imap.response_to', fd.respTo, `Request In: ${fd.respTo}`); ctx.gen(t, 'imap.time', fd.time); }
    // each line overwrites the column, so the last one is shown
    ctx.setInfo((req ? 'Request: ' : 'Response: ') + printable(txt(d, ls[ls.length - 1])));
    return end - off;
  },
});

// ============================================================================================
// Telnet
const TN_CMD = { 236: 'End of File', 237: 'Suspend Current Process', 238: 'Abort Process', 239: 'End of Record', 240: 'Suboption End', 241: 'No Operation', 242: 'Data Mark', 243: 'Break', 244: 'Interrupt Process', 245: 'Abort Output', 246: 'Are You There?', 247: 'Escape Character', 248: 'Erase Line', 249: 'Go Ahead', 250: 'Suboption', 251: 'Will', 252: 'Won\'t', 253: 'Do', 254: 'Don\'t' };
const TN_OPT = { 0: 'Binary Transmission', 1: 'Echo', 3: 'Suppress Go Ahead', 5: 'Status', 6: 'Timing Mark', 24: 'Terminal Type', 31: 'Negotiate About Window Size', 32: 'Terminal Speed', 33: 'Remote Flow Control', 34: 'Linemode', 35: 'X Display Location', 36: 'Environment Option', 37: 'Authentication Option', 38: 'Encryption Option', 39: 'New Environment Option' };
registerProtocol({
  abbrev: 'telnet', name: 'Telnet', short: 'TELNET',
  fields: [
    ['telnet.cmd', 'Command', 'uint8', { strings: TN_CMD }], ['telnet.subcmd', 'Subcommand', 'uint8', { strings: TN_OPT }],
    ['telnet.data', 'Data', 'string'], ['telnet.naws_subopt.width', 'Width', 'uint16'], ['telnet.naws_subopt.height', 'Height', 'uint16'],
    ['telnet.string_subopt.value', 'Value', 'string'],
  ],
  tables: { 'tcp.port': [23] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.setProtocol('TELNET');
    const t = ctx.proto('telnet', off, end - off);
    const infos = [];
    let dataBytes = 0;
    let o = off;
    while (o < end) {
      if (d[o] === 255 && o + 1 < end) {
        const cmd = d[o + 1];
        if (cmd >= 251 && cmd <= 254 && o + 2 < end) {
          const opt = d[o + 2];
          const label = `${TN_CMD[cmd]} ${TN_OPT[opt] || 'Unknown Option'}`;
          infos.push(label);
          const n = ctx.text(t, label, o, 3);
          ctx.add(n, 'telnet.cmd', o + 1, 1, cmd);
          ctx.add(n, 'telnet.subcmd', o + 2, 1, opt, `Subcommand: ${TN_OPT[opt] || 'Unknown Option'}`);
          o += 3; continue;
        }
        if (cmd === 250) {
          let e = o + 2;
          while (e + 1 < end && !(d[e] === 255 && d[e + 1] === 240)) e++;
          const opt = d[o + 2];
          const label = `Suboption ${TN_OPT[opt] || 'Unknown Option'}`;
          infos.push(label);
          const n = ctx.text(t, label, o, e - o);
          ctx.add(n, 'telnet.cmd', o + 1, 1, cmd);
          const sn = ctx.add(n, 'telnet.subcmd', o + 2, 1, opt, `Subcommand: ${TN_OPT[opt] || 'Unknown Option'}`);
          if (opt === 31 && e - o >= 7) { ctx.add(sn, 'telnet.naws_subopt.width', o + 3, 2, u16(d, o + 3)); ctx.add(sn, 'telnet.naws_subopt.height', o + 5, 2, u16(d, o + 5)); }
          else if ((opt === 24 || opt === 32 || opt === 35) && e - o > 3) {
            // IS (0) / SEND (1) byte, then the string value
            ctx.add(sn, 'telnet.subcmd', o + 3, 1, d[o + 3], d[o + 3] === 0 ? `Here's my ${TN_OPT[opt]}` : `Send your ${TN_OPT[opt]}`);
            if (e - o > 4) ctx.add(sn, 'telnet.string_subopt.value', o + 4, e - o - 4, ascii(d, o + 4, e - o - 4));
          }
          if (e + 1 < end) { const se = ctx.text(t, 'Suboption End', e, 2); ctx.add(se, 'telnet.cmd', e + 1, 1, 240); }
          o = Math.min(e + 2, end); continue;
        }
        infos.push(TN_CMD[cmd] || `Command ${cmd}`);
        const n = ctx.text(t, TN_CMD[cmd] || `Command ${cmd}`, o, 2);
        ctx.add(n, 'telnet.cmd', o + 1, 1, cmd);
        o += 2; continue;
      }
      // data up to the next IAC, one item per line
      let e = o;
      while (e < end && d[e] !== 255) { e++; if (d[e - 1] === 10) break; }
      ctx.add(t, 'telnet.data', o, e - o, ascii(d, o, e - o), `Data: ${printable(ascii(d, o, e - o))}`);
      dataBytes += e - o;
      o = e;
    }
    if (dataBytes) infos.push(`${dataBytes} bytes data`);
    ctx.setInfo(infos.join(', '));
    return end - off;
  },
});
