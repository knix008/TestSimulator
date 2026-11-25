// The product data vault (src/cad/vault.js) on a real folder under the system temp folder: index, locks,
// accounts (PBKDF2 logins), lifecycle and permissions, revisions, data cards, change orders, live references
// (stubs resolved per policy, out-of-date detection through sub-assemblies, where used, rename, copy tree),
// Pack and Go (folder and ZIP), search, BOM, compare and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { Vault, VaultError, SCHEMES, describeContent, vaultName, passwordHash, storedContent } from '../../src/cad/vault.js';
import { makeZip, readZip, crc32 } from '../../src/cad/vault-zip.js';
import { nodeVaultStore } from '../fixtures/vault-node-store.js';

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mymech-vault-test-'));
after(() => { fs.rmSync(TEMP, { recursive: true, force: true }); });
let n = 0;
const folder = () => { const dir = path.join(TEMP, `v${++n}`); fs.mkdirSync(dir); return dir; };

const part = (id, name, extra = {}) => ({ id, name, partNo: '', description: '', material: 'steel', features: [], ...extra });
const project = (name, { parts = [], assemblies = [], drawings = [], active = null } = {}) => JSON.stringify({ format: 'mymechanics', version: 1, name, units: 'mm', up: 'z', parts, assemblies, drawings, active: active ?? (parts[0] ? { kind: 'part', id: parts[0].id } : assemblies[0] ? { kind: 'assembly', id: assemblies[0].id } : null) });
const partFile = (name, extra = {}) => project(name, { parts: [part(`p-${name}`, name, extra)] });

/** A vault with an admin, an editor, an approver and a viewer (each its own Vault on the same folder). */
const KDF = { kdfIterations: 1000 }; // fast hashes for the tests (the app uses 310 000)
const pw = (user) => `pw-${user}`;
async function team({ scheme = 'letter' } = {}) {
  const dir = folder();
  const store = nodeVaultStore(dir);
  const admin = await Vault.create(store, { name: 'Test vault', scheme, user: 'admin', password: pw('admin'), host: 'pc0', ...KDF });
  for (const [u, r] of [['alice', 'editor'], ['erin', 'editor'], ['bob', 'approver'], ['dave', 'approver'], ['carol', 'viewer']]) await admin.addUser(u, pw(u), r);
  const as = async (user, host = `pc-${user}`) => Vault.login(nodeVaultStore(dir), { user, password: pw(user), host });
  return { dir, store, admin, alice: await as('alice'), bob: await as('bob'), dave: await as('dave'), carol: await as('carol'), as };
}
const code = (c) => (e) => e instanceof VaultError && e.code === c;
const ready = { partNumber: 'PN-1', description: 'Bracket' };

// ───────────────────────── index and files

test('a new vault writes its index; a second vault in the same folder is refused; a plain folder is not a vault', async () => {
  const dir = folder();
  const v = await Vault.create(nodeVaultStore(dir), { name: 'Shop', user: 'admin', password: 'secret', ...KDF });
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
  assert.equal(ix.format, 'mymechanics-vault');
  assert.equal(ix.name, 'Shop');
  assert.match(ix.id, /^v/);
  assert.equal(ix.users.admin.role, 'admin');
  assert.equal(v.role, 'admin');
  await assert.rejects(Vault.create(nodeVaultStore(dir), { name: 'again', user: 'x', password: 'secret', ...KDF }), code('exists'));
  await assert.rejects(Vault.login(nodeVaultStore(folder()), { user: 'x', password: 'secret' }), code('notVault'));
});

// ───────────────────────── accounts

test('accounts: passwords are PBKDF2 hashes with their own salt; wrong passwords, unknown and disabled users cannot log in', async () => {
  const { dir, admin, as } = await team();
  const ix = JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
  const text = JSON.stringify(ix);
  for (const u of ['admin', 'alice', 'bob']) assert.equal(text.includes(pw(u)), false, `plain password of ${u}`);
  assert.notEqual(ix.users.alice.salt, ix.users.bob.salt);
  assert.equal(ix.users.alice.hash, await passwordHash(pw('alice'), ix.users.alice.salt, ix.users.alice.iterations));
  await assert.rejects(Vault.login(nodeVaultStore(dir), { user: 'alice', password: 'wrong' }), code('badLogin'));
  await assert.rejects(Vault.login(nodeVaultStore(dir), { user: 'mallory', password: 'x' }), code('badLogin'));
  await admin.setDisabled('alice', true);
  await assert.rejects(as('alice'), code('badLogin'));
  await admin.setDisabled('alice', false);
  assert.equal((await as('alice')).session.user, 'alice');
  assert.deepEqual(admin.users.map((u) => u.name).sort(), ['admin', 'alice', 'bob', 'carol', 'dave', 'erin']);
  assert.ok(admin.users.every((u) => u.hasPassword && !('hash' in u)));
});

test('accounts: only admins manage users; the last admin stays; users change their own password with the old one', async () => {
  const { dir, admin, alice } = await team();
  await assert.rejects(alice.addUser('zed', 'zzzz'), code('permission'));
  await assert.rejects(alice.setRole('alice', 'admin'), code('permission'));
  await assert.rejects(admin.addUser('bob', 'xxxx'), code('userExists'));
  await assert.rejects(admin.addUser('tim', 'x'), code('weakPassword'));
  await assert.rejects(admin.setRole('admin', 'editor'), code('lastAdmin'));
  await assert.rejects(admin.setDisabled('admin'), code('lastAdmin'));
  await assert.rejects(alice.setPassword('alice', 'new-pass', { old: 'nope' }), code('badLogin'));
  await alice.setPassword('alice', 'new-pass', { old: pw('alice') });
  await assert.rejects(Vault.login(nodeVaultStore(dir), { user: 'alice', password: pw('alice') }), code('badLogin'));
  assert.equal((await Vault.login(nodeVaultStore(dir), { user: 'alice', password: 'new-pass' })).user, 'alice');
  await assert.rejects(alice.setPassword('bob', 'hijack'), code('permission'));
  await admin.setPassword('bob', 'reset-by-admin');
  assert.equal((await Vault.login(nodeVaultStore(dir), { user: 'bob', password: 'reset-by-admin' })).role, 'approver');
});

test('accounts: a vault from before accounts keeps its roles and sets each password at the first login', async () => {
  const dir = folder();
  fs.writeFileSync(path.join(dir, 'vault.json'), JSON.stringify({ format: 'mymechanics-vault', version: 1, name: 'Old', created: '2026-01-01', createdBy: 'ann', roles: { ann: 'admin', ben: 'editor' }, files: [] }));
  const ann = await Vault.login(nodeVaultStore(dir), { user: 'ann', password: 'first-pass' });
  assert.equal(ann.role, 'admin');
  await assert.rejects(Vault.login(nodeVaultStore(dir), { user: 'ann', password: 'other' }), code('badLogin'));
  assert.equal((await Vault.login(nodeVaultStore(dir), { user: 'ben', password: 'bens' })).role, 'editor');
});

test('adding a file makes version 1, Work in progress, the first revision, the latest copy and the history copy', async () => {
  const { dir, alice } = await team();
  const f = await alice.addFile('Bracket', partFile('Bracket', { partNo: 'BR-100', description: 'Angle bracket' }), { comment: 'first' });
  assert.equal(f.name, 'Bracket.mymech');
  assert.deepEqual([f.version, f.state, f.revision, f.kind], [1, 'wip', 'A', 'part']);
  assert.equal(f.props.partNumber, 'BR-100');
  assert.ok(fs.existsSync(path.join(dir, 'files', 'Bracket.mymech')));
  assert.ok(fs.existsSync(path.join(dir, 'history', f.id, '1.mymech')));
  await assert.rejects(alice.addFile('bracket.MYMECH', partFile('x')), code('exists'));
  for (const bad of ['', '  ', 'a/b', 'c:d', 'x?']) assert.throws(() => vaultName(bad), code('badName'));
});

test('a viewer can neither add nor check out files', async () => {
  const { alice, carol } = await team();
  const f = await alice.addFile('P1', partFile('P1'));
  await carol.refresh();
  await assert.rejects(carol.addFile('P2', partFile('P2')), code('permission'));
  await assert.rejects(carol.checkOut(f.id), code('permission'));
  assert.equal(carol.allowed(f.id).checkOut, false);
});

// ───────────────────────── locking

test('a check-out is a lock file only one person can hold; the other is told who holds it', async () => {
  const { dir, alice, as } = await team();
  const f = await alice.addFile('P1', partFile('P1'));
  const admin = await as('admin');
  const ed2 = await as('erin');
  await alice.checkOut(f.id);
  const lock = JSON.parse(fs.readFileSync(path.join(dir, '.locks', `${f.id}.lock`), 'utf8'));
  assert.deepEqual([lock.by, lock.host], ['alice', 'pc-alice']);
  await assert.rejects(ed2.checkOut(f.id), (e) => e.code === 'held' && e.params.by === 'alice');
  await assert.rejects(ed2.checkIn(f.id, partFile('P1', { partNo: 'X' })), code('held'));
  await assert.rejects(ed2.undoCheckOut(f.id), code('permission'));
  await alice.checkOut(f.id); // the holder may check out again on the same computer
  await assert.rejects((await as('alice', 'other-pc')).checkOut(f.id), code('held'));
  await alice.checkIn(f.id, partFile('P1', { partNo: 'P1-01' }));
  assert.equal(fs.existsSync(path.join(dir, '.locks', `${f.id}.lock`)), false);
  await ed2.checkOut(f.id);
  await admin.undoCheckOut(f.id); // an admin breaks the lock
  await admin.refresh();
  assert.equal(admin.file(f.id).checkout, null);
  assert.equal(admin.file(f.id).events.at(-1).type, 'breakLock');
});

test('check-in needs the lock; unchanged content adds no version; new content adds one in the same revision', async () => {
  const { alice } = await team();
  const text = partFile('P1');
  const f = await alice.addFile('P1', text);
  await assert.rejects(alice.checkIn(f.id, text), code('notOut'));
  await alice.checkOut(f.id);
  const same = await alice.checkIn(f.id, text, { keepOut: true });
  assert.equal(same.added, false);
  assert.equal(same.file.version, 1);
  const changed = await alice.checkIn(f.id, partFile('P1', { description: 'changed' }), { comment: 'desc' });
  assert.equal(changed.added, true);
  assert.deepEqual([changed.file.version, changed.file.revision, changed.file.checkout], [2, 'A', null]);
  assert.equal(changed.file.versions.at(-1).comment, 'desc');
  assert.equal(JSON.parse(await alice.versionContent(f.id, 2)).parts[0].description, 'changed');
  assert.equal(JSON.parse(await alice.versionContent(f.id, 1)).parts[0].description, '');
});

test('changes from several people at once all reach the index (the index lock serialises them)', async () => {
  const { alice, as } = await team();
  const erin = await as('erin');
  await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? alice : erin).addFile(`F${i}`, partFile(`F${i}`))));
  await alice.refresh();
  assert.equal(alice.files.length, 12);
  assert.equal(new Set(alice.files.map((f) => f.id)).size, 12);
});

test('a stale index lock (left by a crashed program) is broken; a fresh one is waited for', async () => {
  const { dir, alice } = await team();
  fs.writeFileSync(path.join(dir, '.locks', 'index.lock'), JSON.stringify({ by: 'ghost', at: Date.now() - 60000 }));
  await alice.addFile('After', partFile('After'));
  assert.equal(fs.existsSync(path.join(dir, '.locks', 'index.lock')), false);
  fs.writeFileSync(path.join(dir, '.locks', 'index.lock'), JSON.stringify({ by: 'busy', at: Date.now() }));
  setTimeout(() => fs.unlinkSync(path.join(dir, '.locks', 'index.lock')), 150);
  const f = await alice.addFile('Later', partFile('Later'));
  assert.equal(f.version, 1);
});

// ───────────────────────── lifecycle

test('workflow: submit needs the data card, the approver may not be the submitter, released files cannot be checked out', async () => {
  const { alice, bob, as } = await team();
  const f = await alice.addFile('Bracket', partFile('Bracket'));
  await assert.rejects(alice.transition(f.id, 'submit'), code('cardRequired'));
  await alice.setCard(f.id, ready);
  await alice.checkOut(f.id);
  await assert.rejects(alice.transition(f.id, 'submit'), code('checkedOut'));
  await alice.undoCheckOut(f.id);
  await assert.rejects(alice.transition(f.id, 'approve'), code('state'));
  await alice.transition(f.id, 'submit', { comment: 'please check' });
  await assert.rejects(alice.checkOut(f.id), code('state'));
  await assert.rejects(alice.setCard(f.id, { vendor: 'x' }), code('state'));
  await assert.rejects(alice.transition(f.id, 'approve'), code('permission'));
  const bobSelf = await as('bob');
  const g = await bobSelf.addFile('Own', partFile('Own'));
  await bobSelf.setCard(g.id, ready);
  await bobSelf.transition(g.id, 'submit');
  await assert.rejects(bobSelf.transition(g.id, 'approve'), code('fourEyes'));
  await bob.refresh();
  const r = await bob.transition(f.id, 'approve');
  assert.equal(r.state, 'released');
  assert.deepEqual([r.released.revision, r.released.version, r.released.by], ['A', 1, 'bob']);
  await alice.refresh();
  await assert.rejects(alice.checkOut(f.id), code('state'));
  assert.deepEqual(alice.allowed(f.id).transitions, []);
  await assert.rejects(alice.transition(f.id, 'revise'), code('needsOrder'));
  await assert.rejects(alice.transition(f.id, 'obsolete'), code('permission'));
});

test('a pending file can be rejected back to Work in progress; released → obsolete → reinstated by an admin', async () => {
  const { alice, bob, admin } = await team();
  const f = await alice.addFile('P', partFile('P', { partNo: 'P-1', description: 'd' }));
  await alice.transition(f.id, 'submit');
  await bob.refresh();
  assert.equal((await bob.transition(f.id, 'reject', { comment: 'fix' })).state, 'wip');
  await alice.transition(f.id, 'submit');
  await bob.transition(f.id, 'approve');
  assert.equal((await bob.transition(f.id, 'obsolete')).state, 'obsolete');
  await bob.refresh();
  await assert.rejects(bob.transition(f.id, 'reinstate'), code('permission'));
  await admin.refresh();
  assert.equal((await admin.transition(f.id, 'reinstate')).state, 'released');
});

test('an assembly is not approved before the files it uses are released', async () => {
  const { alice, bob } = await team();
  const p = await alice.addFile('Shaft', partFile('Shaft', { partNo: 'S-1', description: 'shaft' }));
  const asmProject = JSON.parse(project('Drive', { assemblies: [{ id: 'a1', name: 'Drive', components: [], mates: [], partNo: 'D-1', description: 'drive' }] }));
  await alice.link(asmProject, p.id, 'p-Shaft');
  const a = await alice.addFile('Drive', JSON.stringify(asmProject));
  assert.deepEqual(a.refs, [p.id]);
  await alice.transition(a.id, 'submit');
  await bob.refresh();
  await assert.rejects(bob.transition(a.id, 'approve'), (e) => e.code === 'refsNotReleased' && /Shaft/.test(e.params.names));
  await alice.transition(p.id, 'submit');
  await bob.transition(p.id, 'approve');
  assert.equal((await bob.transition(a.id, 'approve')).state, 'released');
});

test('change request → change order → approvals by others → revise (revision B) → released again → order closed', async () => {
  const { alice, bob, dave, admin } = await team();
  await admin.setSettings({ requiredApprovals: 2 });
  const f = await alice.addFile('Plate', partFile('Plate', { partNo: 'PL-1', description: 'plate' }));
  await alice.transition(f.id, 'submit');
  await bob.transition(f.id, 'approve');
  const ecr = await alice.createChange('ecr', { title: 'Thicker plate', files: [f.id] });
  assert.equal(ecr.number, 'ECR-0001');
  await assert.rejects(alice.decideChange(ecr.id, 'approve'), code('permission'));
  await bob.decideChange(ecr.id, 'approve');
  await alice.refresh();
  const eco = await alice.orderFromRequest(ecr.id);
  assert.equal(eco.number, 'ECO-0001');
  assert.equal(eco.status, 'draft');
  assert.equal(alice.change(ecr.id).status, 'closed');
  await alice.submitChange(eco.id);
  await bob.decideChange(eco.id, 'approve');
  await assert.rejects(bob.decideChange(eco.id, 'approve'), code('alreadyDecided'));
  await bob.refresh();
  assert.equal(bob.change(eco.id).status, 'pending'); // 1 of 2 approvals
  await assert.rejects(alice.transition(f.id, 'revise'), code('needsOrder'));
  const done = await dave.decideChange(eco.id, 'approve');
  assert.equal(done.status, 'approved');
  await assert.rejects(alice.closeChange(eco.id), code('orderOpen'));
  const revised = await alice.transition(f.id, 'revise');
  assert.deepEqual([revised.state, revised.revision, revised.version], ['wip', 'B', 1]);
  assert.equal(revised.events.at(-1).order, 'ECO-0001');
  await alice.checkOut(f.id);
  const ci = await alice.checkIn(f.id, partFile('Plate', { partNo: 'PL-1', description: 'thicker plate' }));
  assert.deepEqual([ci.file.version, ci.file.revision], [2, 'B']);
  assert.deepEqual(ci.file.versions.map((v) => `${v.revision}.${v.version}`), ['A.1', 'B.2']);
  await alice.transition(f.id, 'submit');
  await bob.transition(f.id, 'approve');
  await alice.refresh();
  assert.equal((await alice.closeChange(eco.id)).status, 'closed');
});

test('the order author cannot approve it; a rejected order lets nothing be revised', async () => {
  const { alice, bob } = await team();
  const f = await alice.addFile('Q', partFile('Q', { partNo: 'Q', description: 'q' }));
  await alice.transition(f.id, 'submit');
  await bob.transition(f.id, 'approve');
  const eco = await bob.createChange('eco', { title: 'change', files: [f.id] });
  await bob.submitChange(eco.id);
  await assert.rejects(bob.decideChange(eco.id, 'approve'), code('fourEyes'));
  const { carol } = { carol: await Vault.login(bob.store, { user: 'carol', password: pw('carol') }) };
  await assert.rejects(carol.decideChange(eco.id, 'approve'), code('permission'));
  await assert.rejects(alice.decideChange(eco.id, 'reject'), code('permission'));
});

test('revision schemes: letters skip I O Q S X Z and roll over; numbers are two digits and grow', () => {
  const L = SCHEMES.letter; const N = SCHEMES.number;
  const seq = ['A']; for (let i = 0; i < 21; i++) seq.push(L.next(seq.at(-1)));
  assert.deepEqual(seq, [...'ABCDEFGHJKLMNPRTUVWY', 'AA', 'AB']);
  assert.equal(L.next('H'), 'J');
  assert.equal(L.next('Y'), 'AA');
  assert.equal(L.next('AY'), 'BA');
  assert.equal(L.next('YY'), 'AAA');
  assert.deepEqual([N.first, N.next('01'), N.next('09'), N.next('99')], ['01', '02', '10', '100']);
});

test('the revision scheme can change only while nothing was released; numbers start at 01', async () => {
  const { alice, bob, admin } = await team();
  const f = await alice.addFile('R', partFile('R', { partNo: 'R', description: 'r' }));
  await admin.setSettings({ scheme: 'number' });
  await alice.refresh();
  assert.equal(alice.file(f.id).revision, '01');
  await assert.rejects(alice.setSettings({ scheme: 'letter' }), code('permission'));
  await alice.transition(f.id, 'submit');
  await bob.transition(f.id, 'approve');
  await assert.rejects(admin.setSettings({ scheme: 'letter' }), code('schemeInUse'));
});

// ───────────────────────── data cards

test('data cards check their values; admins add custom fields', async () => {
  const { alice, admin } = await team();
  const f = await alice.addFile('C', partFile('C', { partNo: 'from-file' }));
  assert.equal(alice.cardValues(f.id).partNumber, 'from-file');
  const values = await alice.setCard(f.id, { partNumber: 'C-200', cost: '12,5', finish: 'anodized', dueDate: '2026-12-01', critical: 'true' });
  assert.deepEqual([values.partNumber, values.cost, values.finish, values.critical], ['C-200', 12.5, 'anodized', true]);
  await assert.rejects(alice.setCard(f.id, { cost: 'cheap' }), code('badValue'));
  await assert.rejects(alice.setCard(f.id, { finish: 'gold' }), code('badValue'));
  await assert.rejects(alice.setCard(f.id, { dueDate: '1/2/2026' }), code('badValue'));
  await assert.rejects(alice.setCard(f.id, { nonsense: 1 }), code('badField'));
  await assert.rejects(alice.addCardField('general', { key: 'weightClass', type: 'list', options: ['S', 'M'] }), code('permission'));
  await admin.addCardField('general', { key: 'weightClass', label: 'Weight class', type: 'list', options: ['S', 'M'], required: false });
  await alice.refresh();
  assert.equal((await alice.setCard(f.id, { weightClass: 'M' })).weightClass, 'M');
  await assert.rejects(admin.addCardField('general', { key: 'cost' }), code('exists'));
  await alice.checkOut(f.id);
  const erin = await Vault.login(alice.store, { user: 'erin', password: pw('erin') });
  await assert.rejects(erin.setCard(f.id, { vendor: 'x' }), code('held'));
});

// ───────────────────────── references

async function tree(v) {
  const bolt = await v.addFile('Bolt', partFile('Bolt', { partNo: 'B-1', description: 'bolt', material: 'steel' }));
  const plate = await v.addFile('Plate', partFile('Plate', { partNo: 'P-1', description: 'plate', material: 'aluminium' }));
  const sub = JSON.parse(project('Joint', { assemblies: [{ id: 'j', name: 'Joint', partNo: 'J-1', description: 'joint', components: [], mates: [] }] }));
  const b = (await v.link(sub, bolt.id, 'p-Bolt')).doc;
  const pl = (await v.link(sub, plate.id, 'p-Plate')).doc;
  sub.assemblies.find((a) => a.id === 'j').components = [{ id: 'c1', part: pl.id, name: 'Plate<1>' }, { id: 'c2', part: b.id, name: 'Bolt<1>' }, { id: 'c3', part: b.id, name: 'Bolt<2>' }];
  const joint = await v.addFile('Joint', JSON.stringify(sub));
  const top = JSON.parse(project('Frame', { assemblies: [{ id: 'top', name: 'Frame', partNo: 'F-1', description: 'frame', components: [], mates: [] }] }));
  const j = (await v.link(top, joint.id, 'j')).doc;
  const pl2 = (await v.link(top, plate.id, 'p-Plate')).doc;
  top.assemblies.find((a) => a.id === 'top').components = [{ id: 't1', sub: j.id, name: 'Joint<1>' }, { id: 't2', sub: j.id, name: 'Joint<2>' }, { id: 't3', part: pl2.id, name: 'Plate<1>' }];
  top.active = { kind: 'assembly', id: 'top' };
  const frame = await v.addFile('Frame', JSON.stringify(top));
  const dp = JSON.parse(project('Frame drawing'));
  const fa = (await v.link(dp, frame.id, 'top')).doc;
  dp.drawings = [{ id: 'd1', name: 'Sheet', source: { kind: 'assembly', id: fa.id } }];
  dp.active = { kind: 'drawing', id: 'd1' };
  const dwg = await v.addFile('Frame drawing', JSON.stringify(dp));
  return { bolt, plate, joint, frame, dwg };
}

test('linked copies keep their vault reference; the index has Contains and Where used trees', async () => {
  const { alice } = await team();
  const { bolt, plate, joint, frame, dwg } = await tree(alice);
  assert.deepEqual(alice.file(joint.id).refs.sort(), [bolt.id, plate.id].sort());
  // the frame uses the joint and a plate directly; the joint's parts are reached only through the joint
  assert.deepEqual(alice.file(frame.id).refs.sort(), [joint.id, plate.id].sort());
  assert.equal(alice.file(dwg.id).kind, 'drawing');
  const c = alice.contains(frame.id);
  assert.deepEqual(c.children.map((x) => x.file.name).sort(), ['Joint.mymech', 'Plate.mymech']);
  assert.deepEqual(c.children.find((x) => x.file.id === joint.id).children.map((x) => x.file.name).sort(), ['Bolt.mymech', 'Plate.mymech']);
  const w = alice.whereUsed(bolt.id);
  assert.deepEqual(w.children.map((x) => x.file.name), ['Joint.mymech']);
  const viaJoint = w.children[0];
  assert.deepEqual(viaJoint.children.map((x) => x.file.name), ['Frame.mymech']);
  assert.deepEqual(viaJoint.children[0].children.map((x) => x.file.name), ['Frame drawing.mymech']);
  assert.deepEqual(alice.closure(frame.id).length, 4);
  const d = describeContent(await alice.latest(joint.id));
  assert.equal(d.main.id, 'j');
  assert.equal(d.docs.filter((x) => x.linked).length, 2);
});

test('a file cannot come to use itself (directly or through others)', async () => {
  const { alice } = await team();
  const { bolt, joint } = await tree(alice);
  await alice.checkOut(bolt.id);
  const p = JSON.parse(await alice.latest(bolt.id));
  assert.equal(p.vaultLink.fileId, bolt.id);
  await assert.rejects(alice.link(p, joint.id, 'j'), code('cycle'));
  p.assemblies.push(alice.makeStub(joint.id, 'j').doc);
  await assert.rejects(alice.checkIn(bolt.id, JSON.stringify(p)), code('cycle'));
});

test('rename updates the references of every file that uses it; refused while one of them is checked out', async () => {
  const { dir, alice, as } = await team();
  const { plate, joint, frame } = await tree(alice);
  const erin = await as('erin');
  await erin.checkOut(joint.id);
  await assert.rejects(alice.rename(plate.id, 'Base plate'), (e) => e.code === 'parentOut' && /Joint/.test(e.params.names));
  await erin.undoCheckOut(joint.id);
  const before = { joint: alice.file(joint.id).version, frame: alice.file(frame.id).version };
  const r = await alice.rename(plate.id, 'Base plate');
  assert.equal(r.file.name, 'Base plate.mymech');
  assert.deepEqual(r.updated.sort(), ['Frame.mymech', 'Joint.mymech']);
  assert.ok(fs.existsSync(path.join(dir, 'files', 'Base plate.mymech')));
  assert.equal(fs.existsSync(path.join(dir, 'files', 'Plate.mymech')), false);
  assert.equal(alice.file(joint.id).version, before.joint + 1);
  assert.equal(alice.file(frame.id).version, before.frame + 1);
  for (const id of [joint.id, frame.id]) {
    const p = JSON.parse(await alice.latest(id));
    const names = p.parts.filter((x) => x.vaultRef?.fileId === plate.id).map((x) => x.vaultRef.name);
    assert.ok(names.length && names.every((x) => x === 'Base plate.mymech'), id);
  }
  assert.equal(JSON.parse(await alice.versionContent(joint.id, before.joint)).parts.find((x) => x.vaultRef.fileId === plate.id).vaultRef.name, 'Plate.mymech');
  await assert.rejects(alice.rename(plate.id, 'Bolt'), code('exists'));
});

test('copy tree makes new files that point at each other; a file left out keeps pointing at the original', async () => {
  const { alice } = await team();
  const { bolt, plate, joint } = await tree(alice);
  const all = await alice.copyTree(joint.id, { prefix: 'New ', suffix: '' });
  assert.deepEqual(all.files.map((f) => f.name).sort(), ['New Bolt.mymech', 'New Joint.mymech', 'New Plate.mymech']);
  const newJoint = all.files.find((f) => f.name === 'New Joint.mymech');
  assert.deepEqual(newJoint.refs.sort(), [all.map[bolt.id], all.map[plate.id]].sort());
  assert.deepEqual([newJoint.state, newJoint.version, newJoint.revision, newJoint.copiedFrom.id], ['wip', 1, 'A', joint.id]);
  const some = await alice.copyTree(joint.id, { include: [bolt.id], names: { [joint.id]: 'Joint B', [bolt.id]: 'Bolt B' } });
  const jb = some.files.find((f) => f.name === 'Joint B.mymech');
  assert.ok(jb.refs.includes(plate.id));
  assert.ok(jb.refs.includes(some.map[bolt.id]));
  const text = JSON.parse(await alice.latest(jb.id));
  assert.equal(text.parts.find((x) => x.vaultRef.fileId === some.map[bolt.id]).vaultRef.name, 'Bolt B.mymech');
  await assert.rejects(alice.copyTree(joint.id, { names: { [joint.id]: 'Joint B' } }), code('exists'));
});

// ───────────────────────── Pack and Go

test('Pack and Go collects the file and everything it uses, renames the references, adds a manifest; ZIP and folder', async () => {
  const { alice } = await team();
  const { frame, dwg, bolt } = await tree(alice);
  const pack = await alice.packAndGo(frame.id, { prefix: 'P-' });
  assert.deepEqual(pack.files.map((f) => f.name).sort(), ['P-Bolt.mymech', 'P-Frame.mymech', 'P-Joint.mymech', 'P-Plate.mymech']);
  for (const f of pack.files) {
    const p = JSON.parse(f.content);
    for (const d of [...p.parts, ...p.assemblies].filter((x) => x.vaultRef)) assert.ok(pack.files.some((x) => x.name === d.vaultRef.name), `${f.name} → ${d.vaultRef.name}`);
    assert.equal(p.vaultLink, undefined);
  }
  // packed files are resolved: the frame holds the joint's bolts as nested parts (it opens without the vault)
  const packedFrame = JSON.parse(pack.files.find((f) => f.name === 'P-Frame.mymech').content);
  assert.ok(packedFrame.parts.some((x) => x.vaultNested?.fileId === bolt.id && x.partNo === 'B-1'));
  assert.equal(pack.manifest.root, 'P-Frame.mymech');
  assert.equal(pack.manifest.files.length, 4);
  const withDrawings = await alice.packAndGo(frame.id, { includeDrawings: true });
  assert.ok(withDrawings.files.some((f) => f.fileId === dwg.id));
  const zip = makeZip(pack.entries);
  const back = readZip(zip);
  assert.deepEqual(back.map((e) => e.name).sort(), [...pack.files.map((f) => f.name), 'packandgo.json'].sort());
  assert.ok(back.every((e) => e.crcOk));
  assert.equal(back.find((e) => e.name === 'P-Joint.mymech').content, pack.files.find((f) => f.name === 'P-Joint.mymech').content);
  const out = path.join(folder(), 'packed');
  const written = await alice.store.exportFiles(out, pack.entries);
  assert.equal(written.length, 5);
  assert.deepEqual(fs.readdirSync(out).sort(), back.map((e) => e.name).sort());
  await assert.rejects(alice.store.exportFiles(out, pack.entries));
});

test('Pack and Go of the released version takes the content released, not later work', async () => {
  const { alice, bob } = await team();
  const f = await alice.addFile('Rel', partFile('Rel', { partNo: 'R-1', description: 'released' }));
  await alice.transition(f.id, 'submit');
  await bob.transition(f.id, 'approve');
  const eco = await alice.createChange('eco', { title: 'more', files: [f.id] });
  await alice.submitChange(eco.id);
  await bob.decideChange(eco.id, 'approve');
  await alice.transition(f.id, 'revise');
  await alice.checkOut(f.id);
  await alice.checkIn(f.id, partFile('Rel', { partNo: 'R-1', description: 'work in progress' }));
  const released = await alice.packAndGo(f.id, { version: 'released' });
  assert.equal(JSON.parse(released.files[0].content).parts[0].description, 'released');
  assert.deepEqual([released.files[0].revision, released.files[0].version], ['A', 1]);
  const latest = await alice.packAndGo(f.id);
  assert.equal(JSON.parse(latest.files[0].content).parts[0].description, 'work in progress');
});

test('the ZIP writer matches the standard CRC-32 and refuses names that climb out', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.throws(() => makeZip([{ name: '../x', content: '' }]));
  assert.equal(readZip(makeZip([{ name: '한글.mymech', content: '내용' }]))[0].name, '한글.mymech');
});

// ───────────────────────── search, BOM

test('search by part number, description, material, state, kind and free text', async () => {
  const { alice, bob } = await team();
  const { bolt, plate, frame } = await tree(alice);
  await alice.setCard(plate.id, { vendor: 'Acme Metals' });
  const names = (q) => alice.search(q).map((f) => f.name).sort();
  assert.deepEqual(names({ partNumber: 'b-1' }), ['Bolt.mymech']);
  assert.deepEqual(names({ material: 'alumin' }), ['Plate.mymech']);
  assert.deepEqual(names({ description: 'frame' }), ['Frame.mymech']);
  assert.deepEqual(names({ text: 'acme' }), ['Plate.mymech']);
  assert.deepEqual(names({ kind: 'drawing' }), ['Frame drawing.mymech']);
  await alice.transition(bolt.id, 'submit');
  await alice.refresh();
  assert.deepEqual(names({ state: 'pending' }), ['Bolt.mymech']);
  assert.deepEqual(names({ state: 'wip', text: 'f-1' }), ['Frame.mymech']);
  void bob; void frame;
});

test('BOM: indented with sub-assembly levels, and parts only with total quantities, part numbers from the vault', async () => {
  const { alice } = await team();
  const { frame, plate } = await tree(alice);
  await alice.setCard(plate.id, { partNumber: 'P-1-CARD' });
  const rows = await alice.bom(frame.id, { mode: 'indented' });
  assert.deepEqual(rows.map((r) => `${r.item}|${r.level}|${r.name}|${r.qty}`), ['1|0|Joint|2', '1.1|1|Plate|1', '1.2|1|Bolt|2', '2|0|Plate|1']);
  assert.equal(rows.find((r) => r.item === '1').partNumber, 'J-1');
  assert.equal(rows.find((r) => r.item === '1.1').partNumber, 'P-1-CARD');
  assert.equal(rows.find((r) => r.item === '1.2').file, 'Bolt.mymech');
  assert.equal(rows.find((r) => r.item === '1.2').revision, 'A');
  const parts = await alice.bom(frame.id, { mode: 'parts' });
  assert.deepEqual(parts.map((r) => `${r.name}:${r.qty}`).sort(), ['Bolt:4', 'Plate:3']);
});

// ───────────────────────── history, rollback, links

test('compare two versions of a file and roll back (a new version with the old content)', async () => {
  const { alice } = await team();
  const v1 = project('H', { parts: [part('p', 'H', { features: [{ id: 'f1', type: 'extrude', name: 'Boss' }] })] });
  const f = await alice.addFile('H', v1);
  await alice.checkOut(f.id);
  await alice.checkIn(f.id, project('H', { parts: [part('p', 'H', { features: [{ id: 'f1', type: 'extrude', name: 'Boss' }, { id: 'f2', type: 'fillet', name: 'Fillet1' }] })] }));
  const diff = await alice.compare(f.id, 1, 2);
  assert.deepEqual([diff.from, diff.to, diff.summary.changed], [1, 2, 1]);
  assert.deepEqual(diff.documents[0].features.added, ['Fillet1']);
  const r = await alice.rollback(f.id, 1);
  assert.equal(r.file.version, 3);
  assert.equal(r.file.versions.at(-1).hash, r.file.versions[0].hash);
  assert.equal(await alice.versionContent(f.id, 3), await alice.versionContent(f.id, 1));
  assert.equal(r.file.checkout, null);
  assert.equal(r.file.events.at(-1).type, 'rollback');
});

test('references are stored as stubs and resolved on reading; the document knows its own file', async () => {
  const { alice } = await team();
  const { joint, bolt } = await tree(alice);
  const stored = JSON.parse(await alice.latest(joint.id));
  assert.deepEqual(stored.vaultLink, { vaultId: alice.id, fileId: joint.id, name: 'Joint.mymech' });
  const boltStub = stored.parts.find((x) => x.vaultRef?.fileId === bolt.id);
  assert.deepEqual(Object.keys(boltStub).sort(), ['id', 'name', 'vaultRef']);
  assert.equal(stored.parts.some((x) => x.features), false);
  const resolved = await alice.resolvedProject(joint.id, alice.file(joint.id).version);
  const r = resolved.parts.find((x) => x.id === boltStub.id);
  assert.equal(r.partNo, 'B-1');
  assert.deepEqual(r.features, []);
  assert.equal(r.vaultRef.resolved.version, 1);
  // checking the resolved project in again stores the same text (no new version)
  await alice.checkOut(joint.id);
  const again = await alice.checkIn(joint.id, JSON.stringify(resolved));
  assert.equal(again.added, false);
  assert.equal(storedContent(JSON.stringify(resolved), stored.vaultLink), await alice.latest(joint.id));
});

test('a change in a part file reaches the top assembly through its sub-assembly: out of date, then updated', async () => {
  const { alice } = await team();
  const { frame, bolt, joint } = await tree(alice);
  const open = await alice.resolvedProject(frame.id, alice.file(frame.id).version);
  assert.equal(alice.linkStatus(open).filter((x) => x.outdated).length, 0);
  const nestedBolt = () => open.parts.find((x) => x.vaultNested?.fileId === bolt.id);
  assert.equal(nestedBolt().description, 'bolt');
  assert.equal(nestedBolt().vaultNested.owner, open.assemblies.find((a) => a.vaultRef?.fileId === joint.id).id);
  await alice.checkOut(bolt.id);
  await alice.checkIn(bolt.id, partFile('Bolt', { partNo: 'B-1', description: 'longer bolt' }));
  const st = alice.linkStatus(open);
  const js = st.find((x) => x.file.id === joint.id);
  assert.equal(js.outdated, true);
  assert.equal(js.resolved, js.target); // the joint file itself did not change
  assert.deepEqual(js.stale, ['Bolt.mymech']);
  const names = await alice.updateLinks(open);
  assert.deepEqual(names, ['Joint']);
  assert.equal(nestedBolt().description, 'longer bolt');
  assert.equal(open.parts.filter((x) => x.vaultNested?.fileId === bolt.id).length, 1);
  assert.equal(alice.linkStatus(open).filter((x) => x.outdated).length, 0);
  // the components of the sub-assembly still find their parts
  const sub = open.assemblies.find((a) => a.vaultRef?.fileId === joint.id);
  assert.ok(sub.components.every((c) => open.parts.some((p) => p.id === c.part)));
});

test('reference policies: latest, released and a fixed version', async () => {
  const { alice, bob } = await team();
  const pin = await alice.addFile('Pin', partFile('Pin', { partNo: 'PIN', description: 'v1' }));
  const use = JSON.parse(project('Use', { assemblies: [{ id: 'a', name: 'Use', components: [], mates: [] }] }));
  const latest = (await alice.link(use, pin.id, 'p-Pin')).doc;
  const fixed = (await alice.link(use, pin.id, 'p-Pin', { policy: 'version', version: 1 })).doc;
  await assert.rejects(alice.link(use, pin.id, 'p-Pin', { policy: 'released' }), code('missingVersion'));
  await alice.transition(pin.id, 'submit');
  await bob.transition(pin.id, 'approve');
  const released = (await alice.link(use, pin.id, 'p-Pin', { policy: 'released' })).doc;
  const eco = await alice.createChange('eco', { title: 'pin v2', files: [pin.id] });
  await alice.submitChange(eco.id);
  await bob.decideChange(eco.id, 'approve');
  await alice.transition(pin.id, 'revise');
  await alice.checkOut(pin.id);
  await alice.checkIn(pin.id, partFile('Pin', { partNo: 'PIN', description: 'v2' }));
  const st = Object.fromEntries(alice.linkStatus(use).map((x) => [x.doc.id, x]));
  assert.equal(st[latest.id].outdated, true);
  assert.equal(st[fixed.id].outdated, false);
  assert.equal(st[released.id].outdated, false);
  await alice.updateLinks(use);
  assert.deepEqual([latest.description, fixed.description, released.description], ['v2', 'v1', 'v1']);
  assert.deepEqual([latest.vaultRef.resolved.revision, released.vaultRef.resolved.revision], ['B', 'A']);
});

test('the test store refuses paths outside the vault and removes nothing but lock files', async () => {
  const store = nodeVaultStore(folder());
  await assert.rejects(store.read('../x'));
  await assert.rejects(store.write('a/../../x', ''));
  await store.write('files/a.mymech', 'x');
  await assert.rejects(store.removeLock('files/a.mymech'));
  assert.equal(await store.read('files/a.mymech'), 'x');
});

// ───────────────────────── working together

test('working together: activity of others since a time, what waits for an approver, discussions on files and changes', async () => {
  const { alice, bob, carol } = await team();
  const f = await alice.addFile('Bracket', partFile('Bracket'));
  await alice.setCard(f.id, ready);
  await bob.refresh();
  const seen = bob.now();
  await new Promise((r) => setTimeout(r, 5));
  await alice.transition(f.id, 'submit', { comment: 'please check' });
  const eco = await alice.createChange('ecr', { title: 'Thicker flange', files: [f.id] });
  await carol.refresh();
  await carol.comment(f.id, 'Edge too sharp?');
  await bob.refresh();
  const news = bob.activity({ since: seen, others: true });
  assert.deepEqual(news.map((e) => e.type ?? e.action).sort(), ['comment', 'create', 'transition']);
  assert.ok(news.every((e) => e.by !== 'bob'));
  assert.equal(news.find((e) => e.kind === 'change').number, eco.number);
  // Bob (approver) has the pending file and the open request; Alice (editor, the author) has neither to decide.
  const w = bob.awaitingMe();
  assert.deepEqual(w.files.map((x) => x.id), [f.id]);
  assert.deepEqual(w.changes.map((c) => c.id), [eco.id]);
  await alice.refresh();
  assert.equal(alice.awaitingMe().changes.length, 0);
  // Discussions: the file keeps its thread; a change takes comments into its log.
  await bob.comment(f.id, 'Fine as is');
  await bob.comment(eco.id, 'Needs a drawing');
  await alice.refresh();
  assert.deepEqual(alice.comments(f.id).map((c) => [c.by, c.text]), [['carol', 'Edge too sharp?'], ['bob', 'Fine as is']]);
  assert.equal(alice.change(eco.id).log.at(-1).comment, 'Needs a drawing');
  await assert.rejects(bob.comment(f.id, '  '), code('noComment'));
  // Deciding takes it off the list.
  await bob.decideChange(eco.id, 'approve');
  assert.equal(bob.awaitingMe().changes.length, 0);
});
