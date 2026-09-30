import { describe, it, expect, vi } from 'vitest';
import {
  MAX_GALLERY, GALLERY_VIEWS, GALLERY_SORTS, galleryKey, galleryEntry, addToGallery,
  updateGallery, removeFromGallery, galleryProgress, sortGallery, searchGallery,
  coverInitials, makeThumbnail, THUMB_TIMEOUT, writtenShelfChange,
} from '../src/lib/gallery.js';
import { DEFAULT_SETTINGS, normalize } from '../src/lib/settings.js';

const book = (over = {}) => ({
  filePath: '/books/dune.epub',
  fileName: 'dune.epub',
  format: 'epub',
  formatLabel: 'EPUB',
  fileSize: 4096,
  sectionCount: 20,
  meta: { title: 'Dune', author: 'Frank Herbert' },
  ...over,
});

describe('shelving a book', () => {
  it('takes what the gallery shows from the book itself', () => {
    const entry = galleryEntry(book(), { dir: '/books' });
    expect(entry).toMatchObject({
      path: '/books/dune.epub',
      name: 'dune.epub',
      dir: '/books',
      title: 'Dune',
      author: 'Frank Herbert',
      format: 'epub',
      formatLabel: 'EPUB',
      size: 4096,
      sections: 20,
      section: 0,
      reads: 1,
    });
    expect(entry.openedAt).toBeGreaterThan(0);
  });

  it('falls back to the file name, without its extension, for a book with no title', () => {
    const entry = galleryEntry(book({ meta: {} }));
    expect(entry.title).toBe('dune');
    expect(entry.author).toBe('');
  });

  it('identifies a book by its path, or by its name when it has none', () => {
    expect(galleryKey({ path: '/a/b.epub', name: 'b.epub' })).toBe('/a/b.epub');
    expect(galleryKey({ name: 'b.epub' })).toBe('b.epub');
    expect(galleryKey(null)).toBe('');
  });

  it('puts the newest book first', () => {
    const list = addToGallery(addToGallery([], galleryEntry(book())), galleryEntry(book({
      filePath: '/books/emma.epub', fileName: 'emma.epub', meta: { title: 'Emma' },
    })));
    expect(list.map((e) => e.title)).toEqual(['Emma', 'Dune']);
  });

  it('keeps what a book already learned when it is opened again', () => {
    let list = addToGallery([], galleryEntry(book()));
    list = updateGallery(list, '/books/dune.epub', { cover: 'data:image/png;base64,AA', section: 7 });
    list = addToGallery(list, galleryEntry(book()));

    expect(list).toHaveLength(1);
    expect(list[0].cover).toBe('data:image/png;base64,AA');
    expect(list[0].section).toBe(7);
    expect(list[0].reads).toBe(2);
  });

  it('writes the shelved book, cover and all, rather than the one just opened', () => {
    let list = addToGallery([], galleryEntry(book()));
    list = updateGallery(list, '/books/dune.epub', { cover: true });
    const opened = galleryEntry(book());
    list = addToGallery(list, opened);
    const change = writtenShelfChange(list, { put: opened });
    expect(change.put.cover).toBe(true);
    expect(change.put.reads).toBe(2);
  });

  it('refuses a book it cannot name', () => {
    expect(addToGallery([], { title: 'nowhere' })).toEqual([]);
  });

  it('holds only so many books', () => {
    // The shipped limit is a hundred thousand; the rule is the same at five.
    const cap = 5;
    let list = [];
    for (let i = 0; i < cap + 12; i++) {
      list = addToGallery(list, galleryEntry(book({ filePath: `/books/${i}.epub`, fileName: `${i}.epub` })), cap);
    }
    expect(list).toHaveLength(cap);
    expect(list[0].name).toBe(`${cap + 11}.epub`);
    expect(MAX_GALLERY).toBeGreaterThanOrEqual(100000);
  });

  it('forgets one book and leaves the rest', () => {
    const list = addToGallery(addToGallery([], galleryEntry(book())), galleryEntry(book({
      filePath: '/books/emma.epub', fileName: 'emma.epub',
    })));
    expect(removeFromGallery(list, '/books/dune.epub').map(galleryKey)).toEqual(['/books/emma.epub']);
  });
});

describe('how far the reading got', () => {
  it('is the section over the sections there are', () => {
    expect(galleryProgress({ section: 0, sections: 11 })).toBe(0);
    expect(galleryProgress({ section: 5, sections: 11 })).toBe(0.5);
    expect(galleryProgress({ section: 10, sections: 11 })).toBe(1);
  });

  it('copes with a book of one section, and with nonsense', () => {
    expect(galleryProgress({ section: 0, sections: 1 })).toBe(0);
    expect(galleryProgress({ section: 1, sections: 1 })).toBe(1);
    expect(galleryProgress({})).toBe(0);
    expect(galleryProgress({ section: 99, sections: 11 })).toBe(1);
  });
});

describe('arranging the shelf', () => {
  const shelf = [
    { name: 'c', title: 'Catch-22', author: 'Heller', format: 'pdf', openedAt: 10, section: 1, sections: 11 },
    { name: 'a', title: 'Anna', author: '', format: 'epub', openedAt: 30, section: 10, sections: 11 },
    { name: 'b', title: 'Beowulf', author: 'Anonymous', format: 'mobi', openedAt: 20, section: 5, sections: 11 },
  ];

  it('sorts by when it was read, newest first, by default', () => {
    expect(sortGallery(shelf).map((e) => e.title)).toEqual(['Anna', 'Beowulf', 'Catch-22']);
    expect(sortGallery(shelf, 'nonsense').map((e) => e.title)).toEqual(['Anna', 'Beowulf', 'Catch-22']);
  });

  it('sorts by title, author, format and progress', () => {
    expect(sortGallery(shelf, 'title').map((e) => e.title)).toEqual(['Anna', 'Beowulf', 'Catch-22']);
    // A book with no author goes last rather than sorting under the empty string.
    expect(sortGallery(shelf, 'author').map((e) => e.author)).toEqual(['Anonymous', 'Heller', '']);
    expect(sortGallery(shelf, 'format').map((e) => e.format)).toEqual(['epub', 'mobi', 'pdf']);
    expect(sortGallery(shelf, 'progress').map((e) => e.title)).toEqual(['Anna', 'Beowulf', 'Catch-22']);
  });

  it('never rearranges the list it was given', () => {
    const before = shelf.map((e) => e.title);
    sortGallery(shelf, 'title');
    expect(shelf.map((e) => e.title)).toEqual(before);
  });

  it('searches the title, the author, the file name and the format', () => {
    expect(searchGallery(shelf, 'beo').map((e) => e.title)).toEqual(['Beowulf']);
    expect(searchGallery(shelf, 'heller').map((e) => e.title)).toEqual(['Catch-22']);
    expect(searchGallery(shelf, 'EPUB').map((e) => e.title)).toEqual(['Anna']);
    expect(searchGallery(shelf, '')).toBe(shelf);
    expect(searchGallery(shelf, 'zzz')).toEqual([]);
  });

  it('offers the two views and the sorts the picker shows', () => {
    expect(GALLERY_VIEWS).toEqual(['icons', 'details']);
    expect(GALLERY_SORTS).toContain('recent');
    expect(GALLERY_SORTS).toContain('title');
  });
});

describe('a book with no cover', () => {
  it('is drawn with its initials', () => {
    expect(coverInitials({ title: 'Dune' })).toBe('DU');
    expect(coverInitials({ title: 'Moby Dick' })).toBe('MD');
    // Initials are for languages with letters; elsewhere the first two
    // characters read better than one character from each word.
    expect(coverInitials({ name: '몽테크리스토 백작' })).toBe('몽테');
    expect(coverInitials({})).toBe('?');
  });
});

describe('thumbnails', () => {
  it('gives nothing back rather than throwing when there is nothing to draw', async () => {
    await expect(makeThumbnail('')).resolves.toBe('');
    await expect(makeThumbnail(null)).resolves.toBe('');
    await expect(makeThumbnail({})).resolves.toBe('');
  });

  it('gives up on a source that neither loads nor fails', async () => {
    vi.useFakeTimers();
    try {
      const pending = makeThumbnail('https://example.invalid/cover.png');
      vi.advanceTimersByTime(THUMB_TIMEOUT + 10);
      await expect(pending).resolves.toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the settings the gallery needs', () => {
  it('ships a gallery, a view and a sort order', () => {
    expect(DEFAULT_SETTINGS.gallery).toEqual([]);
    expect(DEFAULT_SETTINGS.galleryView).toBe('icons');
    expect(DEFAULT_SETTINGS.gallerySort).toBe('recent');
  });

  it('drops rubbish out of a hand-edited settings file', () => {
    const settings = normalize({
      gallery: [{ name: 'a.epub' }, null, 'nonsense', { title: 'no name at all' }],
      galleryView: 'sideways',
      gallerySort: 'colour',
    });
    expect(settings.gallery).toEqual([{ name: 'a.epub' }]);
    expect(settings.galleryView).toBe('icons');
    expect(settings.gallerySort).toBe('recent');
  });

  it('keeps at most a shelf full of books', () => {
    // settings.gallery is only what an older version left behind, on its way
    // to the shelf's own store, so this is about not choking on it.
    const many = Array.from({ length: 200 }, (_, i) => ({ name: `${i}.epub` }));
    expect(normalize({ gallery: many }).gallery).toHaveLength(200);
    expect(MAX_GALLERY).toBeGreaterThanOrEqual(100000);
  });
});
