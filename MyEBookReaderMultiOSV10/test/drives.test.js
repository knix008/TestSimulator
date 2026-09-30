import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const { listDrives } = require('../electron/drives.js');

const osFor = (home, user = 'reader') => ({ homedir: () => home, userInfo: () => ({ username: user }) });

describe('the drives a folder tree can be started from', () => {
  it('lists the Windows drive letters that answer, and skips the floppies', () => {
    const present = new Set(['C:\\', 'D:\\', 'Z:\\', 'A:\\', 'B:\\']);
    const fs = { existsSync: (p) => present.has(p) };
    const rows = listDrives({ fs, os: osFor('C:\\Users\\reader'), path: path.win32, platform: 'win32' });

    expect(rows.filter((r) => r.kind === 'drive').map((r) => r.name)).toEqual(['C:', 'D:', 'Z:']);
    expect(rows.find((r) => r.name === 'D:').path).toBe('D:\\');
  });

  it('marks the reader’s own folder as a folder, not as a drive', () => {
    const fs = { existsSync: () => false, readdirSync: () => { throw new Error('none'); } };
    const win = listDrives({ fs, os: osFor('C:\\Users\\reader'), path: path.win32, platform: 'win32' });
    expect(win[0]).toMatchObject({ kind: 'home', name: 'reader', path: 'C:\\Users\\reader' });

    const mac = listDrives({ fs, os: osFor('/Users/reader'), path: path.posix, platform: 'darwin' });
    expect(mac[0]).toMatchObject({ kind: 'home', name: 'reader' });
  });

  it('offers the root and the mounted volumes elsewhere', () => {
    const volumes = { '/Volumes': ['Macintosh HD', 'Backup', '.hidden'] };
    const fs = {
      existsSync: () => true,
      readdirSync: (base) => {
        if (!volumes[base]) throw new Error('no such folder');
        return volumes[base];
      },
      statSync: () => ({ isDirectory: () => true }),
    };
    const rows = listDrives({ fs, os: osFor('/Users/reader'), path: path.posix, platform: 'darwin' });
    const names = rows.map((r) => r.name);

    expect(names).toContain('/');
    expect(names).toContain('Macintosh HD');
    expect(names).toContain('Backup');
    // A dot folder is not a volume anyone mounted on purpose.
    expect(names).not.toContain('.hidden');
  });

  it('says nothing rather than throwing when a lookup fails', () => {
    const fs = {
      existsSync: () => { throw new Error('denied'); },
      readdirSync: () => { throw new Error('denied'); },
      statSync: () => { throw new Error('denied'); },
    };
    const rows = listDrives({ fs, os: osFor('/home/reader'), path: path.posix, platform: 'linux' });
    expect(rows.map((r) => r.kind)).toEqual(['home', 'drive']);
  });
});
