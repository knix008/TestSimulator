// Templates and sample songs. Templates are band arrangements without words (write your own lyrics);
// samples are whole songs — lyrics, melody and band — written by the built-in composer from a fixed
// seed, so every sample is the same each time (and `npm run samples` writes them as .mam files).
import { compose } from './composer.js';
import { createSong } from './song.js';

/** New-song templates: [id, icon, genre, mood, structure]. */
export const TEMPLATES = [
  ['empty', 'fileNew', null],
  ['pop', 'genrePop', 'pop', 'happy', 'standard'],
  ['ballad', 'genreBallad', 'ballad', 'sad', 'ballad'],
  ['kpop', 'genreKpop', 'kpop', 'energetic', 'kpop'],
  ['edm', 'genreEdm', 'edm', 'energetic', 'edm'],
  ['hiphop', 'genreHiphop', 'hiphop', 'dark', 'short'],
  ['rnb', 'genreRnb', 'rnb', 'romantic', 'short'],
  ['rock', 'genreRock', 'rock', 'energetic', 'standard'],
  ['lofi', 'genreLofi', 'lofi', 'calm', 'loop'],
  ['jazz', 'genreJazz', 'jazz', 'calm', 'aaba'],
  ['bossa', 'genreBossa', 'bossa', 'romantic', 'short'],
  ['folk', 'genreFolk', 'folk', 'nostalgic', 'short'],
  ['trot', 'genreTrot', 'trot', 'happy', 'short'],
  ['cinematic', 'genreCinematic', 'cinematic', 'epic', 'loop'],
  ['waltz', 'genreWaltz', 'waltz', 'romantic', 'short'],
];

/** A template's song (an empty song, or the band and chords of a genre without words or vocal). */
export function buildTemplate(id, { title = '', language = 'ko', seed = 1 } = {}) {
  const t = TEMPLATES.find((x) => x[0] === id) ?? TEMPLATES[0];
  if (!t[2]) return createSong({ title, language, sections: [{ type: 'verse', bars: 8 }, { type: 'chorus', bars: 8 }] });
  return compose({ title, genre: t[2], mood: t[3], structure: t[4], language, seed, lyrics: false, vocal: 'none' });
}

export const SAMPLE_GROUPS = [
  { id: 'pop', icon: 'genrePop', ko: '팝 · K-팝', en: 'Pop · K-pop' },
  { id: 'ballad', icon: 'genreBallad', ko: '발라드', en: 'Ballads' },
  { id: 'urban', icon: 'genreHiphop', ko: '힙합 · R&B', en: 'Hip-hop · R&B' },
  { id: 'electronic', icon: 'genreEdm', ko: '일렉트로닉', en: 'Electronic' },
  { id: 'band', icon: 'genreRock', ko: '록 · 포크', en: 'Rock · Folk' },
  { id: 'jazz', icon: 'genreJazz', ko: '재즈 · 보사노바 · 시티팝', en: 'Jazz · Bossa · City pop' },
  { id: 'more', icon: 'genreCinematic', ko: '트로트 · 왈츠 · 시네마틱', en: 'Trot · Waltz · Cinematic' },
  { id: 'english', icon: 'globe', ko: '영어 가사', en: 'English lyrics' },
];

const S = (id, group, genre, mood, topic, language, seed, structure, ko, en) => ({ id, group, genre, mood, topic, language, seed, structure, ko, en });

export const SAMPLES = [
  S('pop-firstlove', 'pop', 'pop', 'happy', '첫사랑', 'ko', 101, 'standard', ['첫사랑', '밝은 팝 · 사랑'], ['First Love', 'Bright pop · love']),
  S('kpop-summer', 'pop', 'kpop', 'energetic', '여름 바다', 'ko', 102, 'kpop', ['여름 바다', 'K-팝 댄스 · 여름'], ['Summer Sea', 'K-pop dance · summer']),
  S('pop-friends', 'pop', 'pop', 'hopeful', '친구', 'ko', 103, 'short', ['친구야', '희망찬 팝 · 우정'], ['Dear Friend', 'Hopeful pop · friendship']),
  S('kpop-dream', 'pop', 'kpop', 'hopeful', '꿈을 향해', 'ko', 104, 'kpop', ['꿈을 향해', 'K-팝 · 희망'], ['Chasing Dreams', 'K-pop · hope']),
  S('pop-spring', 'pop', 'pop', 'romantic', '봄날', 'ko', 105, 'simple', ['봄날의 고백', '로맨틱 팝 · 봄'], ['Spring Confession', 'Romantic pop · spring']),
  S('ballad-rain', 'ballad', 'ballad', 'sad', '비 오는 날', 'ko', 201, 'ballad', ['비 오는 날', '슬픈 발라드 · 비'], ['Rainy Day', 'Sad ballad · rain']),
  S('ballad-goodbye', 'ballad', 'ballad', 'nostalgic', '이별', 'ko', 202, 'ballad', ['안녕이라는 말', '그리운 발라드 · 이별'], ['Saying Goodbye', 'Nostalgic ballad · breakup']),
  S('ballad-winter', 'ballad', 'ballad', 'romantic', '첫눈', 'ko', 203, 'standard', ['첫눈', '로맨틱 발라드 · 겨울'], ['First Snow', 'Romantic ballad · winter']),
  S('ballad-letter', 'ballad', 'ballad', 'nostalgic', '편지', 'ko', 204, 'ballad', ['보내지 못한 편지', '그리운 발라드 · 편지'], ['Unsent Letter', 'Nostalgic ballad · letters']),
  S('ballad-mother', 'ballad', 'ballad', 'calm', '어머니', 'ko', 205, 'standard', ['어머니의 노래', '잔잔한 발라드 · 가족'], ["Mother's Song", 'Calm ballad · family']),
  S('hiphop-city', 'urban', 'hiphop', 'dark', '서울의 밤', 'ko', 301, 'short', ['서울의 밤', '어두운 힙합 · 도시'], ['Seoul Night', 'Dark hip-hop · city']),
  S('rnb-night', 'urban', 'rnb', 'romantic', '새벽', 'ko', 302, 'short', ['새벽 세 시', 'R&B · 밤'], ['3 A.M.', 'R&B · night']),
  S('rnb-dream', 'urban', 'rnb', 'dreamy', '꿈', 'ko', 303, 'standard', ['꿈결', '몽환적 R&B · 꿈'], ['Dreamlike', 'Dreamy R&B · dreams']),
  S('hiphop-stairs', 'urban', 'hiphop', 'hopeful', '성공', 'ko', 304, 'short', ['계단 위에서', '희망찬 힙합 · 꿈'], ['On the Stairs', 'Hopeful hip-hop · dreams']),
  S('funk-party', 'urban', 'funk', 'happy', '파티', 'ko', 305, 'short', ['토요일 밤', '펑크 · 파티'], ['Saturday Night', 'Funk · party']),
  S('edm-run', 'electronic', 'edm', 'energetic', '날아올라', 'ko', 401, 'edm', ['날아올라', 'EDM · 꿈'], ['Fly Up', 'EDM · dreams']),
  S('house-city', 'electronic', 'house', 'happy', '도시의 불빛', 'ko', 402, 'short', ['도시의 불빛', '하우스 · 도시'], ['City Lights', 'House · city']),
  S('lofi-study', 'electronic', 'lofi', 'calm', '창가', 'ko', 403, 'short', ['창가에서', '잔잔한 로파이'], ['By the Window', 'Calm lo-fi']),
  S('edm-festival', 'electronic', 'edm', 'epic', '축제', 'ko', 404, 'edm', ['불꽃 축제', '웅장한 EDM · 축제'], ['Fireworks', 'Epic EDM · festival']),
  S('lofi-rain', 'electronic', 'lofi', 'dreamy', '빗소리', 'ko', 405, 'loop', ['빗소리 노트', '몽환적 로파이 · 연주곡'], ['Rain Notes', 'Dreamy lo-fi · instrumental']),
  S('rock-youth', 'band', 'rock', 'energetic', '청춘', 'ko', 501, 'standard', ['청춘', '록 · 청춘'], ['Youth', 'Rock · youth']),
  S('folk-travel', 'band', 'folk', 'nostalgic', '기차 여행', 'ko', 502, 'short', ['기차 여행', '포크 · 여행'], ['Train Journey', 'Folk · travel']),
  S('folk-home', 'band', 'folk', 'calm', '고향', 'ko', 503, 'short', ['고향의 봄', '잔잔한 포크'], ['Spring at Home', 'Calm folk']),
  S('rock-road', 'band', 'rock', 'hopeful', '길', 'ko', 504, 'standard', ['끝없는 길', '희망찬 록 · 여행'], ['Endless Road', 'Hopeful rock · journey']),
  S('folk-guitar', 'band', 'folk', 'romantic', '기타', 'ko', 505, 'simple', ['기타 하나', '포크 · 사랑'], ['Just a Guitar', 'Folk · love']),
  S('jazz-cafe', 'jazz', 'jazz', 'calm', '카페', 'ko', 601, 'aaba', ['작은 카페', '재즈 · 도시'], ['Little Cafe', 'Jazz · city']),
  S('bossa-sea', 'jazz', 'bossa', 'romantic', '바다', 'ko', 602, 'short', ['바닷바람', '보사노바 · 여름'], ['Sea Breeze', 'Bossa nova · summer']),
  S('citypop-drive', 'jazz', 'citypop', 'nostalgic', '밤의 드라이브', 'ko', 603, 'standard', ['밤의 드라이브', '시티팝 · 밤'], ['Night Drive', 'City pop · night']),
  S('jazz-rain', 'jazz', 'jazz', 'romantic', '비 오는 밤', 'ko', 604, 'aaba', ['비 오는 밤의 재즈', '재즈 · 비'], ['Rainy Night Jazz', 'Jazz · rain']),
  S('citypop-summer', 'jazz', 'citypop', 'happy', '여름 휴가', 'ko', 605, 'short', ['여름 휴가', '시티팝 · 여름'], ['Summer Holiday', 'City pop · summer']),
  S('trot-hope', 'more', 'trot', 'happy', '인생', 'ko', 701, 'short', ['인생은 즐거워', '트로트 · 희망'], ['Life Is Good', 'Trot · hope']),
  S('waltz-love', 'more', 'waltz', 'romantic', '춤', 'ko', 702, 'short', ['우리의 왈츠', '왈츠 · 사랑'], ['Our Waltz', 'Waltz · love']),
  S('cinematic-hope', 'more', 'cinematic', 'epic', '희망', 'ko', 703, 'standard', ['새벽빛', '웅장한 시네마틱'], ['Dawn Light', 'Epic cinematic']),
  S('trot-love', 'more', 'trot', 'romantic', '사랑', 'ko', 704, 'short', ['당신은 내 사랑', '트로트 · 사랑'], ['You Are My Love', 'Trot · love']),
  S('cinematic-stars', 'more', 'cinematic', 'dreamy', '별', 'ko', 705, 'standard', ['별의 여정', '몽환적 시네마틱 · 별'], ['Journey of Stars', 'Dreamy cinematic · stars']),
  S('en-pop-love', 'english', 'pop', 'romantic', 'heart', 'en', 801, 'standard', ['Heart (영어)', '로맨틱 팝'], ['Heart', 'Romantic pop']),
  S('en-ballad-rain', 'english', 'ballad', 'sad', 'rain', 'en', 802, 'ballad', ['Rain (영어)', '슬픈 발라드'], ['Rain', 'Sad ballad']),
  S('en-edm-summer', 'english', 'edm', 'energetic', 'summer night', 'en', 803, 'edm', ['Summer Night (영어)', 'EDM'], ['Summer Night', 'EDM']),
  S('en-folk-home', 'english', 'folk', 'nostalgic', 'home', 'en', 804, 'short', ['Home (영어)', '그리운 포크'], ['Home', 'Nostalgic folk']),
  S('en-rnb-midnight', 'english', 'rnb', 'romantic', 'midnight', 'en', 805, 'short', ['Midnight (영어)', '로맨틱 R&B'], ['Midnight', 'Romantic R&B']),
];

/** A sample's song. */
export function buildSample(id) {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) return null;
  const title = s.language === 'en' ? s.en[0] : s.ko[0];
  return compose({ title, genre: s.genre, mood: s.mood, topic: s.topic, language: s.language, seed: s.seed, structure: s.structure });
}
