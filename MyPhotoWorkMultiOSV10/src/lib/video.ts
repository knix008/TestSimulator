import { context2d, createCanvas } from './canvas'

/**
 * Video in and out.
 *
 * In: a file is played through a hidden `<video>`, seeked to evenly spaced
 * times and drawn onto a canvas, which turns it into the frames a timeline can
 * hold. Out: the frames are played onto a canvas whose stream a MediaRecorder
 * writes, which is the only way a browser will write a video file.
 *
 * Both depend on what the browser has, so both check first and say plainly
 * when it is missing rather than failing somewhere deeper.
 */

export type VideoFrame = { canvas: HTMLCanvasElement; timeMs: number }

export function canImportVideo() {
  return typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
}

export function canExportVideo() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

/** Seeks to one time and waits until that frame is actually on screen. */
function seekTo(video: HTMLVideoElement, seconds: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', failed)
      resolve()
    }
    const failed = () => {
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', failed)
      reject(new Error('The video could not be read'))
    }
    video.addEventListener('seeked', done)
    video.addEventListener('error', failed)
    video.currentTime = seconds
  })
}

/**
 * Pulls `count` frames out of a video file, evenly spaced across it.
 *
 * Seeking rather than playing is deliberate: it is exact, it does not depend on
 * the machine keeping up, and it works the same whether the file is two seconds
 * or two hours long.
 */
export async function extractVideoFrames(file: Blob, count = 12, maxSide = 1280): Promise<VideoFrame[]> {
  if (!canImportVideo()) {
    throw new Error('This build cannot read video files')
  }
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('The video could not be opened')), { once: true })
    })
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (!duration) {
      throw new Error('The video has no length to sample')
    }
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
    const width = Math.max(1, Math.round(video.videoWidth * scale))
    const height = Math.max(1, Math.round(video.videoHeight * scale))

    const frames: VideoFrame[] = []
    for (let i = 0; i < count; i += 1) {
      // Half a step in, so the first frame is not the black one many files open on.
      const seconds = (duration * (i + 0.5)) / count
      await seekTo(video, seconds)
      const canvas = createCanvas(width, height)
      context2d(canvas).drawImage(video, 0, 0, width, height)
      frames.push({ canvas, timeMs: seconds * 1000 })
    }
    return frames
  } finally {
    video.src = ''
    URL.revokeObjectURL(url)
  }
}

/**
 * Writes the frames out as a video, by drawing them onto a canvas that a
 * MediaRecorder is watching. The recorder works in real time, so this takes as
 * long as the animation lasts — there is no faster path in a browser.
 */
export async function recordFrames(frames: { canvas: HTMLCanvasElement; delayMs: number }[], fps = 25): Promise<Blob> {
  if (!canExportVideo()) {
    throw new Error('This build cannot write video files')
  }
  if (!frames.length) {
    throw new Error('There are no frames to record')
  }
  const width = frames[0].canvas.width
  const height = frames[0].canvas.height
  const stage = createCanvas(width, height)
  const ctx = context2d(stage)
  const stream = (stage as HTMLCanvasElement).captureStream(fps)
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType: mime })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data)
  }
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }))
  })

  recorder.start()
  for (const frame of frames) {
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(frame.canvas, 0, 0)
    await new Promise((resolve) => setTimeout(resolve, Math.max(40, frame.delayMs)))
  }
  recorder.stop()
  return finished
}
