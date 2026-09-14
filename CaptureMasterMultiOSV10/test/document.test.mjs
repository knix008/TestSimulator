import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createImageDocument, isDirty, serializeCapture, parseCapture, kindForPath, nameOf, dirOf, stripExt, extOf, CAPTURE_FORMAT,
} from '../src/lib/document.js';
import { push } from '../src/lib/history.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('a new capture is dirty until saved; a parsed file is clean', () => {
  const doc = createImageDocument({ dataUrl: PNG, width: 10, height: 5 }, { name: 'shot' });
  assert.ok(isDirty(doc));
  doc.savedPresent = doc.history.present;
  assert.ok(!isDirty(doc));
  doc.history = push(doc.history, { ...doc.history.present, annotations: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 1, h: 1 }] });
  assert.ok(isDirty(doc));
});

test('.cmcap round trip keeps image, annotations and the numbering counter', () => {
  const doc = createImageDocument({ dataUrl: PNG, width: 10, height: 5 }, { name: 'shot', annotations: [{ id: 'a', type: 'number', x: 1, y: 1, n: 1 }] });
  doc.nextNumber = 2;
  const text = serializeCapture(doc);
  const json = JSON.parse(text);
  assert.equal(json.format, CAPTURE_FORMAT);
  const back = parseCapture(text, 'C:/x/shot.cmcap');
  assert.equal(back.name, 'shot');
  assert.equal(back.path, 'C:/x/shot.cmcap');
  assert.equal(back.dir, 'C:/x');
  assert.deepEqual(back.history.present.image, { dataUrl: PNG, width: 10, height: 5 });
  assert.equal(back.history.present.annotations.length, 1);
  assert.equal(back.nextNumber, 2);
  assert.ok(!isDirty(back));
});

test('parseCapture rejects foreign or broken files with a clear message', () => {
  assert.throws(() => parseCapture('{not json', 'a.cmcap'), /JSON/);
  assert.throws(() => parseCapture('{"format":"other"}', 'a.cmcap'), /Not a CaptureMaster/);
  assert.throws(() => parseCapture(JSON.stringify({ format: CAPTURE_FORMAT, version: 99, image: { dataUrl: PNG } }), 'a.cmcap'), /newer/);
  assert.throws(() => parseCapture(JSON.stringify({ format: CAPTURE_FORMAT, version: 1 }), 'a.cmcap'), /no image/);
});

test('path helpers handle both separators', () => {
  assert.equal(kindForPath('a/b.cmcap'), 'capture');
  assert.equal(kindForPath('a\\b.PNG'), 'image');
  assert.equal(kindForPath('a.webm'), 'video');
  assert.equal(kindForPath('a.txt'), null);
  assert.equal(nameOf('C:\\dir\\file.png'), 'file.png');
  assert.equal(dirOf('C:\\dir\\file.png'), 'C:\\dir');
  assert.equal(dirOf('/tmp/x.png'), '/tmp');
  assert.equal(stripExt('archive.tar.gz'), 'archive.tar');
  assert.equal(extOf('a/B.JPG'), 'jpg');
});
