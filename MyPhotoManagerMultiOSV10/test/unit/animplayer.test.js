// Animated pictures: the GIF decoder used when the engine has no ImageDecoder, and the player.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeGif } from '../../src/create/gif.js';
import { createAnimPlayer, decodeGif } from '../../src/ui/animplayer.js';

const image = (w, h, fill) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
};

test('decodeGif gives back every frame of an animated GIF, pixels and delays', () => {
  // Few colours per frame, so the encoder keeps them exactly.
  const frames = [
    image(37, 23, (x, y) => ((x + y) % 2 ? [255, 0, 0] : [0, 0, 255])),
    image(37, 23, (x) => (x < 18 ? [0, 200, 0] : [10, 20, 30])),
    image(37, 23, (x, y) => [(x * 7) & 0xf0, (y * 11) & 0xf0, 128]),
  ];
  const gif = encodeGif([{ image: frames[0], delay: 250 }, { image: frames[1] }, { image: frames[2], delay: 40 }], { delay: 70 });
  const decoded = decodeGif(gif);
  assert.equal(decoded.width, 37);
  assert.equal(decoded.height, 23);
  assert.deepEqual(decoded.frames.map((f) => f.delay), [250, 70, 40]);
  for (const [i, frame] of decoded.frames.entries()) assert.deepEqual([...frame.pixels], [...frames[i].data], `frame ${i}`);
  // A shared palette decodes the same.
  const global = decodeGif(encodeGif(frames.slice(0, 2).map((img) => ({ image: img })), { palette: 'global' })); // (frame 3 alone has too many colours to share a table exactly)
  for (const [i, frame] of global.frames.entries()) assert.deepEqual([...frame.pixels], [...frames[i].data], `global palette frame ${i}`);
});

test('decodeGif rejects what is not a GIF', () => {
  assert.equal(decodeGif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0])), null);
});

test('the player plays, pauses, stops on the first frame and steps', async () => {
  const drawn = [];
  const source = { width: 1, height: 1, count: 4, draw: async (i) => { drawn.push(i); return 15; }, close() {} };
  const canvas = { isConnected: true, getContext: () => ({}) };
  let changes = 0;
  const player = createAnimPlayer(canvas, source, { onChange: () => { changes += 1; } });
  player.play();
  assert.equal(player.playing, true);
  await new Promise((r) => setTimeout(r, 120));
  player.pause();
  assert.equal(player.playing, false);
  assert.ok(drawn.length >= 4, `advanced: ${drawn}`);
  const at = player.frame;
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(player.frame, at, 'stays paused');
  await player.stop();
  assert.equal(player.frame, 0, 'stop shows the first frame');
  await player.step(-1);
  assert.equal(player.frame, 3, 'step wraps around');
  await player.step(1);
  assert.equal(player.frame, 0);
  assert.ok(changes > 0);
  player.destroy();
});
