// Microphone input: device choice, input gain, level metering and a short
// record-and-play test. The recorder uses the same chain, so what the meter
// shows is what ends up in the recording.
import { t } from '../i18n.js';

export function mediaErrorText(error, what) {
  const name = error?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return t('media.denied', { what });
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('media.notFound', { what });
  if (name === 'NotReadableError' || name === 'AbortError') return t('media.busy', { what });
  return t('media.failed', { what, error: error?.message ?? error });
}

/** Input devices. Labels are empty until microphone permission was granted once. */
export async function listMicrophones() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== 'communications')
    .map((device, index) => ({ id: device.deviceId, label: device.label || t('mic.deviceN', { n: index + 1 }) }));
}

/** Raw microphone stream. Processing is off: screen recordings want the voice as is. */
export async function openMicrophone(deviceId) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
  } catch (error) {
    // A remembered device that was unplugged: say so instead of a generic failure.
    if (deviceId && (error?.name === 'OverconstrainedError' || error?.name === 'NotFoundError')) {
      throw new Error(t('mic.deviceMissing'));
    }
    throw new Error(mediaErrorText(error, t('mic.name')));
  }
}

/** Gain in percent (0–200) → linear factor. */
export const gainFactor = (percent) => Math.min(2, Math.max(0, percent / 100));

/** Peak level of a time-domain buffer as 0..1, and the same in dBFS. */
export function measureLevel(samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  return { peak: Math.min(1, peak), db };
}

/** Meter position 0..1 for a dBFS value on a -60…0 dB scale. */
export const meterPosition = (db) => (Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0);

/**
 * Live microphone chain: source → gain → (analyser, output stream).
 * Used by the settings panel for metering/testing and by the recorder.
 */
export class MicrophoneChain {
  static async open(deviceId, gainPercent) {
    const chain = new MicrophoneChain();
    chain.raw = await openMicrophone(deviceId);
    chain.context = new AudioContext();
    chain.source = chain.context.createMediaStreamSource(chain.raw);
    chain.gain = chain.context.createGain();
    chain.gain.gain.value = gainFactor(gainPercent);
    chain.analyser = chain.context.createAnalyser();
    chain.analyser.fftSize = 2048;
    chain.destination = chain.context.createMediaStreamDestination();
    chain.source.connect(chain.gain);
    chain.gain.connect(chain.analyser);
    chain.gain.connect(chain.destination);
    chain.samples = new Float32Array(chain.analyser.fftSize);
    chain.label = chain.raw.getAudioTracks()[0]?.label ?? '';
    return chain;
  }

  /** The processed (gain-applied) audio track. */
  get track() {
    return this.destination.stream.getAudioTracks()[0];
  }

  setGain(percent) {
    this.gain.gain.setTargetAtTime(gainFactor(percent), this.context.currentTime, 0.02);
  }

  level() {
    this.analyser.getFloatTimeDomainData(this.samples);
    return measureLevel(this.samples);
  }

  /** Records `ms` of processed audio and returns an object URL to play it back. */
  async testRecording(ms = 3000) {
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    const recorder = new MediaRecorder(this.destination.stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.addEventListener('dataavailable', (event) => event.data.size && chunks.push(event.data));
    const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, ms));
    recorder.stop();
    await stopped;
    return URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
  }

  close() {
    this.raw?.getTracks().forEach((track) => track.stop());
    this.context?.close().catch(() => {});
  }
}
