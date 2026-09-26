'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const { PointerWatch } = require('../src/main/pointer-watch');

/** The interactive region the dock reports, in window-local coordinates. */
const PLATE = { x: 100, y: 40, width: 200, height: 60 };

let sent;

/** A dock window that only remembers what it was told. */
function fakeDock() {
  return {
    alive: () => true,
    hidden: false,
    sliding: () => false,
    hotRect: () => null,
    win: {
      isVisible: () => true,
      getBounds: () => ({ x: 0, y: 0, width: 400, height: 120 }),
      setIgnoreMouseEvents: () => {},
    },
    send: (channel, payload) => sent.push({ channel, payload }),
  };
}

function watcher() {
  const watch = new PointerWatch(fakeDock());
  watch.rect = PLATE;
  return watch;
}

const pointers = () => sent.filter((m) => m.channel === 'dock:pointer').map((m) => m.payload);

beforeEach(() => { sent = []; });

describe('telling the dock the pointer has left', () => {
  it('says so as soon as the pointer is off the plate', () => {
    // The dock is made click-through the moment the pointer leaves, and a
    // click-through window stops being sent mouse messages - including the
    // `mouseleave` it was waiting for. Whichever lands first is a race, so the
    // dock is told outright rather than left magnified around nothing.
    const watch = watcher();
    watch.feed({ x: 10, y: 10 }, false);
    assert.deepStrictEqual(pointers(), [null]);
  });

  it('stays silent while the pointer is on the plate', () => {
    // Real mouse events are arriving; they know more than this poll does.
    const watch = watcher();
    watch.feed({ x: 150, y: 60 }, false);
    assert.deepStrictEqual(pointers(), []);
  });

  it('repeats it over the next few polls, then falls silent', () => {
    // The dock is being sent real mouse events too, and Chromium can deliver
    // one it coalesced earlier *after* this message - putting the dock back
    // under a pointer that has gone, where nothing would arrive to correct it.
    // Saying it more than once leaves the last word here.
    const watch = watcher();
    for (let i = 0; i < 10; i += 1) watch.feed({ x: 10 + i, y: 10 }, false);
    const said = pointers();
    assert.ok(said.length > 1 && said.length < 10, `sent ${said.length} times`);
    assert.ok(said.every((p) => p === null));
  });

  it('starts counting the repeats afresh each time the pointer leaves', () => {
    const watch = watcher();
    for (let i = 0; i < 10; i += 1) watch.feed({ x: 10, y: 10 }, false);
    const first = pointers().length;
    watch.feed({ x: 150, y: 60 }, false);   // back over the dock
    for (let i = 0; i < 10; i += 1) watch.feed({ x: 10, y: 10 }, false);
    assert.strictEqual(pointers().length, first * 2);
  });

  it('says it again after the pointer has been back on the plate', () => {
    const watch = watcher();
    watch.feed({ x: 10, y: 10 }, false);
    watch.feed({ x: 150, y: 60 }, false);   // back over the dock
    watch.feed({ x: 10, y: 10 }, false);
    assert.deepStrictEqual(pointers(), [null, null]);
  });

  it('treats a pointer it cannot place as away', () => {
    const watch = watcher();
    watch.feed(null, false);
    assert.deepStrictEqual(pointers(), [null]);
  });

  it('treats every pointer as away while the dock has reported no plate yet', () => {
    const watch = new PointerWatch(fakeDock());
    watch.feed({ x: 150, y: 60 }, true);
    assert.deepStrictEqual(pointers(), [null]);
  });
});

describe('feeding the pointer while a menu holds the mouse', () => {
  it('follows it across the plate', () => {
    const watch = watcher();
    watch.menuOpen = true;
    watch.feed({ x: 150, y: 60 }, true);
    assert.deepStrictEqual(pointers(), [{ x: 150, y: 60, quiet: true }]);
  });

  it('still reports it leaving', () => {
    const watch = watcher();
    watch.menuOpen = true;
    watch.feed({ x: 150, y: 60 }, true);
    watch.feed({ x: 10, y: 10 }, true);
    assert.deepStrictEqual(pointers(), [{ x: 150, y: 60, quiet: true }, null]);
  });

  it('repeats nothing while the pointer is still', () => {
    const watch = watcher();
    watch.menuOpen = true;
    for (let i = 0; i < 5; i += 1) watch.feed({ x: 150, y: 60 }, true);
    assert.strictEqual(pointers().length, 1);
  });

  it('asks for the name to be kept hidden', () => {
    // A tooltip floating beside an open context menu helps nobody.
    const watch = watcher();
    watch.menuOpen = true;
    watch.feed({ x: 150, y: 60 }, true);
    assert.strictEqual(pointers()[0].quiet, true);
  });

  it('asks for the name back once the menu has gone', () => {
    const watch = watcher();
    watch.feed({ x: 150, y: 60 }, true);
    assert.strictEqual(pointers()[0].quiet, false);
  });

  it('rounds to whole pixels, so a still pointer never jitters', () => {
    const watch = watcher();
    watch.menuOpen = true;
    watch.feed({ x: 150.2, y: 60.4 }, true);
    watch.feed({ x: 150.4, y: 60.1 }, true);
    assert.deepStrictEqual(pointers(), [{ x: 150, y: 60, quiet: true }]);
  });

  it('counts the plate\'s far edge as outside it', () => {
    const watch = watcher();
    watch.menuOpen = true;
    watch.feed({ x: PLATE.x + PLATE.width, y: 60 }, true);
    assert.deepStrictEqual(pointers(), [null]);
  });

  it('counts the plate\'s near edge as inside it', () => {
    const watch = watcher();
    watch.menuOpen = true;
    watch.feed({ x: PLATE.x, y: PLATE.y }, true);
    assert.deepStrictEqual(pointers(), [{ x: PLATE.x, y: PLATE.y, quiet: true }]);
  });
});
