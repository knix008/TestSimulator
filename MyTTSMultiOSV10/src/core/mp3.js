import fs from 'node:fs/promises';
import * as lame from '@breezystack/lamejs';

const { Mp3Encoder } = lame;

function floatToPcm16(input) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function createMp3Buffer(audioBuffer, sampleRate = 22050, bitrateKbps = 128) {
  const pcm = floatToPcm16(audioBuffer);
  const bitrate = Math.max(32, Math.min(320, Number(bitrateKbps) || 128));
  const encoder = new Mp3Encoder(1, sampleRate, bitrate);
  const frameSamples = 1152;
  const chunks = [];

  for (let index = 0; index < pcm.length; index += frameSamples) {
    const frame = pcm.subarray(index, index + frameSamples);
    const encoded = encoder.encodeBuffer(frame);
    if (encoded.length) chunks.push(Buffer.from(encoded));
  }

  const flush = encoder.flush();
  if (flush.length) chunks.push(Buffer.from(flush));

  return Buffer.concat(chunks);
}

export async function exportMp3File(filePath, audioBuffer, sampleRate = 22050, bitrateKbps = 128) {
  const mp3Buffer = createMp3Buffer(audioBuffer, sampleRate, bitrateKbps);
  await fs.writeFile(filePath, mp3Buffer);
  return {
    filePath,
    sampleRate,
    bitrateKbps: Math.max(32, Math.min(320, Number(bitrateKbps) || 128)),
    byteLength: mp3Buffer.byteLength,
  };
}
