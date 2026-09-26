import { saveSettingsToDisk, seedSettingsFromDisk } from '../../src/lib/platform.js';
import { eq } from '../assert.js';

export const title = '설정';

const disk = () => globalThis.__mtgTestDisk;

async function roundTrip(themeAuto) {
  localStorage.clear();
  disk().settings = null;
  localStorage.setItem('mtg-theme', 'nord');
  localStorage.setItem('mtg-theme-auto', '1');
  localStorage.setItem('mtg-theme-dark', 'nord');
  localStorage.setItem('mtg-theme-light', 'mint');
  localStorage.setItem('mtg-lang', 'ko');
  localStorage.setItem('mtg-export', JSON.stringify({ fontSizePt: 12 }));
  localStorage.setItem('mtg-recent', JSON.stringify([{ name: 'notes.mtg' }]));
  saveSettingsToDisk();
  localStorage.clear();
  disk().settings = { ...disk().settings, themeAuto };
  await seedSettingsFromDisk();
}

export default async function suite(test) {
  await test('테마, 언어, 내보내기, 최근 파일을 디스크와 주고받는다', async () => {
    await roundTrip('1');
    eq(localStorage.getItem('mtg-theme'), 'nord');
    eq(localStorage.getItem('mtg-theme-auto'), '1');
    eq(localStorage.getItem('mtg-theme-dark'), 'nord');
    eq(localStorage.getItem('mtg-theme-light'), 'mint');
    eq(localStorage.getItem('mtg-lang'), 'ko');
    eq(JSON.parse(localStorage.getItem('mtg-export')).fontSizePt, 12);
    eq(JSON.parse(localStorage.getItem('mtg-recent'))[0].name, 'notes.mtg');
  });

  await test('자동 테마 끄기는 문자열 0도 끈 상태로 복원한다', async () => {
    for (const value of [true, '1', 1]) {
      await roundTrip(value);
      eq(localStorage.getItem('mtg-theme-auto'), '1', String(value));
    }
    for (const value of [false, '0', 0]) {
      await roundTrip(value);
      eq(localStorage.getItem('mtg-theme-auto'), '0', String(value));
    }
  });
}
