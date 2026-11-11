/* node --test — DICOM networking (src/js/dicomNet.js, src/js/net-transport.js) over loopback TCP:
 * our SCP (Q/R + storage, MemoryArchive of real samples) against our SCU, plus an optional Orthanc run in Docker. */
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dicomParser = require('dicom-parser');
const N = require('../src/js/dicomNet');
const NetTransport = require('../src/js/net-transport');

const SAMPLES = path.join(__dirname, '..', 'samples');
const FILES = ['CT_small.dcm', 'MR_small.dcm', 'pydicom-data/emri_small.dcm', 'cornerstone/CTImage.dcm']
  .map((f) => path.join(SAMPLES, f)).filter((f) => fs.existsSync(f));
const bytes = FILES.map((f) => new Uint8Array(fs.readFileSync(f)));
const info = bytes.map((b) => {
  const ds = dicomParser.parseDicom(b);
  return { bytes: b, sop: ds.string('x00080018'), cls: ds.string('x00080016'), study: ds.string('x0020000d'), series: ds.string('x0020000e'),
    name: ds.string('x00100010'), id: ds.string('x00100020'), date: ds.string('x00080020'), modality: ds.string('x00080060') };
});
const byName = (n) => info[FILES.findIndex((f) => f.endsWith(n))];
const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

/* ── Node net.Socket → DicomNet transport ── */
function nodeTransport(socket, spy) {
  let onData = null, closed = false;
  const queue = [], closeCbs = [];
  socket.on('data', (d) => { const u = new Uint8Array(d.buffer, d.byteOffset, d.length); if (onData) onData(u); else queue.push(u); });
  socket.on('close', () => { closed = true; closeCbs.splice(0).forEach((cb) => cb()); });
  socket.on('error', () => {});
  return {
    write: (b) => { if (spy) spy(b); return new Promise((res, rej) => socket.write(b, (e) => (e ? rej(e) : res()))); },
    onData(cb) { onData = cb; queue.splice(0).forEach(cb); },
    onClose(cb) { if (closed) cb(); else closeCbs.push(cb); },
    close: () => new Promise((res) => {
      if (closed) return res();
      socket.once('close', res);
      socket.end();
      setTimeout(() => socket.destroy(), 300).unref();
    }),
  };
}
function connectNode(port, spy) {
  return new Promise((res, rej) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => res(nodeTransport(s, spy)));
    s.once('error', rej);
  });
}
async function startScp(opts, spy) {
  const assocs = [];
  const server = net.createServer((sock) => { assocs.push(N.serve(nodeTransport(sock, spy), opts)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port, assocs,
    close: () => new Promise((r) => { for (const a of assocs) a.abort().catch(() => {}); server.close(() => r()); }),
  };
}
const client = (port, extra) => new N.Client(Object.assign({ connect: () => connectNode(port), callingAE: 'TESTSCU', calledAE: 'PACS', timeout: 3000, dimseTimeout: 10000 }, extra));

const archive = new N.MemoryArchive();
bytes.forEach((b) => archive.add(b));
const store2 = new N.MemoryArchive();   // C-MOVE destination
let pacs, dest;

test.before(async () => {
  dest = await startScp({ aeTitle: 'STORE2', onStore: (b) => { store2.add(b); return 0; } });
  pacs = await startScp(Object.assign({ aeTitle: 'PACS' }, archive.handlers({
    readOnly: true,
    moveDestination: (ae) => (ae === 'STORE2' ? { connect: () => connectNode(dest.port) } : null),
  })));
});
test.after(async () => { await pacs.close(); await dest.close(); });

/* ── Data encoding ── */
test('samples for the network tests are present', () => { assert.equal(FILES.length, 4); });

test('dataset encode / decode round trip (explicit, implicit, sequences, UTF-8)', () => {
  const obj = { PatientName: '홍^길동', PatientID: 'P1', StudyDate: '20240102', Rows: 512, QueryRetrieveLevel: 'STUDY',
    ReferencedSOPSequence: [{ ReferencedSOPClassUID: '1.2.3', ReferencedSOPInstanceUID: '1.2.3.4' }], '00091010': { vr: 'LO', value: 'private' } };
  for (const explicit of [true, false]) {
    const b = N.encodeDataset(obj, { explicit });
    assert.equal(b.length % 2, 0);
    const d = N.decodeDataset(b, { explicit });
    assert.equal(d.SpecificCharacterSet, 'ISO_IR 192');
    assert.equal(d.PatientName, '홍^길동');
    assert.equal(d.Rows, 512);
    assert.equal(d.ReferencedSOPSequence.length, 1);
    assert.equal(d.ReferencedSOPSequence[0].ReferencedSOPInstanceUID, '1.2.3.4');
    if (explicit) assert.equal(d.tags['00091010'].value, 'private'); else assert.ok(d.tags['00091010'].value instanceof Uint8Array);
  }
  const cmd = N.encodeCommand({ CommandField: 0x20, MessageID: 7, AffectedSOPClassUID: N.SOP.STUDY_ROOT_FIND, Priority: 0, CommandDataSetType: 0 });
  const c = N.decodeCommand(cmd);
  assert.equal(c.CommandGroupLength, cmd.length - 12);
  assert.equal(c.CommandField, 0x20);
  assert.equal(c.AffectedSOPClassUID, N.SOP.STUDY_ROOT_FIND);
});

test('matching rules: wildcards, ranges, lists, PN case', () => {
  assert.ok(N.matchValue('', 'x', 'LO'));
  assert.ok(N.matchValue('*', '', 'LO'));
  assert.ok(N.matchValue('Comp*CT?', 'CompressedSamples^CT1', 'PN'));
  assert.ok(N.matchValue('compressed*', 'CompressedSamples^CT1', 'PN'));
  assert.ok(!N.matchValue('Comp*', 'compressedSamples', 'LO'));
  assert.ok(N.matchValue('20020101-20031231', '20021231', 'DA'));
  assert.ok(!N.matchValue('20020101-20031231', '20040119', 'DA'));
  assert.ok(N.matchValue('-20011231', '20010105', 'DA'));
  assert.ok(N.matchValue('20040101-', '20040826', 'DA'));
  assert.ok(N.matchValue('0700-0800', '072730', 'TM'));
  assert.ok(N.matchValue('07-08', '082959', 'TM'));
  assert.ok(N.matchValue('1.2.3\\1.2.4', '1.2.4', 'UI'));
  assert.ok(!N.matchValue('1.2.*', '1.2.4', 'UI'));
  assert.ok(N.matchValue('MR', 'CT\\MR', 'CS'));
  assert.equal(N.statusText(0xA801), 'Refused: move destination unknown');
  assert.equal(N.statusCategory(0xFF00), 'pending');
  assert.equal(N.statusCategory(0xB000), 'warning');
});

test('Part 10 wrap / unwrap keeps the data set byte-identical; Explicit → Implicit conversion', () => {
  for (const it of info) {
    const f = N.parsePart10(it.bytes);
    assert.equal(f.sopInstanceUid, it.sop);
    const again = N.toPart10(f.dataset, { transferSyntax: f.transferSyntax, sopClassUid: f.sopClassUid, sopInstanceUid: f.sopInstanceUid, sourceAE: 'X' });
    const ds = dicomParser.parseDicom(again);
    assert.equal(ds.string('x00080018'), it.sop);
    assert.equal(ds.string('x00020016'), 'X');
    assert.ok(same(N.parsePart10(again).dataset, f.dataset));
  }
  const f = N.parsePart10(byName('CT_small.dcm').bytes);
  assert.equal(f.transferSyntax, N.TS.EXPLICIT_LE);
  const imp = N.explicitToImplicit(f.dataset);
  const ds = dicomParser.parseDicom(imp, { TransferSyntaxUID: N.TS.IMPLICIT_LE });
  const orig = dicomParser.parseDicom(byName('CT_small.dcm').bytes);
  assert.equal(ds.string('x00100010'), orig.string('x00100010'));
  assert.equal(ds.elements.x7fe00010.length, orig.elements.x7fe00010.length);
  // raw data set without meta
  const raw = N.parsePart10(imp);
  assert.equal(raw.transferSyntax, N.TS.IMPLICIT_LE);
  assert.equal(raw.sopInstanceUid, byName('CT_small.dcm').sop);
});

/* ── C-ECHO / C-FIND ── */
test('C-ECHO', async () => {
  const r = await client(pacs.port).echo();
  assert.equal(r.status, 0);
  assert.equal(r.ok, true);
  assert.equal(r.text, 'Success');
});

test('C-FIND study level: wildcards, date ranges, modality, counts', async () => {
  const c = client(pacs.port);
  let r = await c.find({ level: 'STUDY', query: { PatientName: 'CompressedSamples*' } });
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.PatientID).sort(), ['1CT1', '4MR1']);
  assert.equal(r.status.status, 0);
  const ct = r.find((x) => x.PatientID === '1CT1');
  assert.equal(ct.StudyInstanceUID, byName('CT_small.dcm').study);
  assert.equal(ct.NumberOfStudyRelatedInstances, '1');
  assert.equal(ct.NumberOfStudyRelatedSeries, '1');
  assert.equal(ct.ModalitiesInStudy, 'CT');
  assert.equal(ct.StudyDate, '20040119');
  assert.equal(ct.QueryRetrieveLevel, 'STUDY');
  assert.ok(ct.tags['00100010']);

  r = await c.find({ level: 'STUDY', query: { PatientID: '?CT?' } });
  assert.deepEqual(r.map((x) => x.PatientID), ['1CT1']);
  r = await c.find({ level: 'STUDY', query: { StudyDate: '20020101-20031231' } });
  assert.equal(r.length, 0);
  r = await c.find({ level: 'STUDY', query: { StudyDate: '20000101-20011231' } });
  assert.deepEqual(r.map((x) => x.StudyDate).sort(), ['20000101', '20010105']);
  r = await c.find({ level: 'STUDY', query: { StudyDate: '20040101-' } });
  assert.equal(r.length, 2);
  r = await c.find({ level: 'STUDY', query: { ModalitiesInStudy: 'MR' } });
  assert.equal(r.length, 2);
  r = await c.find({ level: 'STUDY', query: { PatientName: 'mister^ct' } });   // PN is case-insensitive here
  assert.equal(r.length, 1);
  r = await c.find({ level: 'STUDY', query: {}, limit: 1 });
  assert.equal(r.length, 1);
});

test('C-FIND limit sends C-CANCEL; the SCP stops and answers Cancelled', async () => {
  let produced = 0;
  const scp = await startScp({ aeTitle: 'SLOWFIND', onFind: async function* (q, level, i) {
    for (let k = 0; k < 50 && !i.isCancelled(); k++) { produced++; yield { PatientID: 'P' + k }; await new Promise((r) => setTimeout(r, 20)); }
  } });
  try {
    const got = [];
    const r = await client(scp.port, { calledAE: 'SLOWFIND' }).find({ level: 'STUDY', query: {}, limit: 2, onResult: (x) => got.push(x.PatientID) });
    assert.deepEqual(r.map((x) => x.PatientID), ['P0', 'P1']);
    assert.deepEqual(got, ['P0', 'P1']);
    assert.equal(r.status.category, 'cancel');
    assert.ok(produced < 10, `SCP produced ${produced}`);
  } finally { await scp.close(); }
});

test('C-FIND series / image level, UID list matching, patient root', async () => {
  const c = client(pacs.port);
  const ct = byName('CTImage.dcm'), mr = byName('MR_small.dcm');
  let r = await c.find({ level: 'SERIES', query: { StudyInstanceUID: ct.study } });
  assert.equal(r.length, 1);
  assert.equal(r[0].SeriesInstanceUID, ct.series);
  assert.equal(r[0].Modality, 'CT');
  assert.equal(r[0].NumberOfSeriesRelatedInstances, '1');
  r = await c.find({ level: 'IMAGE', query: { SOPInstanceUID: `${ct.sop}\\${mr.sop}` } });
  assert.deepEqual(r.map((x) => x.SOPInstanceUID).sort(), [ct.sop, mr.sop].sort());
  assert.ok(r.every((x) => x.SOPClassUID));
  r = await c.find({ level: 'IMAGE', query: { SeriesInstanceUID: mr.series, InstanceNumber: '' } });
  assert.equal(r.length, 1);
  r = await c.find({ root: 'patient', level: 'PATIENT', query: { PatientID: '*' } });
  assert.equal(r.length, 4);
  assert.ok(r.every((x) => x.NumberOfPatientRelatedStudies === '1'));
  r = await c.find({ root: 'patient', level: 'STUDY', query: { PatientID: '2178309' } });
  assert.equal(r.length, 1);
  await assert.rejects(c.find({ root: 'study', level: 'PATIENT' }), /Study Root does not have a PATIENT level/);
});

/* ── C-GET / C-MOVE / C-STORE ── */
test('C-GET returns byte-identical data sets that re-parse with dicom-parser', async () => {
  const got = [], progress = [];
  const ct1 = byName('CT_small.dcm'), ct2 = byName('CTImage.dcm');
  const r = await client(pacs.port).get({ level: 'STUDY', query: { StudyInstanceUID: `${ct1.study}\\${ct2.study}` } }, {
    onInstance: (b, i) => { got.push({ b, i }); },
    onProgress: (p) => progress.push(p),
  });
  assert.equal(r.status, 0, r.text);
  assert.equal(r.completed, 2);
  assert.equal(r.failed, 0);
  assert.equal(r.received, 2);
  assert.equal(got.length, 2);
  assert.ok(progress.length >= 1);
  for (const { b, i } of got) {
    const ds = dicomParser.parseDicom(b);
    const orig = info.find((x) => x.sop === ds.string('x00080018'));
    assert.ok(orig, 'same SOP Instance UID');
    assert.equal(i.sopInstanceUid, orig.sop);
    assert.equal(ds.string('x00020010'), N.parsePart10(orig.bytes).transferSyntax);   // not transcoded
    assert.ok(same(N.parsePart10(b).dataset, N.parsePart10(orig.bytes).dataset), 'byte-identical data set');
  }
});

test('C-MOVE to our own storage SCP', async () => {
  const progress = [];
  const r = await client(pacs.port).move({ level: 'STUDY', query: { ModalitiesInStudy: 'MR' } }, 'STORE2', { onProgress: (p) => progress.push(p) });
  assert.equal(r.status, 0, r.text);
  assert.equal(r.completed, 2);
  assert.equal(store2.size, 2);
  for (const rec of store2.list()) {
    const orig = info.find((x) => x.sop === rec.sopInstanceUid);
    assert.equal(orig.modality, 'MR');
    assert.ok(same(N.parsePart10(rec.bytes).dataset, N.parsePart10(orig.bytes).dataset));
    assert.equal(dicomParser.parseDicom(rec.bytes).string('x00020016'), 'PACS');
  }
  await assert.rejects(client(pacs.port).move({ level: 'STUDY', query: {} }, 'NOWHERE'),
    (e) => e.code === 'STATUS' && e.status.status === 0xA801 && /move destination unknown/.test(e.message));
});

test('C-STORE SCU → SCP round trips every file', async () => {
  const received = [];
  const scp = await startScp({ aeTitle: 'STORESCP', onStore: (b, i) => { received.push({ b, i }); return 0; } });
  try {
    const progress = [];
    const r = await client(scp.port, { calledAE: 'STORESCP' }).store(bytes, { onProgress: (p) => progress.push(p.done) });
    assert.deepEqual(r.map((x) => x.status), [0, 0, 0, 0]);
    assert.deepEqual(progress, [1, 2, 3, 4]);
    assert.equal(received.length, 4);
    for (const { b, i } of received) {
      const orig = info.find((x) => x.sop === i.sopInstanceUid);
      assert.equal(i.callingAE, 'TESTSCU');
      assert.ok(same(N.parsePart10(b).dataset, N.parsePart10(orig.bytes).dataset));
    }
  } finally { await scp.close(); }
});

test('C-STORE falls back to Implicit VR when the SCP only takes Implicit', async () => {
  const received = [];
  const scp = await startScp({ aeTitle: 'IMPL', preferredTransferSyntaxes: () => [N.TS.IMPLICIT_LE], onStore: (b) => { received.push(b); } });
  try {
    const src = byName('CT_small.dcm');
    const transport = await connectNode(scp.port);
    const a = await N.associate(transport, { callingAE: 'TESTSCU', calledAE: 'IMPL', contexts: [{ abstractSyntax: src.cls, transferSyntaxes: [N.TS.IMPLICIT_LE] }] });
    const r = await N.store(a, src.bytes);
    await a.release();
    assert.equal(r.status, 0);
    const ds = dicomParser.parseDicom(received[0]);
    assert.equal(ds.string('x00020010'), N.TS.IMPLICIT_LE);
    assert.equal(ds.string('x00100010'), src.name);
    assert.equal(ds.elements.x7fe00010.length, dicomParser.parseDicom(src.bytes).elements.x7fe00010.length);
  } finally { await scp.close(); }
});

test('tiny max PDU (4096) still moves a 500 KB file both ways', async () => {
  const big = byName('CTImage.dcm');
  assert.ok(big.bytes.length > 500000);
  let maxSeen = 0, pdus = 0;
  const spy = (b) => { if (b[0] === 4) { pdus++; maxSeen = Math.max(maxSeen, b.length - 6); } };
  const received = [];
  const scp = await startScp({ aeTitle: 'TINY', maxPdu: 4096, onStore: (b) => { received.push(b); },
    onGet: () => [big.bytes], preferredTransferSyntaxes: () => [N.TS.IMPLICIT_LE] }, spy);
  try {
    const transport = await connectNode(scp.port, spy);
    const a = await N.associate(transport, { callingAE: 'TESTSCU', calledAE: 'TINY', maxPdu: 4096,
      contexts: N.storeContexts([big.bytes]).concat(N.getContexts('study', { sopClasses: [big.cls] })) });
    assert.equal(a.peerMaxPdu, 4096);
    const r = await N.store(a, big.bytes);
    assert.equal(r.status, 0);
    const back = [];
    const g = await N.get(a, { level: 'IMAGE', query: { SOPInstanceUID: big.sop } }, { onInstance: (b) => back.push(b) });
    await a.release();
    assert.equal(g.completed, 1);
    assert.ok(same(N.parsePart10(received[0]).dataset, N.parsePart10(big.bytes).dataset));
    assert.ok(same(N.parsePart10(back[0]).dataset, N.parsePart10(big.bytes).dataset));
    assert.ok(maxSeen <= 4096, `PDU of ${maxSeen} bytes`);
    assert.ok(pdus > 250, `${pdus} P-DATA PDUs`);
  } finally { await scp.close(); }
});

/* ── Failures ── */
test('association rejection (wrong called AE) gives a clear error', async () => {
  await assert.rejects(client(pacs.port, { calledAE: 'WRONG' }).echo(),
    (e) => e.code === 'REJECTED' && /rejected permanently/.test(e.message) && /called AE title not recognised/.test(e.message));
  const scp = await startScp({ aeTitle: 'PICKY', onAssociate: (i) => i.callingAE === 'FRIEND' });
  try {
    await assert.rejects(client(scp.port, { calledAE: 'PICKY' }).echo(), /calling AE title not recognised/);
    assert.equal((await client(scp.port, { calledAE: 'PICKY', callingAE: 'FRIEND' }).echo()).status, 0);
  } finally { await scp.close(); }
});

test('unsupported service and aborts produce clear errors', async () => {
  const scp = await startScp({ aeTitle: 'ABORTER', onEcho: (i) => { i.association.abort(); return new Promise(() => {}); } });
  try {
    await assert.rejects(client(scp.port, { calledAE: 'ABORTER' }).echo(), (e) => e.code === 'ABORTED' && /aborted by ABORTER/.test(e.message));
    // storage-only SCP has no Q/R FIND
    await assert.rejects(client(dest.port, { calledAE: 'STORE2' }).find({ level: 'STUDY' }),
      (e) => e.code === 'NO_CONTEXT' && /abstract syntax not supported/.test(e.message));
  } finally { await scp.close(); }
  // the peer just drops the connection
  const server = net.createServer((s) => s.destroy());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(client(server.address().port).echo(), (e) => e.code === 'CLOSED' && /closed before the association was accepted/.test(e.message));
  } finally { server.close(); }
});

test('timeouts: ARTIM (no A-ASSOCIATE answer), DIMSE (no response), SCP waiting for a request', async () => {
  const silent = net.createServer(() => {});
  await new Promise((r) => server0(silent, r));
  const sockets = [];
  silent.on('connection', (s) => sockets.push(s));
  try {
    const t0 = Date.now();
    await assert.rejects(client(silent.address().port, { timeout: 300 }).echo(), (e) => e.code === 'TIMEOUT' && /No A-ASSOCIATE response/.test(e.message));
    assert.ok(Date.now() - t0 < 2000);
  } finally { sockets.forEach((s) => s.destroy()); silent.close(); }

  const scp = await startScp({ aeTitle: 'SLOW', onFind: () => new Promise(() => {}) });
  try {
    await assert.rejects(client(scp.port, { calledAE: 'SLOW', dimseTimeout: 300 }).find({ level: 'STUDY' }),
      (e) => e.code === 'TIMEOUT' && /No DIMSE response from SLOW/.test(e.message));
  } finally { await scp.close(); }

  const idle = await startScp({ aeTitle: 'IDLE', timeout: 200 });
  try {
    const s = net.connect({ host: '127.0.0.1', port: idle.port });
    const closedIn = await new Promise((res) => { const t = Date.now(); s.on('close', () => res(Date.now() - t)); s.on('error', () => {}); });
    assert.ok(closedIn < 2000, `closed after ${closedIn} ms`);
  } finally { await idle.close(); }
});
function server0(srv, cb) { srv.listen(0, '127.0.0.1', cb); }

/* ── net-transport.js over a fake host bridge (base64 events, like the Tauri host) ── */
test('NetTransport: connect and listen through a host-style bridge', async () => {
  const subs = { data: [], closed: [], accept: [] };
  const socks = new Map(), servers = new Map();
  let next = 1;
  const emit = (k, p) => setImmediate(() => subs[k].forEach((cb) => cb(p)));
  const adopt = (s) => {
    const id = next++;
    socks.set(id, s);
    s.on('data', (d) => emit('data', { id, data: d.toString('base64') }));
    s.on('close', () => { socks.delete(id); emit('closed', { id }); });
    s.on('error', () => {});
    return id;
  };
  const api = {
    connect: (host, port) => new Promise((res, rej) => { const s = net.connect({ host, port }, () => res(adopt(s))); s.once('error', rej); }),
    send: (id, b) => new Promise((res) => socks.get(id).write(b, res)),
    close: (id) => { const s = socks.get(id); if (s) s.end(); return !!s; },
    listen: (port) => new Promise((res) => {
      const lid = next++;
      const srv = net.createServer((s) => { const id = adopt(s); emit('accept', { listener: lid, id, peer: `${s.remoteAddress}:${s.remotePort}` }); });
      servers.set(lid, srv);
      srv.listen(port, '127.0.0.1', () => res({ id: lid, port: srv.address().port }));
    }),
    stopListen: (id) => { servers.get(id).close(); return true; },
    onData: (cb) => subs.data.push(cb), onClosed: (cb) => subs.closed.push(cb), onAccept: (cb) => subs.accept.push(cb),
  };
  const NT = NetTransport.create(api);
  assert.ok(NT.available());
  // SCU through the bridge → our PACS
  const c = new N.Client({ connect: () => NT.connect('127.0.0.1', pacs.port), callingAE: 'TESTSCU', calledAE: 'PACS' });
  assert.equal((await c.echo()).status, 0);
  assert.equal((await c.find({ level: 'STUDY', query: { PatientID: '1CT1' } })).length, 1);
  // SCP through the bridge ← a Node SCU
  const got = [];
  const l = await NT.listen(0, (t, meta) => { assert.ok(meta.peer.startsWith('127.0.0.1')); N.serve(t, { aeTitle: 'BRIDGE', onStore: (b) => { got.push(b); } }); });
  try {
    const r = await client(l.port, { calledAE: 'BRIDGE' }).store([byName('MR_small.dcm').bytes]);
    assert.equal(r[0].status, 0);
    assert.ok(same(N.parsePart10(got[0]).dataset, N.parsePart10(byName('MR_small.dcm').bytes).dataset));
  } finally { await l.close(); }
  await assert.rejects(NetTransport.create(() => null).connect('x', 1), /only available in the desktop app/);
});

/* ── Optional: an independent PACS (Orthanc in Docker) ── */
function docker(args, timeout) {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: timeout || 20000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
}
test('Orthanc (Docker) validates C-ECHO / C-STORE / C-FIND / C-GET', { timeout: 60000 }, async (t) => {
  let image = null;
  try { docker(['version', '--format', '{{.Server.Version}}'], 8000); } catch (e) { t.skip('Docker is not available (daemon not running)'); return; }
  for (const img of ['orthancteam/orthanc', 'jodogne/orthanc']) {
    try { docker(['image', 'inspect', img], 8000); image = img; break; } catch { /* not pulled */ }
  }
  if (!image) { t.skip('no Orthanc image pulled locally (orthancteam/orthanc or jodogne/orthanc)'); return; }
  const name = `mydcm-net-test-${process.pid}`;
  const port = 14242;
  docker(['run', '--rm', '-d', '--name', name, '-p', `${port}:4242`, '-e', 'ORTHANC__DICOM_AET=ORTHANC',
    '-e', 'ORTHANC__DICOM_MODALITIES={"TEST":["TESTSCU","127.0.0.1",11113]}', '-e', 'ORTHANC__AUTHENTICATION_ENABLED=false', image], 30000);
  try {
    const c = client(port, { calledAE: 'ORTHANC', timeout: 2000 });
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      try { ok = (await c.echo()).status === 0; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    assert.ok(ok, 'Orthanc answered C-ECHO');
    const src = byName('CT_small.dcm');
    const st = await c.store([src.bytes]);
    assert.equal(st[0].status, 0, st[0].text);
    const found = await c.find({ level: 'STUDY', query: { StudyInstanceUID: src.study } });
    assert.equal(found.length, 1);
    assert.equal(found[0].PatientID, src.id);
    const imgs = await c.find({ level: 'IMAGE', query: { StudyInstanceUID: src.study, SeriesInstanceUID: src.series } });
    assert.deepEqual(imgs.map((x) => x.SOPInstanceUID), [src.sop]);
    const back = [];
    const g = await c.get({ level: 'STUDY', query: { StudyInstanceUID: src.study } }, { onInstance: (b) => back.push(b) });
    assert.equal(g.completed, 1, g.text);
    assert.equal(dicomParser.parseDicom(back[0]).string('x00080018'), src.sop);
  } finally {
    try { docker(['stop', '-t', '1', name], 20000); } catch { /* already gone */ }
  }
});

/* ── Transcoding: a compressed archive served to a peer that only takes uncompressed data ── */
test('C-GET / C-STORE transcode compressed files for peers without a matching context', async () => {
  const W = require('../src/js/dicomWriter.js');
  const dir = path.join(__dirname, '..', 'samples', 'cornerstone');
  const files = ['CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm', 'CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm',
    'CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm'].map((n) => new Uint8Array(fs.readFileSync(path.join(dir, n))));
  const plainOnly = { transferSyntaxes: N.UNCOMPRESSED_TS };
  for (const transcode of [null, (b) => W.decompress(b)]) {
    const arch = new N.MemoryArchive();
    // the samples are one image in several transfer syntaxes: give each its own SOP Instance UID
    files.forEach((b, i) => { const m = W.parse(b); W.set(m, '00080018', `${W.get(m, '00080018')}.${i}`); arch.add(W.write(m, { transferSyntax: m.transferSyntax })); });
    const scp = await startScp(Object.assign({ aeTitle: 'PACS', transcode }, arch.handlers({ readOnly: true })));
    try {
      const got = [];
      const q = { level: 'STUDY', root: 'study', query: { StudyInstanceUID: arch.find({}, 'STUDY')[0].StudyInstanceUID } };
      const opts = Object.assign({ onInstance: (b) => { got.push(N.parsePart10(b).transferSyntax); return 0; } }, plainOnly);
      if (!transcode) {   // every sub-operation fails: the SCP answers with a failure status
        await assert.rejects(client(scp.port).get(q, opts), (e) => e.code === 'STATUS');
        assert.equal(got.length, 0, 'without transcoding nothing fits an uncompressed-only context');
        continue;
      }
      const r = await client(scp.port).get(q, opts);
      {
        assert.equal(r.completed, 3, 'all three arrive');
        assert.deepEqual(got, [N.TS.EXPLICIT_LE, N.TS.EXPLICIT_LE, N.TS.EXPLICIT_LE]);
      }
    } finally { await scp.close(); }
  }
  // SCU side: a store peer that only accepts uncompressed data gets decompressed copies
  const received = [];
  const plainScp = await startScp({ aeTitle: 'PLAIN', preferredTransferSyntaxes: () => N.UNCOMPRESSED_TS,
    onAssociate: () => true, onStore: (b) => { received.push(N.parsePart10(b).transferSyntax); return 0; } });
  try {
    const res = await client(plainScp.port, { calledAE: 'PLAIN' }).store(files.slice(0, 1), { transcode: (b) => W.decompress(b) });
    assert.ok(res[0].ok, res[0].text);
    assert.equal(received.length, 1);
  } finally { await plainScp.close(); }
});
