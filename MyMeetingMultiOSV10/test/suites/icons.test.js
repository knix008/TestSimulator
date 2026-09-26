import { renderToStaticMarkup } from 'react-dom/server';
import * as Icons from '../../src/components/Icons.jsx';
import { eq, ok, includes } from '../assert.js';

export const title = '아이콘';

const EXPECTED = [
  'IconFolder', 'IconFilePlus', 'IconSave', 'IconSaveAs', 'IconExport',
  'IconPrinter', 'IconTrash', 'IconSettings', 'IconInfo', 'IconSun', 'IconMoon',
  'IconRefresh', 'IconContrast', 'IconCheck', 'IconGlobe',
];

export default async function suite(test) {
  await test('툴바에서 쓰는 아이콘을 모두 내보낸다', () => {
    for (const name of EXPECTED) eq(typeof Icons[name], 'function', name);
    const names = Object.keys(Icons).filter((name) => typeof Icons[name] === 'function');
    ok(names.length >= 40, `icon count ${names.length}`);
  });

  await test('아이콘은 색을 상속하는 SVG를 그린다', () => {
    for (const name of Object.keys(Icons)) {
      const icon = Icons[name];
      if (typeof icon !== 'function') continue;
      const html = renderToStaticMarkup(icon({ size: 16 }));
      includes(html, '<svg', name);
      ok(/width="\d+"/.test(html), name);
      includes(html, 'currentColor', name);
    }
    includes(renderToStaticMarkup(Icons.IconRefresh()), 'width="18"');
    includes(renderToStaticMarkup(Icons.IconWinMin()), 'width="14"');
    includes(renderToStaticMarkup(Icons.IconPrinter()), 'M6 9V3h12v6');
  });
}
