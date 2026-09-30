import { describe, it, expect } from 'vitest';
import { readVarint, readTagx, readEntryTags } from '../src/lib/indx.js';
import { fromBase32, readFdst, buildParts, partForFragment, embedKey, positionFid } from '../src/lib/kf8.js';
import { openHuffCdic } from '../src/lib/huffcdic.js';

// The pieces a KF8 book is read with, on their own.
//
// kf8.test.js reads a whole book and is the real test of all this; these are
// the awkward corners, where a wrong answer is easy to make and hard to see in
// a finished page.

const bytes = (...values) => Uint8Array.from(values);

describe('the numbers inside an index', () => {
  it('reads a variable-width integer, the high bit ending it', () => {
    // 0x80 is one byte: the high bit says so, and the value is 0.
    expect(readVarint(bytes(0x80), 0)).toEqual({ value: 0, used: 1 });
    expect(readVarint(bytes(0x81), 0)).toEqual({ value: 1, used: 1 });
    expect(readVarint(bytes(0xff), 0)).toEqual({ value: 0x7f, used: 1 });
    // Two bytes: 0x01 then 0x80 → (1 << 7) | 0.
    expect(readVarint(bytes(0x01, 0x80), 0)).toEqual({ value: 128, used: 2 });
    expect(readVarint(bytes(0x03, 0xe8), 0)).toEqual({ value: (3 << 7) | 0x68, used: 2 });
  });

  it('stops at the end of the data rather than running past it', () => {
    // No byte with the high bit set: it reads what there is and stops.
    expect(readVarint(bytes(0x01, 0x02), 0).used).toBe(2);
    expect(readVarint(bytes(), 0)).toEqual({ value: 0, used: 0 });
  });
});

describe('what an index entry carries', () => {
  /** A TAGX block: one control byte, a count field and a two-value field. */
  function tagx() {
    const block = new Uint8Array(12 + 3 * 4);
    block.set([0x54, 0x41, 0x47, 0x58], 0);              // 'TAGX'
    new DataView(block.buffer).setUint32(4, block.length);
    new DataView(block.buffer).setUint32(8, 1);          // one control byte
    block.set([1, 1, 0x03, 0], 12);                      // tag 1: one value
    block.set([6, 2, 0x0c, 0], 16);                      // tag 6: two values
    block.set([0, 0, 0, 1], 20);                         // end of the controls
    return readTagx(block, 0);
  }

  it('describes the fields from the TAGX block', () => {
    const read = tagx();
    expect(read.controlBytes).toBe(1);
    expect(read.tags.map((t) => t.tag)).toEqual([1, 6, 0]);
    expect(read.tags[1].valuesPerEntry).toBe(2);
  });

  it('reads only the fields the control byte says are there', () => {
    const read = tagx();
    // Control byte 0x05: one value for tag 1 and one pair for tag 6.
    const entry = bytes(0x05, 0x83, 0x8a, 0x94);
    const tags = readEntryTags(entry, 0, entry.length, read);
    expect(tags.get(1)).toEqual([3]);
    expect(tags.get(6)).toEqual([10, 20]);
  });

  it('leaves out a field the entry does not carry', () => {
    const read = tagx();
    // Control byte 0x04: tag 6 only.
    const entry = bytes(0x04, 0x8a, 0x94);
    const tags = readEntryTags(entry, 0, entry.length, read);
    expect(tags.has(1)).toBe(false);
    expect(tags.get(6)).toEqual([10, 20]);
  });
});

describe('the flows of a KF8 book', () => {
  /** An FDST record naming two flows. */
  function fdst(first, second, end) {
    const record = new Uint8Array(12 + 2 * 8);
    record.set([0x46, 0x44, 0x53, 0x54], 0);             // 'FDST'
    const v = new DataView(record.buffer);
    v.setUint32(4, 12);
    v.setUint32(8, 2);
    v.setUint32(12, first);
    v.setUint32(16, second);
    v.setUint32(20, second);
    v.setUint32(24, end);
    return record;
  }

  it('says where each flow begins and the last one ends', () => {
    expect(readFdst(fdst(0, 100, 140), 140)).toEqual([0, 100, 140]);
  });

  it('treats a book with no FDST at all as one flow', () => {
    expect(readFdst(null, 500)).toEqual([0, 500]);
    expect(readFdst(bytes(1, 2, 3), 500)).toEqual([0, 500]);
  });
});

describe('threading the parts of a KF8 book back together', () => {
  const decode = (b) => new TextDecoder('utf-8').decode(b);
  const stream = (text) => new TextEncoder().encode(text);

  it('puts each piece where its position says', () => {
    // Frame, then its two pieces, laid out the way the format lays them out.
    const text = stream('<body></body>' + 'ONE' + 'TWO');
    const parts = buildParts({
      bytes: text,
      skeletons: [{ name: 's0', fragments: 2, start: 0, length: 13 }],
      // '<body>' is six bytes, so the first piece goes at 6 and the second
      // after it, at 9 — measured in the part as it grows.
      fragments: [
        { insertAt: 6, length: 3, sequence: 0, file: 0 },
        { insertAt: 9, length: 3, sequence: 1, file: 0 },
      ],
      decode,
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].html).toBe('<body>ONETWO</body>');
  });

  it('counts in bytes, so text that is not Latin still lands in the right place', () => {
    // '한' is three bytes; a reader counting characters would insert at the
    // wrong place and split the tag.
    const text = stream('<p>한</p>' + '글');
    const frame = new TextEncoder().encode('<p>한</p>').length;
    const parts = buildParts({
      bytes: text,
      skeletons: [{ name: 's0', fragments: 1, start: 0, length: frame }],
      fragments: [{ insertAt: 6, length: 3, sequence: 0, file: 0 }],
      decode,
    });
    expect(parts[0].html).toBe('<p>한글</p>');
  });

  it('shows the flow whole when there is no skeleton table to cut it up', () => {
    const parts = buildParts({ bytes: stream('<p>all of it</p>'), skeletons: [], fragments: [], decode });
    expect(parts).toHaveLength(1);
    expect(parts[0].html).toBe('<p>all of it</p>');
  });

  it('says which part a link into a fragment lands in', () => {
    const parts = [
      { index: 0, fragments: [{ sequence: 0 }, { sequence: 1 }] },
      { index: 1, fragments: [{ sequence: 2 }] },
    ];
    expect(partForFragment(parts, 0)).toBe(0);
    expect(partForFragment(parts, 2)).toBe(1);
    expect(partForFragment(parts, 99)).toBeNull();
  });
});

describe('the kindle: URIs a KF8 book uses', () => {
  it('reads a resource number in base 32', () => {
    expect(fromBase32('0001')).toBe(1);
    expect(fromBase32('000A')).toBe(10);
    expect(fromBase32('0010')).toBe(32);
    expect(embedKey('kindle:embed:0009?mime=image/jpeg')).toBe('embed:9');
    expect(embedKey('../images/plate.png')).toBe('');
  });

  it('reads the fragment a position link points at', () => {
    expect(positionFid('kindle:pos:fid:0002:off:0000000000')).toBe(2);
    expect(positionFid('#somewhere')).toBeNull();
  });
});

describe('HUFF/CDIC', () => {
  it('refuses a book whose tables are not there', () => {
    expect(() => openHuffCdic([])).toThrow(/tables/i);
    expect(() => openHuffCdic([bytes(1, 2, 3)])).toThrow(/HUFF/i);
  });

  it('refuses a HUFF record that stops short of its tables', () => {
    const record = new Uint8Array(32);
    record.set([0x48, 0x55, 0x46, 0x46], 0);
    new DataView(record.buffer).setUint32(8, 24);
    new DataView(record.buffer).setUint32(12, 1048);
    expect(() => openHuffCdic([record])).toThrow(/truncated/i);
  });
});
