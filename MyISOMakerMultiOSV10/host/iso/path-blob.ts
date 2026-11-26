import fs from 'node:fs'
import { openAsBlob } from 'node:fs'
import { Readable } from 'node:stream'

/** libuv / Node single-read ceiling; stay comfortably below it. */
const READ_CHUNK = 64 * 1024 * 1024

/**
 * Open an ISO (or any large file) as a Blob with a correct `size`.
 *
 * Node's `fs.openAsBlob()` truncates `blob.size` for files &gt; 4GiB
 * (size is effectively uint32). That makes ISO9660 extent checks think
 * the image is truncated. Fall back to an fs-backed Blob when sizes differ.
 */
export async function openIsoBlob(filePath: string): Promise<Blob> {
  const size = fs.statSync(filePath).size
  try {
    const blob = await openAsBlob(filePath)
    if (blob.size === size) return blob
  } catch {
    // fall through to fs-backed blob
  }
  return createPathBlob(filePath, 0, size)
}

function createPathBlob(filePath: string, absStart: number, absEnd: number): Blob {
  const size = Math.max(0, absEnd - absStart)

  const blob = {
    get size() {
      return size
    },
    get type() {
      return 'application/x-iso9660-image'
    },
    slice(start = 0, end: number = size, _contentType?: string): Blob {
      const from = absStart + clampIndex(start, size)
      const to = absStart + clampIndex(end, size)
      return createPathBlob(filePath, from, Math.max(from, to))
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      return readRange(filePath, absStart, size)
    },
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array(await blob.arrayBuffer())
    },
    async text(): Promise<string> {
      return new TextDecoder().decode(await blob.arrayBuffer())
    },
    stream(): ReadableStream<Uint8Array> {
      const nodeStream = fs.createReadStream(filePath, {
        start: absStart,
        end: Math.max(absStart, absEnd - 1),
      })
      return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>
    },
  }

  return blob as unknown as Blob
}

function clampIndex(index: number, size: number): number {
  if (!Number.isFinite(index)) return 0
  let i = Math.trunc(index)
  if (i < 0) i = Math.max(0, size + i)
  return Math.min(size, Math.max(0, i))
}

async function readRange(filePath: string, offset: number, length: number): Promise<ArrayBuffer> {
  if (length <= 0) return new ArrayBuffer(0)
  const fh = await fs.promises.open(filePath, 'r')
  try {
    const out = Buffer.allocUnsafe(length)
    let done = 0
    while (done < length) {
      const toRead = Math.min(READ_CHUNK, length - done)
      const { bytesRead } = await fh.read(out, done, toRead, offset + done)
      if (bytesRead <= 0) break
      done += bytesRead
    }
    const slice = out.subarray(0, done)
    return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)
  } finally {
    await fh.close()
  }
}
