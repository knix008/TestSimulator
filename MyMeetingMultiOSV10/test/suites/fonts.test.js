import { FALLBACK_FONTS, getSystemFonts, fontsWith } from '../../src/lib/fonts.js';
import { eq, ok } from '../assert.js';

export const title = '글꼴';

export default async function suite(test) {
  await test('시스템 글꼴 API가 없으면 한글이 포함된 기본 목록을 쓴다', async () => {
    localStorage.removeItem('mtg-fonts');
    const fonts = await getSystemFonts();
    ok(fonts.includes('Arial'));
    ok(fonts.includes('Malgun Gothic'));
    ok(fonts.includes('Nanum Gothic'));
    ok(fonts.includes('Apple SD Gothic Neo'));
    eq(fonts.length, FALLBACK_FONTS.length);
    const sorted = [...fonts].sort((a, b) => a.localeCompare(b));
    eq(fonts.join('\n'), sorted.join('\n'));
    const again = await getSystemFonts();
    eq(again, fonts);
  });

  await test('고른 글꼴이 목록에 없어도 맨 앞에 보여 준다', () => {
    const base = ['Arial', 'Georgia'];
    eq(fontsWith(base, 'Arial'), base);
    const withCurrent = fontsWith(base, 'Pretendard');
    eq(withCurrent[0], 'Pretendard');
    eq(withCurrent[1], 'Arial');
    eq(fontsWith(base, '  ').join(','), base.join(','));
    eq(fontsWith(null, 'Pretendard')[0], 'Pretendard');
  });
}
