// npm run fetch:examples — downloads the start-screen example paintings from Wikimedia Commons.
//
// Every work is a famous painting or print whose artist died more than 100 years ago, so the
// image is in the public domain. Each file is a 960-pixel-wide thumbnail served by Commons.
// The images and public/examples/examples.json (titles, artists, licence, source page) are
// committed, so this script only runs when the list changes.
//
// Usage: node scripts/fetch-examples.mjs [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'examples');
const force = process.argv.includes('--force');
const API = 'https://commons.wikimedia.org/w/api.php';
const AGENT = 'Image2Text-examples/1.0 (desktop app build script)';
const WIDTH = 960;

export const WORKS = [
  { id: 'starry-night', ko: '별이 빛나는 밤', en: 'The Starry Night', artistKo: '빈센트 반 고흐', artistEn: 'Vincent van Gogh', year: 1889, file: 'Van Gogh - Starry Night - Google Art Project.jpg' },
  { id: 'mona-lisa', ko: '모나리자', en: 'Mona Lisa', artistKo: '레오나르도 다 빈치', artistEn: 'Leonardo da Vinci', year: 1503, file: 'Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg' },
  { id: 'great-wave', ko: '가나가와 해변의 높은 파도 아래', en: 'The Great Wave off Kanagawa', artistKo: '가쓰시카 호쿠사이', artistEn: 'Katsushika Hokusai', year: 1831, file: 'Tsunami by hokusai 19th century.jpg' },
  { id: 'pearl-earring', ko: '진주 귀걸이를 한 소녀', en: 'Girl with a Pearl Earring', artistKo: '요하네스 페르메이르', artistEn: 'Johannes Vermeer', year: 1665, file: '1665 Girl with a Pearl Earring.jpg' },
  { id: 'the-scream', ko: '절규', en: 'The Scream', artistKo: '에드바르 뭉크', artistEn: 'Edvard Munch', year: 1893, file: 'Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg' },
  { id: 'impression-sunrise', ko: '인상, 해돋이', en: 'Impression, Sunrise', artistKo: '클로드 모네', artistEn: 'Claude Monet', year: 1872, file: 'Monet - Impression, Sunrise.jpg' },
  { id: 'woman-parasol', ko: '양산을 든 여인', en: 'Woman with a Parasol', artistKo: '클로드 모네', artistEn: 'Claude Monet', year: 1875, file: 'Claude Monet - Woman with a Parasol - Madame Monet and Her Son - Google Art Project.jpg' },
  { id: 'sunflowers', ko: '해바라기', en: 'Sunflowers', artistKo: '빈센트 반 고흐', artistEn: 'Vincent van Gogh', year: 1888, file: 'Vincent Willem van Gogh 127.jpg' },
  { id: 'van-gogh-self', ko: '자화상', en: 'Self-Portrait', artistKo: '빈센트 반 고흐', artistEn: 'Vincent van Gogh', year: 1887, file: 'Vincent van Gogh - Self-Portrait - Google Art Project (454045).jpg' },
  { id: 'the-kiss', ko: '키스', en: 'The Kiss', artistKo: '구스타프 클림트', artistEn: 'Gustav Klimt', year: 1908, file: 'The Kiss - Gustav Klimt - Google Cultural Institute.jpg' },
  { id: 'grande-jatte', ko: '그랑드자트섬의 일요일 오후', en: 'A Sunday on La Grande Jatte', artistKo: '조르주 쇠라', artistEn: 'Georges Seurat', year: 1884, file: 'A Sunday on La Grande Jatte, Georges Seurat, 1884.jpg' },
  { id: 'night-watch', ko: '야경', en: 'The Night Watch', artistKo: '렘브란트 판 레인', artistEn: 'Rembrandt van Rijn', year: 1642, file: 'The Night Watch - HD.jpg' },
  { id: 'milkmaid', ko: '우유를 따르는 여인', en: 'The Milkmaid', artistKo: '요하네스 페르메이르', artistEn: 'Johannes Vermeer', year: 1658, file: 'Johannes Vermeer - Het melkmeisje - Google Art Project.jpg' },
  { id: 'hunters-snow', ko: '눈 속의 사냥꾼', en: 'The Hunters in the Snow', artistKo: '피터르 브뤼헐', artistEn: 'Pieter Bruegel the Elder', year: 1565, file: 'Pieter Bruegel the Elder - Hunters in the Snow (Winter) - Google Art Project.jpg' },
  { id: 'wanderer', ko: '안개 바다 위의 방랑자', en: 'Wanderer above the Sea of Fog', artistKo: '카스파르 다비트 프리드리히', artistEn: 'Caspar David Friedrich', year: 1818, file: 'Caspar David Friedrich - Wanderer above the sea of fog.jpg' },
  { id: 'moulin-galette', ko: '물랭 드 라 갈레트의 무도회', en: 'Bal du moulin de la Galette', artistKo: '피에르오귀스트 르누아르', artistEn: 'Pierre-Auguste Renoir', year: 1876, file: 'Pierre-Auguste Renoir, Le Moulin de la Galette.jpg' },
  { id: 'red-fuji', ko: '붉은 후지산', en: 'Fine Wind, Clear Morning', artistKo: '가쓰시카 호쿠사이', artistEn: 'Katsushika Hokusai', year: 1831, file: 'Red Fuji southern wind clear morning.jpg' },
  { id: 'whistlers-mother', ko: '화가의 어머니', en: "Whistler's Mother", artistKo: '제임스 맥닐 휘슬러', artistEn: 'James McNeill Whistler', year: 1871, file: 'Whistlers Mother high res.jpg' },
  { id: 'gleaners', ko: '이삭 줍는 사람들', en: 'The Gleaners', artistKo: '장프랑수아 밀레', artistEn: 'Jean-François Millet', year: 1857, file: 'Jean-François Millet - Gleaners - Google Art Project 2.jpg' },
  { id: 'ssireum', ko: '씨름', en: 'Ssireum (Wrestling)', artistKo: '김홍도', artistEn: 'Kim Hong-do', year: 1780, search: '김홍도 씨름 단원풍속도첩' },
];

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// Commons answers 429 when asked too quickly: pause between requests and back off on 429.
async function get(url) {
  for (let attempt = 0; ; attempt += 1) {
    await wait(1500);
    const response = await fetch(url, { headers: { 'User-Agent': AGENT } });
    if (response.status === 429 && attempt < 6) {
      const after = Number(response.headers.get('retry-after')) || 10 * (attempt + 1);
      console.log(`[examples] busy, retrying in ${after} s`);
      await wait(after * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} for ${url.slice(0, 80)}`);
    return response;
  }
}

async function api(params) {
  return (await get(`${API}?${new URLSearchParams({ format: 'json', ...params })}`)).json();
}

async function imageInfo(title) {
  const data = await api({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiextmetadatafilter: 'LicenseShortName',
    iiurlwidth: String(WIDTH),
    titles: `File:${title}`,
  });
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.imageinfo?.[0] ? { title: page.title, ...page.imageinfo[0] } : null;
}

async function searchTitle(query) {
  const data = await api({ action: 'query', list: 'search', srnamespace: '6', srlimit: '5', srsearch: query });
  const hit = (data.query?.search ?? []).find((item) => /\.(jpe?g|png|tiff?)$/i.test(item.title));
  return hit ? hit.title.replace(/^File:/, '') : null;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const list = [];
  for (const work of WORKS) {
    const target = join(outDir, `${work.id}.jpg`);
    const title = work.file ?? (await searchTitle(work.search));
    const info = title ? await imageInfo(title) : null;
    if (!info?.thumburl) throw new Error(`${work.id}: not found on Commons (${title ?? work.search})`);
    if (force || !existsSync(target)) {
      const response = await get(info.thumburl);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`${work.id}: not a JPEG`);
      writeFileSync(target, bytes);
      console.log(`[examples] ${work.id}.jpg  ${(bytes.length / 1024).toFixed(0)} KB  ${info.title}`);
    } else {
      console.log(`[examples] ${work.id}.jpg  kept`);
    }
    const { file, search, ...rest } = work;
    list.push({
      ...rest,
      image: `examples/${work.id}.jpg`,
      width: info.thumbwidth,
      height: info.thumbheight,
      license: info.extmetadata?.LicenseShortName?.value ?? 'Public domain',
      source: info.descriptionurl,
    });
  }
  writeFileSync(join(outDir, 'examples.json'), `${JSON.stringify(list, null, 2)}\n`);
  console.log(`[examples] ${list.length} works written to public/examples/`);
}

main().catch((error) => {
  console.error(`[examples] ${error.message}`);
  process.exit(1);
});
