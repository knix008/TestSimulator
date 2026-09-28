import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf-8');

describe('package identity', () => {
  it('is MyEBookReader, by SHKWON', () => {
    expect(pkg.build.productName).toBe('MyEBookReader');
    expect(pkg.author.name).toBe('SHKWON');
    expect(pkg.author.email).toBe('knix008@naver.com');
    expect(pkg.build.copyright).toContain('knix008@naver.com');
  });

  it('has a version the title bar and the About dialog can show', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('starts from the Electron main process', () => {
    expect(pkg.main).toBe('electron/main.js');
    expect(fs.existsSync(path.join(root, pkg.main))).toBe(true);
  });
});

describe('scripts', () => {
  it('can run, build and test every target', () => {
    for (const script of ['start', 'dev', 'web', 'build', 'build:win', 'build:mac', 'build:linux', 'test', 'generate:icons', 'generate:samples']) {
      expect(pkg.scripts[script], script).toBeTruthy();
    }
  });

  it('regenerates the icons before packaging each platform', () => {
    for (const platform of ['win', 'mac', 'linux']) {
      expect(pkg.scripts[`prebuild:${platform}`]).toContain('generate:icons');
      expect(pkg.scripts[`postbuild:${platform}`]).toContain('copy-installer');
    }
  });

  it('makes the sample books before the tests run', () => {
    expect(pkg.scripts.pretest).toContain('generate-samples-if-missing');
  });

  it('refers only to scripts that exist', () => {
    const names = new Set(fs.readdirSync(path.join(root, 'scripts')));
    for (const command of Object.values(pkg.scripts)) {
      for (const match of String(command).matchAll(/scripts\/([\w.-]+)/g)) {
        expect(names.has(match[1]), match[1]).toBe(true);
      }
    }
  });
});

describe('packaging', () => {
  it('builds an installer for Windows, macOS and Linux', () => {
    expect(pkg.build.win.target[0].target).toBe('nsis');
    expect(pkg.build.mac.target[0].target).toBe('dmg');
    expect(pkg.build.linux.target.map((entry) => entry.target)).toEqual(['AppImage', 'deb']);
  });

  it('uses the same icon for the app, the installer and the uninstaller', () => {
    expect(pkg.build.win.icon).toBe('build/icons/icon.ico');
    expect(pkg.build.nsis.installerIcon).toBe('build/icons/icon.ico');
    expect(pkg.build.nsis.uninstallerIcon).toBe('build/icons/icon.ico');
    expect(pkg.build.nsis.installerHeaderIcon).toBe('build/icons/icon.ico');
    expect(pkg.build.mac.icon).toBe('build/icons/icon.icns');
    expect(pkg.build.icon).toBe('build/icons/icon.png');
  });

  it('registers the .ebkr document type with an icon of its own', () => {
    const [association] = pkg.build.fileAssociations;
    expect(association.ext).toBe('ebkr');
    expect(association.icon).toBe('build/icons/file.ico');
    expect(association.mimeType).toBe('application/x-myebookreader-library');
  });

  it('ships the document icon outside the asar, where the shell can read it', () => {
    const targets = pkg.build.extraResources.map((entry) => entry.to);
    expect(targets).toContain('file.ico');
    expect(targets).toContain('file.png');
    expect(targets).toContain('build-info.json');
  });

  it('lets the installer run in Korean or English', () => {
    expect(pkg.build.nsis.multiLanguageInstaller).toBe(true);
    expect(pkg.build.nsis.displayLanguageSelector).toBe(true);
    expect(pkg.build.nsis.installerLanguages).toEqual(['ko_KR', 'en_US']);
  });

  it('replaces an existing installation completely', () => {
    // electron-builder runs the previous uninstaller before copying files; this
    // is the setting that also removes the data when the app is uninstalled.
    expect(pkg.build.nsis.oneClick).toBe(false);
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(true);
    expect(pkg.build.nsis.allowToChangeInstallationDirectory).toBe(true);
  });

  it('tells Linux which kinds of book it opens', () => {
    const mime = pkg.build.linux.desktop.MimeType;
    expect(mime).toContain('application/epub+zip');
    expect(mime).toContain('application/pdf');
    expect(mime).toContain('x-myebookreader-library');
  });
});

describe('the NSIS installer script', () => {
  it('is the one the build includes', () => {
    expect(pkg.build.nsis.include).toBe('build/installer.nsh');
  });

  it('asks in Korean and in English before deleting old data', () => {
    expect(nsh).toContain('$LANGUAGE == 1042');
    expect(nsh).toContain('이 데이터도 삭제하고 처음 상태로 시작할까요?');
    expect(nsh).toContain('Delete it as well and start fresh?');
    expect(nsh).toContain('MB_YESNO');
    expect(nsh).toContain('RMDir /r "$APPDATA\\${PRODUCT_NAME}"');
  });

  it('keeps the data on a silent install', () => {
    expect(nsh).toContain('/SD IDNO');
  });

  it('registers the .ebkr type with the document icon', () => {
    expect(nsh).toContain('!define LIB_EXT ".ebkr"');
    expect(nsh).toContain('$INSTDIR\\resources\\file.ico,0');
    expect(nsh).toContain('Software\\Classes\\${LIB_EXT}');
  });

  it('adds the reader to the "Open with" list of the book formats', () => {
    for (const ext of ['.epub', '.pdf', '.mobi', '.azw3', '.fb2', '.cbz']) {
      expect(nsh, ext).toContain(`RegisterOpenWith "${ext}"`);
    }
  });

  it('offers the shortcuts as a choice rather than making them silently', () => {
    expect(nsh).toContain('바탕화면에 바로가기 만들기');
    expect(nsh).toContain('Create Desktop shortcut');
    expect(nsh).toContain('customPageAfterChangeDir');
  });

  it('cleans up its registry entries when the app is uninstalled', () => {
    expect(nsh).toContain('customUnInstall');
    expect(nsh).toContain('DeleteRegKey HKCU "Software\\Classes\\${LIB_PROGID}"');
    expect(nsh).toContain('DeleteRegValue HKCU "Software\\RegisteredApplications" "${PRODUCT_NAME}"');
  });
});

describe('the repository', () => {
  it('ignores everything that is generated', () => {
    const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
    for (const entry of ['node_modules/', 'dist/', 'release/', 'build/icons/', 'src/build-info.json']) {
      expect(ignore, entry).toContain(entry);
    }
  });

  it('keeps the source icons under version control', () => {
    expect(fs.existsSync(path.join(root, 'assets', 'icon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'assets', 'file-icon.svg'))).toBe(true);
  });

  it('documents itself', () => {
    for (const doc of ['README.md', 'Architecture.md', 'UsersGuide.md']) {
      expect(fs.existsSync(path.join(root, doc)), doc).toBe(true);
    }
  });
});
