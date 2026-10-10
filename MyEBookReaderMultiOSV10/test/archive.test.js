import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { sampleBytes } from './helpers/samples.mjs';
import { makeZip } from './helpers/zip.mjs';
import {
  adoptArchive, archiveDirPath, archiveFolderTitle, listArchive, listOpenArchive, readArchiveFile,
  shouldBrowseArchive,
} from '../src/lib/archive.js';

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  header.write('        ', 148);
  header.write('0', 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return header;
}

function makeTar(files) {
  const parts = [];
  for (const file of files) {
    const data = Buffer.from(file.data);
    parts.push(tarHeader(file.name, data.length));
    parts.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

describe('a compressed file opened in place', () => {
  it('lists the books and pictures inside a zip, and skips the rest', () => {
    const bytes = makeZip([
      { name: 'books/story.epub', data: 'epub-bytes' },
      { name: 'cover.png', data: 'png-bytes' },
      { name: 'notes/read.txt', data: 'a note' },
      { name: 'skip.exe', data: 'no' },
      { name: '__MACOSX/cover.png', data: 'noise' },
    ]);
    expect(shouldBrowseArchive(bytes, 'shelf.zip')).toBe(true);
    expect(shouldBrowseArchive(bytes, 'shelf.cbz')).toBe(false);
    expect(shouldBrowseArchive(sampleBytes('sample.epub'), 'book.zip')).toBe(false);

    const id = adoptArchive({ data: bytes, name: 'shelf.zip', path: '/tmp/shelf.zip' });
    const top = listArchive(id, '');
    expect(top.map((row) => row.name)).toEqual(['books', 'notes', 'cover.png']);
    expect(top.find((row) => row.name === 'books').kind).toBe('dir');
    expect(top.find((row) => row.name === 'cover.png').kind).toBe('book');

    const books = listOpenArchive(top.find((row) => row.name === 'books').path);
    expect(books.map((row) => row.name)).toEqual(['story.epub']);
    const opened = readArchiveFile(books[0].path);
    expect(opened.name).toBe('story.epub');
    expect(new TextDecoder().decode(opened.data)).toBe('epub-bytes');
    expect(archiveFolderTitle(archiveDirPath(id, ''))).toBe('shelf.zip');
  });

  it('opens a gzip of one file as that file', () => {
    const packed = zlib.gzipSync(Buffer.from('the page'));
    expect(shouldBrowseArchive(packed, 'page.txt.gz')).toBe(true);
    const id = adoptArchive({ data: packed, name: 'page.txt.gz' });
    const rows = listArchive(id, '');
    expect(rows.map((row) => row.name)).toEqual(['page.txt']);
    expect(new TextDecoder().decode(readArchiveFile(rows[0].path).data)).toBe('the page');
  });

  it('opens a tar.gz as the files packed in the tar', () => {
    const tar = makeTar([
      { name: 'scans/one.png', data: 'one' },
      { name: 'scans/two.png', data: 'two' },
    ]);
    const packed = zlib.gzipSync(tar);
    expect(shouldBrowseArchive(packed, 'scans.tar.gz')).toBe(true);
    const id = adoptArchive({ data: packed, name: 'scans.tar.gz' });
    const top = listArchive(id, '');
    expect(top.map((row) => row.name)).toEqual(['scans']);
    const scans = listArchive(id, 'scans');
    expect(scans.map((row) => row.name)).toEqual(['one.png', 'two.png']);
    expect(new TextDecoder().decode(readArchiveFile(scans[1].path).data)).toBe('two');
  });

  it('opens a zip that is itself inside another zip', () => {
    const inner = makeZip([{ name: 'inside.txt', data: 'nested' }]);
    const outer = makeZip([{ name: 'more/pack.zip', data: inner }]);
    const id = adoptArchive({ data: outer, name: 'outer.zip' });
    const more = listArchive(id, 'more');
    expect(more[0].kind).toBe('archive');
    const inside = listOpenArchive(more[0].path);
    expect(inside.map((row) => row.name)).toEqual(['inside.txt']);
    expect(new TextDecoder().decode(readArchiveFile(inside[0].path).data)).toBe('nested');
  });

  it('says when an archive holds nothing the reader can open', () => {
    const bytes = makeZip([{ name: 'readme.exe', data: 'no' }]);
    const id = adoptArchive({ data: bytes, name: 'empty.zip' });
    expect(listArchive(id, '')).toEqual([]);
  });
});
