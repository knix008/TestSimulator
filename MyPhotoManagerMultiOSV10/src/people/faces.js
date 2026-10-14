// People: face detection and recognition, fully offline.
// face-api (TensorFlow.js) with the SSD MobileNet v1 detector, 68-point
// landmarks and the 128-number face descriptor. Weights ship with the app
// (public/models/face, see scripts/vendor-assets.mjs). A face belongs to a
// person when its descriptor is close to one the user already named.

let loading = null;

async function load() {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      try {
        await faceapi.tf.setBackend('webgl');
      } catch {
        await faceapi.tf.setBackend('cpu');
      }
      await faceapi.tf.ready();
      const base = new URL('./models/face/', document.baseURI).href;
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(base),
        faceapi.nets.faceLandmark68Net.loadFromUri(base),
        faceapi.nets.faceRecognitionNet.loadFromUri(base),
      ]);
      return faceapi;
    })().catch((error) => { loading = null; throw error; });
  }
  return loading;
}

export const preloadFaces = () => load();

/** Distance below which two descriptors are treated as the same person. */
export const SAME_PERSON = 0.5;

/**
 * Faces in a picture (canvas / ImageBitmap / img): [{ box: { x, y, w, h } as
 * fractions of the picture, descriptor: number[128], score }].
 */
export async function detectFaces(source, { minConfidence = 0.5, maxSize = 1280 } = {}) {
  const faceapi = await load();
  const width = source.naturalWidth ?? source.width;
  const height = source.naturalHeight ?? source.height;
  const k = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * k));
  canvas.height = Math.max(1, Math.round(height * k));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  const results = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence })).withFaceLandmarks().withFaceDescriptors();
  return results.map((result) => {
    const box = result.detection.box;
    return {
      box: { x: box.x / canvas.width, y: box.y / canvas.height, w: box.width / canvas.width, h: box.height / canvas.height },
      descriptor: Array.from(result.descriptor, (v) => Math.round(v * 10000) / 10000),
      score: Math.round(result.detection.score * 1000) / 1000,
      person: null,
    };
  });
}

export function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/**
 * Best named person for a descriptor among `known` ([{ person, descriptor }]):
 * { person, distance } or null when nobody is close enough.
 */
export function suggestPerson(descriptor, known, threshold = SAME_PERSON) {
  if (!descriptor) return null;
  let best = null;
  for (const entry of known) {
    if (!entry.descriptor) continue;
    const d = distance(descriptor, entry.descriptor);
    if (d < threshold && (!best || d < best.distance)) best = { person: entry.person, distance: d };
  }
  return best;
}

/** Named faces of the whole catalog, for suggestions. */
export function knownFaces(catalog) {
  const out = [];
  for (const record of catalog.files.values()) for (const face of record.faces ?? []) if (face.person && face.descriptor) out.push({ person: face.person, descriptor: face.descriptor });
  return out;
}
