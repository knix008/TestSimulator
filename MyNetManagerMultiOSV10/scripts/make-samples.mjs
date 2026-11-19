// Writes every sample capture to samples/<id>.pcapng (npm run samples).
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES } from '../src/domain/capture/samples.js';
import { writePcapng } from '../src/domain/capture/pcap.js';

const dir = path.join(import.meta.dirname, '..', 'samples');
fs.mkdirSync(dir, { recursive: true });
const keep = new Set();
for (const s of SAMPLES) {
  const file = s.build();
  const bytes = writePcapng(file);
  const name = `${s.id}.pcapng`;
  keep.add(name);
  fs.writeFileSync(path.join(dir, name), bytes);
  console.log(`${name.padEnd(36)} ${String(file.frames.length).padStart(5)} frames ${String(bytes.length).padStart(9)} bytes  [${s.group}] ${s.en[0]}`);
}
// Remove captures of samples that no longer exist.
for (const f of fs.readdirSync(dir)) if (f.endsWith('.pcapng') && !keep.has(f)) fs.rmSync(path.join(dir, f));
console.log(`${SAMPLES.length} samples written to ${dir}`);
