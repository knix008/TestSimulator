// The 40 sample plans of the start page, in eight groups of five. The Website
// Redesign is the tutorial's own plan; the others are ordinary plans about one
// subject each, some of them already under way (baseline and progress).
import { buildFromSpec, buildSample, buildStarted } from '../templates.js';
import { IT } from './it.js';
import { BUILD } from './build.js';
import { PRODUCT } from './product.js';
import { MARKETING } from './marketing.js';
import { EVENT } from './event.js';
import { ORG } from './org.js';
import { RESEARCH } from './research.js';
import { LIFE } from './life.js';

const WEBSITE = {
  id: 'website-redesign', group: 'it', icon: 'viewGantt',
  ko: ['웹사이트 리뉴얼', '튜토리얼 예제: 기준 계획·진행·늦은 작업·초과 할당이 모두 있는 계획'],
  en: ['Website Redesign', 'The tutorial plan: baseline, progress, late work and an overbooked person'],
  build: (language = 'ko', options) => buildSample(language, options),
};

export const SAMPLE_GROUPS = [
  { id: 'it', icon: 'tplSoftware', ko: 'IT·소프트웨어', en: 'IT & Software' },
  { id: 'build', icon: 'tplBuild', ko: '건설·시설', en: 'Construction & Facilities' },
  { id: 'product', icon: 'factory', ko: '제품·제조', en: 'Products & Manufacturing' },
  { id: 'marketing', icon: 'tplMarketing', ko: '마케팅·영업', en: 'Marketing & Sales' },
  { id: 'event', icon: 'tplEvent', ko: '행사·문화', en: 'Events & Culture' },
  { id: 'org', icon: 'briefcase', ko: '경영·조직', en: 'Business & Organization' },
  { id: 'research', icon: 'tplResearch', ko: '연구·교육·공공', en: 'Research, Education & Public' },
  { id: 'life', icon: 'heart', ko: '개인·생활', en: 'Personal & Home' },
];

const withBuild = (sample) => ({
  ...sample,
  build: (language = 'ko', { today } = {}) => (sample.started ? buildStarted(sample.spec, language, { today, weeksAgo: sample.started }) : buildFromSpec(sample.spec, language)),
});

export const SAMPLE_PROJECTS = [WEBSITE, ...[...IT, ...BUILD, ...PRODUCT, ...MARKETING, ...EVENT, ...ORG, ...RESEARCH, ...LIFE].map(withBuild)];

/** A new plan of this sample (null for an unknown id). */
export function buildSampleProject(id, language = 'ko', options = {}) {
  return SAMPLE_PROJECTS.find((sample) => sample.id === id)?.build(language, options) ?? null;
}

/** The sample files installed with the program (scripts/make-samples.mjs). */
export const sampleFileName = (id, language) => `${id}.${language}.mwp`;
