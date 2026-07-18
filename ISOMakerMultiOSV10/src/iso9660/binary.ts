export const SECTOR = 2048

export async function readBytes(
  blob: Blob,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  if (length <= 0) return new Uint8Array(0)
  const end = Math.min(blob.size, offset + length)
  if (offset >= blob.size) {
    throw new Error(
      `ISO 읽기 범위 초과 (요청 offset ${offset}, ISO 크기 ${blob.size}). 파일이 잘렸거나 손상되었을 수 있습니다.`,
    )
  }
  const buf = await blob.slice(offset, end).arrayBuffer()
  return new Uint8Array(buf)
}

export async function readSector(blob: Blob, lba: number): Promise<Uint8Array> {
  return readBytes(blob, lba * SECTOR, SECTOR)
}

export function readU8(view: DataView, offset: number): number {
  return view.getUint8(offset)
}

export function readU16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

export function readU32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

/** Read ISO9660 both-endian U32 (LE at offset, BE at offset+4). Prefers LE when equal. */
export function readBothU32(view: DataView, offset: number): number {
  const le = view.getUint32(offset, true)
  const be = view.getUint32(offset + 4, false)
  return le === be ? le : le
}

/**
 * Read both-endian U32 and pick a value that passes `isValid`.
 * When LE/BE disagree (corrupt or adversarial images), prefer a valid side.
 */
export function readBothU32Pick(
  view: DataView,
  offset: number,
  isValid: (n: number) => boolean,
): number {
  const le = view.getUint32(offset, true)
  const be = view.getUint32(offset + 4, false)
  if (le === be) return le
  const leOk = isValid(le)
  const beOk = isValid(be)
  if (leOk && !beOk) return le
  if (beOk && !leOk) return be
  return le
}

export function decodeAscii(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out.trimEnd()
}

export function decodeJoliet(bytes: Uint8Array): string {
  const len = bytes.length - (bytes.length % 2)
  const units: number[] = []
  for (let i = 0; i < len; i += 2) {
    const code = (bytes[i]! << 8) | bytes[i + 1]!
    if (code === 0) break
    units.push(code)
  }
  return String.fromCharCode(...units).replace(/\0+$/g, '')
}

export function stripVersion(name: string): string {
  const cut = name.indexOf(';')
  return cut >= 0 ? name.slice(0, cut) : name
}

export function writeU8(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff
}

export function writeU16LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
}

export function writeU16BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 8) & 0xff
  buf[offset + 1] = value & 0xff
}

export function writeBothU16(buf: Uint8Array, offset: number, value: number): void {
  writeU16LE(buf, offset, value)
  writeU16BE(buf, offset + 2, value)
}

export function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff
  buf[offset + 1] = (value >>> 8) & 0xff
  buf[offset + 2] = (value >>> 16) & 0xff
  buf[offset + 3] = (value >>> 24) & 0xff
}

export function writeU32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff
  buf[offset + 1] = (value >>> 16) & 0xff
  buf[offset + 2] = (value >>> 8) & 0xff
  buf[offset + 3] = value & 0xff
}

export function writeBothU32(buf: Uint8Array, offset: number, value: number): void {
  writeU32LE(buf, offset, value)
  writeU32BE(buf, offset + 4, value)
}

export function encodeAsciiPadded(text: string, length: number, pad = 0x20): Uint8Array {
  const out = new Uint8Array(length)
  out.fill(pad)
  const upper = text.toUpperCase()
  for (let i = 0; i < Math.min(upper.length, length); i++) {
    out[i] = upper.charCodeAt(i) & 0x7f
  }
  return out
}

export function encodeJolietName(name: string): Uint8Array {
  const out = new Uint8Array(name.length * 2)
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    out[i * 2] = (code >>> 8) & 0xff
    out[i * 2 + 1] = code & 0xff
  }
  return out
}

export function iso9660FileId(name: string, isDir: boolean): Uint8Array {
  if (isDir) {
    const upper = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 31)
    return encodeAsciiPadded(upper, upper.length, 0)
  }
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9_.]/g, '_')
  const dot = cleaned.lastIndexOf('.')
  let base = cleaned
  let ext = ''
  if (dot > 0) {
    base = cleaned.slice(0, dot)
    ext = cleaned.slice(dot + 1)
  }
  base = base.slice(0, 8)
  ext = ext.slice(0, 3)
  const id = ext ? `${base}.${ext};1` : `${base}.;1`
  const bytes = new Uint8Array(id.length)
  for (let i = 0; i < id.length; i++) bytes[i] = id.charCodeAt(i)
  return bytes
}
