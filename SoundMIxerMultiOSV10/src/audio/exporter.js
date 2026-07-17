import { getAcceptAttribute, isSupportedAudioFile } from './formats.js';

/**
 * Encode AudioBuffer to 16-bit PCM WAV.
 */
export function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const samples = interleave(buffer);
  const dataLength = samples.length * (bitDepth / 8);
  const headerLength = 44;
  const arrayBuffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  floatTo16BitPCM(view, 44, samples);
  return arrayBuffer;
}

function interleave(buffer) {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const length = left.length + right.length;
  const result = new Float32Array(length);
  let index = 0;
  for (let i = 0; i < left.length; i++) {
    result[index++] = left[i];
    result[index++] = right[i];
  }
  return result;
}

function floatTo16BitPCM(view, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function saveAudioBuffer(arrayBuffer, filename = 'export.wav', preferredExtension = 'wav') {
  if (window.electronAPI?.isElectron) {
    const result = await window.electronAPI.saveAudioFile({
      defaultName: filename,
      extension: preferredExtension || 'wav',
      data: arrayBuffer
    });
    return result;
  }

  // Web fallback currently exports WAV data only.
  const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, path: filename };
}

export async function saveWav(arrayBuffer, filename = 'export.wav') {
  return saveAudioBuffer(arrayBuffer, filename, 'wav');
}

export async function openAudioFilesWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = getAcceptAttribute();
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      const result = [];
      for (const file of files) {
        if (!isSupportedAudioFile(file)) continue;
        const buffer = await file.arrayBuffer();
        result.push({ name: file.name, path: file.name, buffer, mime: file.type || '' });
      }
      resolve(result);
    };
    input.click();
  });
}
