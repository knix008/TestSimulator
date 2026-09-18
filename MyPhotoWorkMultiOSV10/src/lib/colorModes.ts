import { clamp } from './color'
import { context2d } from './canvas'
import type { ColorMode } from './types'

/**
 * Colour spaces and colour management.
 *
 * Three jobs live here. Converting between RGB, CMYK and Lab, which is exact
 * arithmetic and needs no profile. Carrying a document between RGB working
 * spaces, which does: a matrix and a tone curve per profile. And reading an ICC
 * profile out of a file, so a photo tagged Adobe RGB opens looking right rather
 * than flat.
 *
 * Only matrix-shaper RGB profiles are read — the kind every camera and monitor
 * space is. Lookup-table profiles (most CMYK ones) are named but not applied,
 * and the built-in CMYK conversion is used instead.
 */

/* ------------------------------------------------------------ transfer */

export function srgbToLinear(value: number) {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(value: number) {
  const v = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
  return clamp(v * 255, 0, 255)
}

/* ---------------------------------------------------------------- Lab */

// D65, the white point every space here is measured against.
const white = { x: 0.95047, y: 1, z: 1.08883 }

export function rgbToXyz(r: number, g: number, b: number) {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  return {
    x: lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375,
    y: lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750,
    z: lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041,
  }
}

export function xyzToRgb(x: number, y: number, z: number) {
  return {
    r: linearToSrgb(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    g: linearToSrgb(x * -0.9692660 + y * 1.8760108 + z * 0.0415560),
    b: linearToSrgb(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  }
}

function labF(t: number) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function labFInverse(t: number) {
  const cube = t * t * t
  return cube > 0.008856 ? cube : (t - 16 / 116) / 7.787
}

/** L runs 0..100; a and b run about -128..127. */
export function rgbToLab(r: number, g: number, b: number) {
  const xyz = rgbToXyz(r, g, b)
  const fx = labF(xyz.x / white.x)
  const fy = labF(xyz.y / white.y)
  const fz = labF(xyz.z / white.z)
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToRgb(l: number, a: number, b: number) {
  const fy = (l + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  return xyzToRgb(labFInverse(fx) * white.x, labFInverse(fy) * white.y, labFInverse(fz) * white.z)
}

/* --------------------------------------------------------------- CMYK */

export function rgbToCmyk(r: number, g: number, b: number) {
  const c = 1 - r / 255
  const m = 1 - g / 255
  const y = 1 - b / 255
  const k = Math.min(c, m, y)
  if (k >= 1) {
    return { c: 0, m: 0, y: 0, k: 1 }
  }
  return { c: (c - k) / (1 - k), m: (m - k) / (1 - k), y: (y - k) / (1 - k), k }
}

export function cmykToRgb(c: number, m: number, y: number, k: number) {
  return {
    r: clamp(255 * (1 - Math.min(1, c * (1 - k) + k)), 0, 255),
    g: clamp(255 * (1 - Math.min(1, m * (1 - k) + k)), 0, 255),
    b: clamp(255 * (1 - Math.min(1, y * (1 - k) + k)), 0, 255),
  }
}

/* ------------------------------------------------------------- profiles */

/** A matrix-shaper RGB space: primaries in XYZ, and one gamma for all three. */
export type RgbProfile = {
  name: string
  /** Column-major XYZ for red, green and blue at full strength. */
  matrix: number[]
  gamma: number
}

/** The working spaces offered by name, as every editor offers them. */
export const builtInProfiles: Record<string, RgbProfile> = {
  srgb: {
    name: 'sRGB',
    matrix: [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.0721750, 0.0193339, 0.1191920, 0.9503041],
    // sRGB's curve is not a pure power, but 2.2 is within a rounding of it and
    // is what the profile's own gamma tag reports.
    gamma: 2.2,
  },
  adobeRgb: {
    name: 'Adobe RGB (1998)',
    matrix: [0.5767309, 0.1855540, 0.1881852, 0.2973769, 0.6273491, 0.0752741, 0.0270343, 0.0706872, 0.9911085],
    gamma: 2.19921875,
  },
  displayP3: {
    name: 'Display P3',
    matrix: [0.4865709, 0.2656677, 0.1982173, 0.2289746, 0.6917385, 0.0792869, 0.0000000, 0.0451134, 1.0439444],
    gamma: 2.2,
  },
  proPhoto: {
    name: 'ProPhoto RGB',
    matrix: [0.7976749, 0.1351917, 0.0313534, 0.2880402, 0.7118741, 0.0000857, 0.0000000, 0.0000000, 0.8252100],
    gamma: 1.8,
  },
}

function multiply(matrix: number[], r: number, g: number, b: number) {
  return {
    x: matrix[0] * r + matrix[1] * g + matrix[2] * b,
    y: matrix[3] * r + matrix[4] * g + matrix[5] * b,
    z: matrix[6] * r + matrix[7] * g + matrix[8] * b,
  }
}

function invert3(m: number[]) {
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  if (Math.abs(det) < 1e-12) {
    return null
  }
  return [
    (m[4] * m[8] - m[5] * m[7]) / det, (m[2] * m[7] - m[1] * m[8]) / det, (m[1] * m[5] - m[2] * m[4]) / det,
    (m[5] * m[6] - m[3] * m[8]) / det, (m[0] * m[8] - m[2] * m[6]) / det, (m[2] * m[3] - m[0] * m[5]) / det,
    (m[3] * m[7] - m[4] * m[6]) / det, (m[1] * m[6] - m[0] * m[7]) / det, (m[0] * m[4] - m[1] * m[3]) / det,
  ]
}

/**
 * Re-reads the pixels as if they were written in `from` and writes them in
 * `to`: decode the tone curve, move through XYZ, encode the other curve. This
 * is what stops an Adobe RGB photo looking washed out on an sRGB screen.
 */
export function convertProfile(canvas: HTMLCanvasElement, from: RgbProfile, to: RgbProfile) {
  const inverse = invert3(to.matrix)
  if (!inverse || from === to) {
    return
  }
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.pow(data[i] / 255, from.gamma)
    const g = Math.pow(data[i + 1] / 255, from.gamma)
    const b = Math.pow(data[i + 2] / 255, from.gamma)
    const xyz = multiply(from.matrix, r, g, b)
    const out = multiply(inverse, xyz.x, xyz.y, xyz.z)
    data[i] = clamp(Math.pow(Math.max(0, out.x), 1 / to.gamma) * 255, 0, 255)
    data[i + 1] = clamp(Math.pow(Math.max(0, out.y), 1 / to.gamma) * 255, 0, 255)
    data[i + 2] = clamp(Math.pow(Math.max(0, out.z), 1 / to.gamma) * 255, 0, 255)
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------------- reading a profile */

function readUint32(bytes: Uint8Array, at: number) {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
}

function readSignature(bytes: Uint8Array, at: number) {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])
}

/** s15Fixed16: the fixed-point number ICC stores its matrix entries in. */
function readS15(bytes: Uint8Array, at: number) {
  const raw = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]
  return raw / 65536
}

/**
 * Pulls a matrix-shaper profile out of ICC bytes.
 *
 * The three colourant tags give the primaries; the red tone curve gives the
 * gamma, which for these profiles is either a single number or a table whose
 * midpoint is close enough to read a gamma off. A profile with neither is not
 * one this can apply, so null comes back and the caller falls back to sRGB.
 */
export function parseIccProfile(bytes: Uint8Array): RgbProfile | null {
  if (bytes.length < 132) {
    return null
  }
  const tagCount = readUint32(bytes, 128)
  if (tagCount > 200) {
    return null
  }
  const tags = new Map<string, { offset: number; size: number }>()
  for (let i = 0; i < tagCount; i += 1) {
    const at = 132 + i * 12
    if (at + 12 > bytes.length) return null
    tags.set(readSignature(bytes, at), { offset: readUint32(bytes, at + 4), size: readUint32(bytes, at + 8) })
  }

  const colourant = (signature: string) => {
    const tag = tags.get(signature)
    if (!tag || tag.offset + 20 > bytes.length || readSignature(bytes, tag.offset) !== 'XYZ ') {
      return null
    }
    return [readS15(bytes, tag.offset + 8), readS15(bytes, tag.offset + 12), readS15(bytes, tag.offset + 16)]
  }
  const red = colourant('rXYZ')
  const green = colourant('gXYZ')
  const blue = colourant('bXYZ')
  if (!red || !green || !blue) {
    return null
  }

  let gamma = 2.2
  const trc = tags.get('rTRC')
  if (trc && trc.offset + 12 <= bytes.length && readSignature(bytes, trc.offset) === 'curv') {
    const count = readUint32(bytes, trc.offset + 8)
    if (count === 1) {
      // u8Fixed8: the whole curve is one gamma number.
      gamma = ((bytes[trc.offset + 12] << 8) | bytes[trc.offset + 13]) / 256
    } else if (count > 1 && trc.offset + 12 + count * 2 <= bytes.length) {
      const middle = trc.offset + 12 + (count >> 1) * 2
      const value = ((bytes[middle] << 8) | bytes[middle + 1]) / 65535
      if (value > 0 && value < 1) {
        gamma = Math.log(value) / Math.log(0.5)
      }
    }
  }

  const description = tags.get('desc')
  let name = 'Embedded profile'
  if (description && description.offset + 12 < bytes.length) {
    const length = readUint32(bytes, description.offset + 8)
    let text = ''
    for (let i = 0; i < Math.min(length, 60); i += 1) {
      const code = bytes[description.offset + 12 + i]
      if (!code) break
      text += String.fromCharCode(code)
    }
    if (text.trim()) name = text.trim()
  }

  return {
    name,
    matrix: [red[0], green[0], blue[0], red[1], green[1], blue[1], red[2], green[2], blue[2]],
    gamma: clamp(gamma, 1, 3),
  }
}

/** Finds the ICC profile a JPEG carries, reassembling it if it was split up. */
export function iccFromJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null
  }
  const chunks: Uint8Array[] = []
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break
    const marker = bytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) break
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (size < 2) break
    // APP2, tagged "ICC_PROFILE\0", then a chunk number and count.
    if (marker === 0xe2 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 15)) === 'ICC_PROFILE') {
      chunks.push(bytes.subarray(offset + 18, offset + 2 + size))
    }
    offset += 2 + size
  }
  if (!chunks.length) {
    return null
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const profile = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    profile.set(chunk, at)
    at += chunk.length
  }
  return profile
}

/* ------------------------------------------------------------ colour modes */

/**
 * What a document looks like in a mode other than RGB.
 *
 * Greyscale drops the colour; CMYK shows what the four inks can reproduce,
 * which clips the brightest greens and blues; Lab is a round trip and should
 * leave the picture alone, which is what makes it a good check on the maths.
 */
export function applyColorMode(canvas: HTMLCanvasElement, mode: ColorMode) {
  if (mode === 'rgb') {
    return
  }
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    if (mode === 'gray') {
      const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
    } else if (mode === 'cmyk') {
      const ink = rgbToCmyk(data[i], data[i + 1], data[i + 2])
      const back = cmykToRgb(ink.c, ink.m, ink.y, ink.k)
      data[i] = back.r
      data[i + 1] = back.g
      data[i + 2] = back.b
    } else {
      const lab = rgbToLab(data[i], data[i + 1], data[i + 2])
      const back = labToRgb(lab.l, lab.a, lab.b)
      data[i] = back.r
      data[i + 1] = back.g
      data[i + 2] = back.b
    }
  }
  ctx.putImageData(image, 0, 0)
}
