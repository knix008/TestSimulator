// npm run build:emoji — writes src/lib/emoji.js: the emoji palette (categories, Korean and
// English names) and the vector art of every emoji, taken from Twemoji (@twemoji/svg, a dev
// dependency; graphics © Twitter, Inc. and other contributors, CC-BY 4.0). Only the emoji listed
// here go into the program. Each art is the inside of a 36 × 36 SVG, so the design file stores
// only the emoji's code and every size is drawn from vectors.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@twemoji', 'svg');
const out = join(root, 'src', 'lib', 'emoji.js');

const CATEGORIES = [
  ['faces', '1f600', '얼굴', 'Faces'],
  ['people', '1f44d', '손·사람', 'Hands & people'],
  ['animals', '1f436', '동물', 'Animals'],
  ['food', '1f34e', '음식', 'Food'],
  ['nature', '1f33b', '자연·날씨', 'Nature & weather'],
  ['objects', '1f4a1', '사물', 'Objects'],
  ['activity', '1f680', '활동·여행', 'Activities & travel'],
  ['symbols', '2764', '기호', 'Symbols'],
];

// [code (Twemoji file name), Korean name, English name]
const LIST = {
  faces: [
    ['1f600', '활짝 웃는 얼굴', 'Grinning face'], ['1f603', '웃는 얼굴', 'Smiling face, big eyes'], ['1f604', '눈웃음', 'Smiling eyes'],
    ['1f601', '이를 드러낸 웃음', 'Beaming face'], ['1f606', '깔깔 웃음', 'Laughing'], ['1f605', '진땀 웃음', 'Sweat smile'],
    ['1f602', '기뻐서 우는 얼굴', 'Tears of joy'], ['1f923', '데굴데굴 웃음', 'Rolling on the floor'], ['1f60a', '수줍은 웃음', 'Blushing smile'],
    ['1f607', '천사 얼굴', 'Halo'], ['1f642', '살짝 웃음', 'Slight smile'], ['1f609', '윙크', 'Wink'],
    ['1f60d', '하트 눈', 'Heart eyes'], ['1f970', '하트 가득한 얼굴', 'Smiling with hearts'], ['1f618', '뽀뽀', 'Blowing a kiss'],
    ['1f60b', '맛있는 얼굴', 'Yum'], ['1f61c', '메롱 윙크', 'Winking with tongue'], ['1f92a', '엉뚱한 얼굴', 'Zany face'],
    ['1f60e', '선글라스', 'Sunglasses'], ['1f913', '공부벌레', 'Nerd'], ['1f914', '생각 중', 'Thinking'],
    ['1f610', '무표정', 'Neutral face'], ['1f644', '눈 굴리기', 'Rolling eyes'], ['1f634', '잠자는 얼굴', 'Sleeping'],
    ['1f637', '마스크', 'Medical mask'], ['1f912', '아픈 얼굴', 'Thermometer'], ['1f622', '눈물', 'Crying'],
    ['1f62d', '엉엉 울기', 'Sobbing'], ['1f621', '화난 얼굴', 'Pouting'], ['1f631', '비명', 'Screaming'],
    ['1f633', '당황', 'Flushed'], ['1f973', '파티 얼굴', 'Partying face'], ['1f929', '별 눈', 'Star-struck'],
    ['1f917', '포옹', 'Hugging'], ['1f92b', '쉿', 'Shushing'], ['1f47b', '유령', 'Ghost'],
    ['1f480', '해골', 'Skull'], ['1f916', '로봇', 'Robot'], ['1f47d', '외계인', 'Alien'], ['1f4a9', '똥', 'Pile of poo'],
  ],
  people: [
    ['1f44d', '좋아요', 'Thumbs up'], ['1f44e', '싫어요', 'Thumbs down'], ['1f44f', '박수', 'Clapping'],
    ['1f64c', '만세', 'Raising hands'], ['1f44b', '손 흔들기', 'Waving hand'], ['270c', '브이', 'Victory hand'],
    ['1f44c', 'OK 손', 'OK hand'], ['1f91e', '행운을 빌어요', 'Crossed fingers'], ['1f4aa', '힘센 팔', 'Flexed biceps'],
    ['1f64f', '부탁해요', 'Folded hands'], ['1f91d', '악수', 'Handshake'], ['1f446', '위를 가리키는 손', 'Pointing up'],
    ['1f440', '눈', 'Eyes'], ['1f476', '아기', 'Baby'],
  ],
  animals: [
    ['1f436', '강아지', 'Dog'], ['1f431', '고양이', 'Cat'], ['1f42d', '쥐', 'Mouse'], ['1f430', '토끼', 'Rabbit'],
    ['1f98a', '여우', 'Fox'], ['1f43b', '곰', 'Bear'], ['1f43c', '판다', 'Panda'], ['1f428', '코알라', 'Koala'],
    ['1f42f', '호랑이', 'Tiger'], ['1f981', '사자', 'Lion'], ['1f42e', '소', 'Cow'], ['1f437', '돼지', 'Pig'],
    ['1f438', '개구리', 'Frog'], ['1f435', '원숭이', 'Monkey'], ['1f414', '닭', 'Chicken'], ['1f427', '펭귄', 'Penguin'],
    ['1f426', '새', 'Bird'], ['1f984', '유니콘', 'Unicorn'], ['1f41d', '꿀벌', 'Honeybee'], ['1f98b', '나비', 'Butterfly'],
    ['1f422', '거북', 'Turtle'], ['1f419', '문어', 'Octopus'], ['1f42c', '돌고래', 'Dolphin'], ['1f433', '고래', 'Whale'], ['1f41f', '물고기', 'Fish'],
  ],
  food: [
    ['1f34e', '사과', 'Apple'], ['1f34a', '귤', 'Tangerine'], ['1f34b', '레몬', 'Lemon'], ['1f34c', '바나나', 'Banana'],
    ['1f349', '수박', 'Watermelon'], ['1f347', '포도', 'Grapes'], ['1f353', '딸기', 'Strawberry'], ['1f352', '체리', 'Cherries'],
    ['1f351', '복숭아', 'Peach'], ['1f34d', '파인애플', 'Pineapple'], ['1f951', '아보카도', 'Avocado'], ['1f955', '당근', 'Carrot'],
    ['1f33d', '옥수수', 'Corn'], ['1f354', '햄버거', 'Hamburger'], ['1f355', '피자', 'Pizza'], ['1f32d', '핫도그', 'Hot dog'],
    ['1f35f', '감자튀김', 'French fries'], ['1f363', '초밥', 'Sushi'], ['1f369', '도넛', 'Doughnut'], ['1f36a', '쿠키', 'Cookie'],
    ['1f382', '생일 케이크', 'Birthday cake'], ['1f366', '아이스크림', 'Ice cream'], ['2615', '커피', 'Hot beverage'],
  ],
  nature: [
    ['2600', '해', 'Sun'], ['1f319', '초승달', 'Crescent moon'], ['2b50', '별', 'Star'], ['1f31f', '빛나는 별', 'Glowing star'],
    ['2601', '구름', 'Cloud'], ['26c5', '구름 낀 해', 'Sun behind cloud'], ['1f308', '무지개', 'Rainbow'], ['26a1', '번개', 'Lightning'],
    ['2744', '눈송이', 'Snowflake'], ['1f525', '불', 'Fire'], ['1f4a7', '물방울', 'Droplet'], ['1f30a', '파도', 'Water wave'],
    ['1f338', '벚꽃', 'Cherry blossom'], ['1f33b', '해바라기', 'Sunflower'], ['1f339', '장미', 'Rose'], ['1f340', '네잎클로버', 'Four-leaf clover'],
    ['1f332', '상록수', 'Evergreen tree'], ['1f335', '선인장', 'Cactus'], ['1f344', '버섯', 'Mushroom'], ['1f30d', '지구', 'Globe'],
  ],
  objects: [
    ['1f4f1', '휴대폰', 'Mobile phone'], ['1f4bb', '노트북', 'Laptop'], ['2328', '키보드', 'Keyboard'], ['1f5a5', '데스크톱', 'Desktop computer'],
    ['1f4f7', '카메라', 'Camera'], ['1f3a5', '영화 카메라', 'Movie camera'], ['1f4fa', '텔레비전', 'Television'], ['1f50b', '배터리', 'Battery'],
    ['1f4a1', '전구', 'Light bulb'], ['1f4da', '책', 'Books'], ['1f4dd', '메모', 'Memo'], ['1f4ce', '클립', 'Paperclip'],
    ['1f4cc', '압정', 'Pushpin'], ['1f4c5', '달력', 'Calendar'], ['1f4c8', '상승 그래프', 'Chart increasing'], ['1f4e6', '상자', 'Package'],
    ['1f4e7', '전자 우편', 'E-mail'], ['1f381', '선물', 'Gift'], ['1f511', '열쇠', 'Key'], ['1f512', '자물쇠', 'Locked'],
    ['1f514', '종', 'Bell'], ['1f6d2', '장바구니', 'Shopping cart'], ['1f4b0', '돈 자루', 'Money bag'], ['1f48e', '보석', 'Gem'],
    ['23f0', '알람 시계', 'Alarm clock'], ['1f3c6', '트로피', 'Trophy'],
  ],
  activity: [
    ['26bd', '축구공', 'Soccer ball'], ['1f3c0', '농구공', 'Basketball'], ['26be', '야구공', 'Baseball'], ['1f3be', '테니스', 'Tennis'],
    ['1f3ae', '게임기', 'Video game'], ['1f3b2', '주사위', 'Game die'], ['1f3af', '과녁', 'Bullseye'], ['1f3b5', '음표', 'Musical note'],
    ['1f3b8', '기타', 'Guitar'], ['1f3a8', '팔레트', 'Artist palette'], ['1f680', '로켓', 'Rocket'], ['2708', '비행기', 'Airplane'],
    ['1f697', '자동차', 'Car'], ['1f6b2', '자전거', 'Bicycle'], ['1f3e0', '집', 'House'], ['1f3eb', '학교', 'School'],
    ['1f388', '풍선', 'Balloon'], ['1f389', '파티 폭죽', 'Party popper'],
  ],
  symbols: [
    ['2764', '빨간 하트', 'Red heart'], ['1f9e1', '주황 하트', 'Orange heart'], ['1f49b', '노란 하트', 'Yellow heart'], ['1f49a', '초록 하트', 'Green heart'],
    ['1f499', '파란 하트', 'Blue heart'], ['1f49c', '보라 하트', 'Purple heart'], ['1f494', '깨진 하트', 'Broken heart'], ['1f496', '반짝이는 하트', 'Sparkling heart'],
    ['2728', '반짝임', 'Sparkles'], ['1f4af', '100점', 'Hundred points'], ['2705', '확인 표시', 'Check mark'], ['274c', '엑스 표시', 'Cross mark'],
    ['2753', '물음표', 'Question mark'], ['2757', '느낌표', 'Exclamation mark'], ['26a0', '주의', 'Warning'], ['1f6ab', '금지', 'Prohibited'],
    ['267b', '재활용', 'Recycling'], ['1f4a4', '쿨쿨', 'Zzz'], ['1f4ac', '말풍선', 'Speech balloon'], ['1f195', 'NEW', 'NEW button'],
    ['1f197', 'OK', 'OK button'], ['1f534', '빨간 원', 'Red circle'], ['1f7e2', '초록 원', 'Green circle'], ['1f535', '파란 원', 'Blue circle'],
  ],
};

if (!existsSync(source)) {
  console.error('[emoji] @twemoji/svg is missing: run npm install first.');
  process.exit(1);
}

/** The inside of a Twemoji SVG (its viewBox is 0 0 36 36); ids are made unique per emoji. */
function art(code) {
  const svg = readFileSync(join(source, `${code}.svg`), 'utf8').trim();
  const box = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (box !== '0 0 36 36') throw new Error(`${code}: unexpected viewBox ${box}`);
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
    .replace(/id="([^"]+)"/g, `id="e${code}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#e${code}-$1)`).replace(/href="#([^"]+)"/g, `href="#e${code}-$1"`);
}

const seen = new Set();
const emoji = [];
const arts = {};
for (const [cat] of CATEGORIES) {
  for (const [code, ko, en] of LIST[cat]) {
    if (seen.has(code)) throw new Error(`${code} listed twice`);
    seen.add(code);
    emoji.push({ id: code, cat, ko, en });
    arts[code] = art(code);
  }
}
for (const [, code] of CATEGORIES) if (!arts[code]) arts[code] = art(code);

const text = `// Generated by scripts/build-emoji.mjs — do not edit (npm run build:emoji).
// Emoji graphics: Twemoji, © Twitter, Inc. and other contributors, CC-BY 4.0
// (https://creativecommons.org/licenses/by/4.0/), via @twemoji/svg.

/** Emoji categories: id, the emoji shown on the tab, names. */
export const EMOJI_CATEGORIES = ${JSON.stringify(CATEGORIES.map(([id, icon, ko, en]) => ({ id, icon, ko, en })))};

/** The palette: { id (Twemoji code), cat, ko, en }. */
export const EMOJI = ${JSON.stringify(emoji, null, 0).replace(/\},\{/g, '},\n  {')};

/** The vector art of every emoji: the inside of an SVG with viewBox 0 0 36 36. */
export const EMOJI_ART = ${JSON.stringify(arts, null, 0).replace(/","/g, '",\n  "')};

export const EMOJI_BY_ID = Object.fromEntries(EMOJI.map((e) => [e.id, e]));
export const emojiIn = (cat) => EMOJI.filter((e) => e.cat === cat);
/** The emoji as a character (for searching and for the name in the layer list). */
export const emojiChar = (id) => String.fromCodePoint(...id.split('-').map((h) => parseInt(h, 16)));
/** The emoji as a whole SVG document. */
export const emojiSvg = (id) => \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36">\${EMOJI_ART[id] ?? ''}</svg>\`;
`;
writeFileSync(out, text);
console.log(`[emoji] ${emoji.length} emoji in ${CATEGORIES.length} categories → src/lib/emoji.js (${Math.round(text.length / 1024)} KB)`);
