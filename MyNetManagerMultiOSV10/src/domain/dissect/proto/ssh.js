// SSH: version banner, binary packet layer for the cleartext key exchange, then encrypted packets.
import { registerProtocol, u32, ascii, utf8, hexStr, printable } from '../core.js';

const MSG = { 1: 'Disconnect', 2: 'Ignore', 3: 'Unimplemented', 4: 'Debug', 5: 'Service Request', 6: 'Service Accept', 7: 'Extension Information', 8: 'New Compression', 20: 'Key Exchange Init', 21: 'New Keys', 50: 'User Authentication Request', 51: 'User Authentication Failure', 52: 'User Authentication Success', 53: 'User Authentication Banner', 80: 'Global Request', 81: 'Request Success', 82: 'Request Failure', 90: 'Channel Open', 91: 'Channel Open Confirmation', 92: 'Channel Open Failure', 93: 'Window Adjust', 94: 'Channel Data', 95: 'Channel Extended Data', 96: 'Channel EOF', 97: 'Channel Close', 98: 'Channel Request', 99: 'Channel Success', 100: 'Channel Failure' };
const MSG_ECDH = { 30: 'Elliptic Curve Diffie-Hellman Key Exchange Init', 31: 'Elliptic Curve Diffie-Hellman Key Exchange Reply' };
const MSG_DH = { 30: 'Diffie-Hellman Key Exchange Init', 31: 'Diffie-Hellman Key Exchange Reply' };
const MSG_GEX = { 30: 'Diffie-Hellman Group Exchange Request (Old)', 31: 'Diffie-Hellman Group Exchange Group', 32: 'Diffie-Hellman Group Exchange Init', 33: 'Diffie-Hellman Group Exchange Reply', 34: 'Diffie-Hellman Group Exchange Request' };
const LISTS = ['kex_algorithms', 'server_host_key_algorithms', 'encryption_algorithms_client_to_server', 'encryption_algorithms_server_to_client',
  'mac_algorithms_client_to_server', 'mac_algorithms_server_to_client', 'compression_algorithms_client_to_server', 'compression_algorithms_server_to_client',
  'languages_client_to_server', 'languages_server_to_client'];

const fields = [
  ['ssh.protocol', 'Protocol', 'string'], ['ssh.direction', 'Direction', 'bool', { tfs: ['Server to Client', 'Client to Server'] }],
  ['ssh.packet_length', 'Packet Length', 'uint32'], ['ssh.packet_length_encrypted', 'Packet Length (encrypted)', 'bytes'],
  ['ssh.padding_length', 'Padding Length', 'uint8'], ['ssh.payload', 'Payload', 'bytes'], ['ssh.encrypted_packet', 'Encrypted Packet', 'bytes'],
  ['ssh.padding_string', 'Padding String', 'bytes'], ['ssh.seq_num', 'Sequence number', 'uint32'], ['ssh.mac', 'MAC', 'bytes'],
  ['ssh.message_code', 'Message Code', 'uint8'], ['ssh.cookie', 'Cookie', 'bytes'],
  ['ssh.first_kex_packet_follows', 'First KEX Packet Follows', 'uint8'], ['ssh.kex.reserved', 'Reserved', 'bytes'],
  ['ssh.host_key.length', 'Host key length', 'uint32'], ['ssh.host_key.type_length', 'Host key type length', 'uint32'],
  ['ssh.host_key.type', 'Host key type', 'string'], ['ssh.host_key.data', 'Host key data', 'bytes'],
  ['ssh.host_key.eddsa.key_length', 'EdDSA public key length', 'uint32'], ['ssh.host_key.eddsa.key', 'EdDSA public key', 'bytes'],
  ['ssh.host_sig.length', 'Host signature length', 'uint32'], ['ssh.host_sig.type_length', 'Host signature type length', 'uint32'],
  ['ssh.host_sig.type', 'Host signature type', 'string'], ['ssh.host_sig.data', 'Host signature data', 'bytes'],
  ['ssh.ecdh.q_c_length', 'ECDH client\'s ephemeral public key length', 'uint32'], ['ssh.ecdh.q_c', 'ECDH client\'s ephemeral public key (Q_C)', 'bytes'],
  ['ssh.ecdh.q_s_length', 'ECDH server\'s ephemeral public key length', 'uint32'], ['ssh.ecdh.q_s', 'ECDH server\'s ephemeral public key (Q_S)', 'bytes'],
  ['ssh.mpint_length', 'Multi Precision Integer Length', 'uint32'], ['ssh.dh.e', 'DH client e', 'bytes'], ['ssh.dh.f', 'DH server f', 'bytes'],
  ['ssh.service_name_length', 'Service Name length', 'uint32'], ['ssh.service_name', 'Service Name', 'string'],
];
for (const l of LISTS) fields.push([`ssh.${l}_length`, `${l} length`, 'uint32'], [`ssh.${l}`, `${l} string`, 'string']);

function conn(ctx) {
  const st = ctx.session.st('ssh', () => new Map());
  const k = ctx.tcpStream !== undefined ? ctx.tcpStream : -1;
  let c = st.get(k);
  if (!c) st.set(k, c = { client: null, kex: [null, null], newkeys: [false, false], seq: [0, 0], neg: null });
  return c;
}
/** Is this packet from the client? The client sends the first banner; fall back to port 22. */
function fromClient(ctx, c) {
  const me = (ctx.net ? ctx.net.src : '') + ':' + ctx.srcport;
  if (c.client) return c.client === me;
  return ctx.dstport === 22 || (ctx.srcport !== 22 && ctx.dstport < ctx.srcport);
}
function pick(clientList, serverList) {
  if (!clientList || !serverList) return null;
  const s = new Set(serverList.split(','));
  for (const a of clientList.split(',')) if (s.has(a)) return a;
  return null;
}
function macLen(enc, mac) {
  if (!enc) return 0;
  if (enc.includes('chacha20') || enc.includes('gcm')) return 16;
  if (!mac) return 0;
  if (mac.startsWith('umac-64')) return 8;
  if (mac.startsWith('umac-128')) return 16;
  if (mac.includes('sha2-512')) return 64;
  if (mac.includes('sha2-256')) return 32;
  if (mac.includes('sha1')) return 20;
  if (mac.includes('md5')) return 16;
  return 0;
}

registerProtocol({
  abbrev: 'ssh', name: 'SSH Protocol', short: 'SSH', fields,
  tables: { 'tcp.port': [22] },
  tcpPdu(ctx, off, end) {
    const d = ctx.d;
    if (end - off >= 4 && d[off] === 0x53 && d[off + 1] === 0x53 && d[off + 2] === 0x48 && d[off + 3] === 0x2d) {
      for (let i = off; i < end; i++) if (d[i] === 10) return i + 1 - off;
      return -1;
    }
    const c = conn(ctx);
    const dir = fromClient(ctx, c) ? 0 : 1;
    if (c.newkeys[dir]) return 0; // encrypted: one record per segment is the best guess
    if (end - off < 4) return -1;
    const len = u32(d, off);
    if (len > 262144) return 0;
    return 4 + len;
  },
  dissect(ctx, off, end) {
    const d = ctx.d;
    const c = conn(ctx);
    if (ctx.first && !c.client && end - off >= 4 && d[off] === 0x53 && d[off + 1] === 0x53 && d[off + 2] === 0x48 && d[off + 3] === 0x2d) {
      // the first banner seen comes from the client unless it is sent from port 22
      if (ctx.srcport !== 22) c.client = (ctx.net ? ctx.net.src : '') + ':' + ctx.srcport;
      else c.client = (ctx.net ? ctx.net.dst : '') + ':' + ctx.dstport;
    }
    const client = fromClient(ctx, c);
    const dir = client ? 0 : 1;
    ctx.setProtocol('SSHv2');
    const t = ctx.proto('ssh', off, end - off);
    let fd = ctx.fd.ssh || (ctx.fd.ssh = []);
    const idx = ctx.vars.sshIdx = (ctx.vars.sshIdx || 0) + 1;
    let rec = fd[idx - 1];
    const who = client ? 'Client' : 'Server';
    const addInfo = (s) => {
      if (ctx.infoOwner === 'ssh' && ctx.info) ctx.info += ', ' + s;
      else { ctx.info = `${who}: ${s}`; ctx.infoOwner = 'ssh'; }
    };
    // banner
    if (d[off] === 0x53 && d[off + 1] === 0x53 && d[off + 2] === 0x48 && d[off + 3] === 0x2d) {
      let e = off;
      while (e < end && d[e] !== 10 && d[e] !== 13) e++;
      const banner = ascii(d, off, e - off);
      ctx.add(t, 'ssh.protocol', off, end - off, banner);
      if (!ctx.vars.sshDir) { ctx.vars.sshDir = true; ctx.gen(t, 'ssh.direction', !client); }
      if (banner.startsWith('SSH-1.')) ctx.setProtocol('SSHv1');
      addInfo(`Protocol (${printable(banner)})`);
      return end - off;
    }
    if (ctx.first && !rec) rec = fd[idx - 1] = { encrypted: c.newkeys[dir], seq: c.seq[dir]++ };
    if (!rec) rec = { encrypted: false, seq: 0 };
    const neg = c.neg || {};
    const enc = dir === 0 ? neg.encCS : neg.encSC;
    const mac = dir === 0 ? neg.macCS : neg.macSC;
    const vt = ctx.text(t, `SSH Version 2 (encryption:${enc || '<unknown>'} mac:${enc && (enc.includes('chacha20') || enc.includes('gcm')) ? '<implicit>' : (mac || '<unknown>')} compression:${(dir === 0 ? neg.compCS : neg.compSC) || '<unknown>'})`, off, end - off);
    if (rec.encrypted) {
      const ml = Math.min(macLen(enc, mac), end - off);
      const chacha = enc && enc.includes('chacha20');
      if (chacha) ctx.add(vt, 'ssh.packet_length_encrypted', off, 4, d.subarray(off, off + 4));
      else ctx.add(vt, 'ssh.packet_length', off, 4, u32(d, off));
      ctx.add(vt, 'ssh.encrypted_packet', off + 4, end - off - 4 - ml, d.subarray(off + 4, end - ml));
      if (ml) ctx.add(vt, 'ssh.mac', end - ml, ml, d.subarray(end - ml, end));
      if (!ctx.vars.sshDir) { ctx.vars.sshDir = true; ctx.gen(t, 'ssh.direction', !client); }
      addInfo(`Encrypted packet (len=${end - off})`);
      return end - off;
    }
    ctx.need(off, 6, end);
    const plen = u32(d, off), pad = d[off + 4];
    const pe = Math.min(end, off + 4 + plen);
    ctx.add(vt, 'ssh.packet_length', off, 4, plen);
    ctx.add(vt, 'ssh.padding_length', off + 4, 1, pad);
    const p = off + 5, payEnd = Math.max(p, pe - pad);
    const code = d[p];
    const kexName = neg.kex || '';
    const kexMap = kexName.includes('group-exchange') ? MSG_GEX : kexName.startsWith('ecdh') || kexName.startsWith('curve') || kexName.includes('sntrup') || kexName.includes('mlkem') ? MSG_ECDH : kexName ? MSG_DH : MSG_ECDH;
    const mname = MSG[code] || kexMap[code] || 'Unknown';
    const isKex = code === 20 || code === 21 || (code >= 30 && code <= 49);
    const box = isKex ? ctx.text(vt, `Key Exchange (method:${kexName || '<unknown>'})`, p, payEnd - p) : ctx.text(vt, mname, p, payEnd - p);
    ctx.add(box, 'ssh.message_code', p, 1, code, `Message Code: ${mname} (${code})`);
    let o = p + 1;
    const str = (abbrev, lenAbbrev, parent) => {
      const n = u32(d, o);
      ctx.add(parent, lenAbbrev, o, 4, n);
      ctx.add(parent, abbrev, o + 4, n, abbrev.endsWith('string') || FIELD_STR.has(abbrev) ? utf8(d, o + 4, n) : d.subarray(o + 4, o + 4 + n));
      o += 4 + n;
      return n;
    };
    try {
      if (code === 20) {
        const al = ctx.text(box, 'Algorithms', o, payEnd - o);
        ctx.add(al, 'ssh.cookie', o, 16, d.subarray(o, o + 16));
        o += 16;
        const vals = {};
        for (const l of LISTS) {
          const n = u32(d, o);
          vals[l] = ascii(d, o + 4, n);
          ctx.add(al, `ssh.${l}_length`, o, 4, n);
          ctx.add(al, `ssh.${l}`, o + 4, n, vals[l], `${l} string: ${vals[l]}`);
          o += 4 + n;
        }
        ctx.add(al, 'ssh.first_kex_packet_follows', o, 1, d[o]);
        ctx.add(al, 'ssh.kex.reserved', o + 1, 4, d.subarray(o + 1, o + 5));
        if (ctx.first) {
          c.kex[dir] = vals;
          if (c.kex[0] && c.kex[1]) {
            const C = c.kex[0], S = c.kex[1];
            c.neg = {
              kex: pick(C.kex_algorithms, S.kex_algorithms), encCS: pick(C.encryption_algorithms_client_to_server, S.encryption_algorithms_client_to_server),
              encSC: pick(C.encryption_algorithms_server_to_client, S.encryption_algorithms_server_to_client),
              macCS: pick(C.mac_algorithms_client_to_server, S.mac_algorithms_client_to_server), macSC: pick(C.mac_algorithms_server_to_client, S.mac_algorithms_server_to_client),
              compCS: pick(C.compression_algorithms_client_to_server, S.compression_algorithms_client_to_server), compSC: pick(C.compression_algorithms_server_to_client, S.compression_algorithms_server_to_client),
            };
          }
        }
      } else if (code === 21) {
        if (ctx.first) c.newkeys[dir] = true;
      } else if (code === 30 && kexMap === MSG_ECDH) {
        str('ssh.ecdh.q_c', 'ssh.ecdh.q_c_length', box);
      } else if ((code === 31 && kexMap === MSG_ECDH) || (code === 31 && kexMap === MSG_DH) || (code === 33 && kexMap === MSG_GEX)) {
        hostKey(ctx, box, d, o, 'key');
        o += 4 + u32(d, o);
        if (kexMap === MSG_ECDH) str('ssh.ecdh.q_s', 'ssh.ecdh.q_s_length', box);
        else str('ssh.dh.f', 'ssh.mpint_length', box);
        hostKey(ctx, box, d, o, 'sig');
        o += 4 + u32(d, o);
      } else if (code === 30 || code === 32) {
        str('ssh.dh.e', 'ssh.mpint_length', box);
      } else if (code === 5 || code === 6) {
        str('ssh.service_name', 'ssh.service_name_length', box);
      }
    } catch { /* truncated payload: keep what we have */ }
    if (pad && payEnd < pe) ctx.add(vt, 'ssh.padding_string', payEnd, pe - payEnd, d.subarray(payEnd, pe));
    ctx.gen(vt, 'ssh.seq_num', rec.seq);
    if (!ctx.vars.sshDir) { ctx.vars.sshDir = true; ctx.gen(t, 'ssh.direction', !client); }
    addInfo(mname);
    return pe - off;
  },
});
const FIELD_STR = new Set(['ssh.service_name', 'ssh.host_key.type', 'ssh.host_sig.type']);

function hostKey(ctx, parent, d, o, which) {
  const n = u32(d, o);
  const tl = u32(d, o + 4);
  const type = ascii(d, o + 8, tl);
  const pre = which === 'key' ? 'ssh.host_key' : 'ssh.host_sig';
  const box = ctx.text(parent, `KEX host ${which === 'key' ? 'key' : 'signature'} (type: ${type})`, o, 4 + n);
  ctx.add(box, `${pre}.length`, o, 4, n);
  ctx.add(box, `${pre}.type_length`, o + 4, 4, tl);
  ctx.add(box, `${pre}.type`, o + 8, tl, type);
  const r = o + 8 + tl, e = o + 4 + n;
  if (which === 'key' && type === 'ssh-ed25519' && e - r >= 4) {
    const kl = u32(d, r);
    ctx.add(box, 'ssh.host_key.eddsa.key_length', r, 4, kl);
    ctx.add(box, 'ssh.host_key.eddsa.key', r + 4, kl, d.subarray(r + 4, r + 4 + kl));
  } else if (e > r) ctx.add(box, `${pre}.data`, r, e - r, d.subarray(r, e));
}
void hexStr;
