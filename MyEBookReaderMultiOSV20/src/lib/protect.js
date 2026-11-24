// Password protection for everything that is not a PDF (pdf-write.js does
// PDFs, inside the file's own format).
//
//   archive  EPUB, CBZ, ZIP, FB2.ZIP — a ZIP container, so the password goes
//            on the archive itself (WinZip AES-256, or ZipCrypto for Windows
//            Explorer), and comes off by rewriting it without one.
//   file     TXT, Markdown, HTML, MOBI, DjVu, FB2, pictures… — formats with no
//            password of their own. Protecting one saves it inside a
//            password-protected ZIP ("novel.txt" → "novel.txt.zip"), which the
//            reader opens straight back into the book.
//   folder   a folder of pictures — saved as a ZIP of those pictures.
//
// Protection choices are the PDF ones: { mode: 'keep' | 'none' | 'set',
// password, encryption }.
import { looksLikeZip, readZip, zipEncryptionOf, zipPasswordOf } from './ebook/zip.js';
import { rewriteZip, zipFiles } from './ebook/zip-write.js';

/** 'pdf' | 'archive' | 'file' | 'folder' — how a book of this kind is protected. */
export function protectionKind({ isPdf = false, data = null, pictures = null } = {}) {
  if (isPdf) return 'pdf';
  if (data && looksLikeZip(data)) return 'archive';
  if (!data && pictures) return 'folder';
  return 'file';
}

/**
 * How archive bytes are protected now: { encrypted, encryption, password }
 * (password: the one they were opened with, when they were).
 */
export function archiveProtectionOf(data) {
  if (!data || !looksLikeZip(data)) return { encrypted: false, encryption: null, password: null };
  try {
    const zip = readZip(data);
    return {
      encrypted: zip.encrypted,
      encryption: zipEncryptionOf(zip),
      password: zip.encrypted ? zipPasswordOf(data) : null,
    };
  } catch {
    return { encrypted: false, encryption: null, password: null };
  }
}

const withZipExt = (name) => (/\.zip$/i.test(name) ? name : `${name}.zip`);

// Pictures of a folder book, each with a distinct name in the archive.
function folderEntries(pictures) {
  const seen = new Set();
  return pictures.map((p, i) => {
    let name = String(p.name || `page-${i + 1}`).split(/[\\/]/).pop();
    if (seen.has(name.toLowerCase())) name = `${String(i + 1).padStart(4, '0')}-${name}`;
    seen.add(name.toLowerCase());
    return { name, data: p.bytes };
  });
}

/**
 * The bytes to save and the file name to suggest, for `book`
 * ({ name, data, pictures }) saved with `protection`.
 * Throws when `data` is an archive whose password is not known.
 */
export function buildProtectedCopy(book, protection = {}) {
  const mode = protection.mode || 'keep';
  const password = mode === 'set' ? String(protection.password ?? '') : null;
  if (mode === 'set' && !password) throw new Error('A password is needed to protect the file.');
  const encryption = protection.encryption === 'zipcrypto' ? 'zipcrypto' : 'aes256';
  const name = String(book.name || 'book');
  const kind = protectionKind(book);

  if (kind === 'folder') {
    return {
      bytes: zipFiles(folderEntries(book.pictures || []), { password, encryption }),
      name: withZipExt(name),
    };
  }
  if (kind === 'archive') {
    if (mode === 'keep') return { bytes: book.data, name };
    return { bytes: rewriteZip(book.data, { password, encryption }), name };
  }
  // A plain file: with a password it goes into an archive of its own.
  if (mode === 'set') {
    return { bytes: zipFiles([{ name, data: book.data }], { password, encryption }), name: withZipExt(name) };
  }
  return { bytes: book.data, name };
}
