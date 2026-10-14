// Builds small ICC profiles for tests (matrix/TRC RGB, grey, v2/v4 names, curves).
/** Writes a small ICC profile: { space, desc, v4, xyz: { rXYZ: [x,y,z] … }, curves: { rTRC: ['gamma', g] | ['para3', g,a,b,c,d] | ['table', [..]] } }. */
export function buildIcc({ space = 'RGB ', desc = 'Test', v4 = false, xyz = {}, curves = {} }) {
  const tags = [];
  const s15 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(Math.round(v * 65536)); return b; };
  if (v4) {
    const text = Buffer.from(desc, 'utf16le').swap16();
    const body = Buffer.concat([Buffer.from('mluc'), Buffer.alloc(4), Buffer.from([0, 0, 0, 1, 0, 0, 0, 12]), Buffer.from('enUS'), (() => { const b = Buffer.alloc(8); b.writeUInt32BE(text.length, 0); b.writeUInt32BE(28, 4); return b; })(), text]);
    tags.push(['desc', body]);
  } else {
    const ascii = Buffer.from(`${desc}\0`, 'latin1');
    const n = Buffer.alloc(4); n.writeUInt32BE(ascii.length);
    tags.push(['desc', Buffer.concat([Buffer.from('desc'), Buffer.alloc(4), n, ascii, Buffer.alloc(79)])]);
  }
  for (const [sig, [x, y, z]] of Object.entries(xyz)) tags.push([sig, Buffer.concat([Buffer.from('XYZ '), Buffer.alloc(4), s15(x), s15(y), s15(z)])]);
  for (const [sig, [kind, ...p]] of Object.entries(curves)) {
    if (kind === 'gamma') { const b = Buffer.alloc(14); b.write('curv'); b.writeUInt32BE(1, 8); b.writeUInt16BE(Math.round(p[0] * 256), 12); tags.push([sig, b]); }
    if (kind === 'table') { const t = p[0]; const b = Buffer.alloc(12 + t.length * 2); b.write('curv'); b.writeUInt32BE(t.length, 8); t.forEach((v, i) => b.writeUInt16BE(Math.round(v * 65535), 12 + i * 2)); tags.push([sig, b]); }
    if (kind === 'para3') { const b = Buffer.concat([Buffer.from('para'), Buffer.alloc(4), Buffer.from([0, 3, 0, 0]), ...p.map(s15)]); tags.push([sig, b]); }
  }
  let offset = 128 + 4 + tags.length * 12;
  const table = Buffer.alloc(4 + tags.length * 12);
  table.writeUInt32BE(tags.length, 0);
  const bodies = [];
  tags.forEach(([sig, body], i) => {
    const padded = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
    table.write(sig, 4 + i * 12, 'latin1'); table.writeUInt32BE(offset, 8 + i * 12); table.writeUInt32BE(body.length, 12 + i * 12);
    bodies.push(padded); offset += padded.length;
  });
  const header = Buffer.alloc(128);
  header.writeUInt32BE(offset, 0);
  header[8] = v4 ? 4 : 2;
  header.write('mntr', 12); header.write(space, 16); header.write('XYZ ', 20); header.write('acsp', 36);
  return new Uint8Array(Buffer.concat([header, table, ...bodies]));
}

// Adobe RGB (1998), D50-adapted columns as in Adobe's profile.
export const ADOBE = { rXYZ: [0.60974, 0.31111, 0.01947], gXYZ: [0.20528, 0.62567, 0.06087], bXYZ: [0.14919, 0.06322, 0.74457] };
