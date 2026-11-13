import fs from 'node:fs/promises';

function floatToPcm16(input) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function createWavBuffer(audioBuffer, sampleRate = 22050) {
  const channelCount = 1;
  const pcm = floatToPcm16(audioBuffer);
  const dataSize = pcm.byteLength;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * 2, 28);
  buffer.writeUInt16LE(channelCount * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(pcm.buffer).copy(buffer, 44);

  return buffer;
}

export async function exportWavFile(filePath, audioBuffer, sampleRate = 22050) {
  const wavBuffer = createWavBuffer(audioBuffer, sampleRate);
  await fs.writeFile(filePath, wavBuffer);
  return { filePath, sampleRate, byteLength: wavBuffer.byteLength };
}
