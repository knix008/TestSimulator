// INDX: the index structure a MOBI/KF8 file keeps its tables in.
//
// A KF8 book (an .azw3) does not store its chapters as files. It stores one long
// stream of markup plus two tables that say how to cut it up again: a *skeleton*
// table (the frame of each XHTML part) and a *fragment* table (the pieces that
// go into those frames, and where). Both tables are INDX structures, and so is
// the navigation table of an ordinary MOBI. This reads them.
//
// The shape is the same every time:
//
//   INDX (header)   the magic, where the entry offsets are, how many index
//                   records follow, how many CNCX records after those, and a
//                   TAGX block describing what an entry's fields are
//   INDX (entries)  one or more records, each ending in an IDXT list of the
//                   offset of every entry inside it
//   CNCX            the strings the entries refer to by offset
//
// An entry is a name, then a handful of control bytes, then a run of
// variable-width integers. Which integers belong to which field is not in the
// entry at all — it is in the TAGX block, and the control bytes say which of the
// fields this particular entry actually carries. So nothing here can be read
// without the TAGX, and an entry cannot be skipped without decoding it.

const MAGIC_INDX = 'INDX';
const MAGIC_TAGX = 'TAGX';
const MAGIC_IDXT = 'IDXT';

/** One CNCX record's worth of address space. */
const CNCX_STRIDE = 0x10000;

function ascii(data, at, len) {
  return new TextDecoder('latin1').decode(data.subarray(at, at + len));
}

function view(data) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * A big-endian integer of as many bytes as it needs, the high bit marking the
 * last one. Used for every number inside an index entry.
 */
export function readVarint(data, at) {
  let value = 0;
  let used = 0;
  while (at + used < data.length) {
    const byte = data[at + used];
    used += 1;
    value = (value << 7) | (byte & 0x7f);
    if (byte & 0x80) break;
  }
  return { value, used };
}

/** How many bits of a mask are set — a mask with more than one is a run. */
function countBits(mask) {
  let n = 0;
  let m = mask;
  while (m) { n += m & 1; m >>>= 1; }
  return n;
}

/** The TAGX block: what an entry's fields are, and how to tell which it has. */
export function readTagx(data, at) {
  if (at + 12 > data.length || ascii(data, at, 4) !== MAGIC_TAGX) {
    throw new Error('This index has no TAGX block, so its entries cannot be read.');
  }
  const v = view(data);
  const length = v.getUint32(at + 4);
  const controlBytes = v.getUint32(at + 8);
  const tags = [];
  for (let p = at + 12; p + 4 <= at + length && p + 4 <= data.length; p += 4) {
    tags.push({
      tag: data[p],
      valuesPerEntry: data[p + 1],
      mask: data[p + 2],
      endFlag: data[p + 3],
    });
  }
  return { controlBytes, tags };
}

/**
 * The fields of one entry.
 *
 * Returns a map of tag → array of numbers. A tag whose mask is all ones and has
 * more than one bit is followed by a *byte count* rather than a value count,
 * which is why the two cases are decoded separately below.
 */
export function readEntryTags(data, start, end, tagx) {
  const fields = [];
  let controlAt = start;
  let dataAt = start + tagx.controlBytes;

  for (const { tag, valuesPerEntry, mask, endFlag } of tagx.tags) {
    if (endFlag === 0x01) { controlAt += 1; continue; }
    if (controlAt >= data.length) break;
    const masked = data[controlAt] & mask;
    if (!masked) continue;
    if (masked === mask) {
      if (countBits(mask) > 1) {
        const { value, used } = readVarint(data, dataAt);
        dataAt += used;
        fields.push({ tag, valuesPerEntry, bytes: value });
      } else {
        fields.push({ tag, valuesPerEntry, count: 1 });
      }
    } else {
      // Shift the masked value down past the mask's trailing zeros.
      let m = mask;
      let value = masked;
      while (!(m & 1)) { m >>= 1; value >>= 1; }
      fields.push({ tag, valuesPerEntry, count: value });
    }
  }

  const out = new Map();
  for (const field of fields) {
    const values = [];
    if (field.count != null) {
      for (let i = 0; i < field.count * field.valuesPerEntry && dataAt < end; i += 1) {
        const { value, used } = readVarint(data, dataAt);
        dataAt += used;
        values.push(value);
      }
    } else {
      let left = field.bytes;
      while (left > 0 && dataAt < end) {
        const { value, used } = readVarint(data, dataAt);
        dataAt += used;
        left -= used;
        values.push(value);
      }
    }
    out.set(field.tag, values);
  }
  return out;
}

/** The entries of one index record, read from its IDXT offset list. */
function readIndexRecord(record, tagx) {
  if (!record || record.length < 24 || ascii(record, 0, 4) !== MAGIC_INDX) return [];
  const v = view(record);
  const idxt = v.getUint32(0x10);
  const count = v.getUint32(0x14);
  if (idxt + 4 + count * 2 > record.length || ascii(record, idxt, 4) !== MAGIC_IDXT) return [];

  const offsets = [];
  for (let i = 0; i < count; i += 1) offsets.push(v.getUint16(idxt + 4 + i * 2));

  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const at = offsets[i];
    if (at >= record.length) continue;
    const nameLength = record[at];
    const nameAt = at + 1;
    if (nameAt + nameLength > record.length) continue;
    const name = ascii(record, nameAt, nameLength);
    // An entry ends where the next one begins, and the last ends at the IDXT.
    const end = i + 1 < count ? Math.min(offsets[i + 1], idxt) : idxt;
    entries.push({ name, tags: readEntryTags(record, nameAt + nameLength, end, tagx) });
  }
  return entries;
}

/**
 * The strings an index refers to by offset.
 *
 * Each CNCX record is its own 64 KB of address space, which is why the offsets
 * an entry carries can be larger than any one record.
 */
export function readCncx(sectionAt, first, count) {
  const out = new Map();
  for (let i = 0; i < count; i += 1) {
    const record = sectionAt(first + i);
    if (!record) break;
    let pos = 0;
    while (pos < record.length) {
      const { value: length, used } = readVarint(record, pos);
      if (!length || pos + used + length > record.length) break;
      out.set(pos + i * CNCX_STRIDE, ascii(record, pos + used, length));
      pos += used + length;
    }
  }
  return out;
}

/**
 * Reads a whole index.
 *
 * `sectionAt(i)` hands back record i of the part the index belongs to — for a
 * combined file that is counted from the start of the KF8 half, not of the file.
 */
export function readIndex(sectionAt, at) {
  const head = sectionAt(at);
  if (!head || head.length < 0x34 || ascii(head, 0, 4) !== MAGIC_INDX) {
    throw new Error(`Record ${at} is not an index.`);
  }
  const v = view(head);
  const headerLength = v.getUint32(0x04);
  const indexRecords = v.getUint32(0x14);
  const cncxCount = v.getUint32(0x30);
  const tagx = readTagx(head, headerLength);

  const entries = [];
  for (let i = 0; i < indexRecords; i += 1) {
    entries.push(...readIndexRecord(sectionAt(at + 1 + i), tagx));
  }
  const cncx = readCncx(sectionAt, at + 1 + indexRecords, cncxCount);
  return { entries, cncx, tagx };
}
