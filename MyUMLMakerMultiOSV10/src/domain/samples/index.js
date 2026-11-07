// The 40 sample projects of the start page, in eight groups of five. The Online Shop is
// the big one (a diagram of every kind); the others are smaller projects about one subject.
import { buildSample } from '../templates.js';
import { BUSINESS, PUBLIC } from './business.js';
import { FINANCE, SERVICE } from './finance.js';
import { CLOUD, EMBEDDED } from './systems.js';
import { ENTERPRISE, PLAN } from './planning.js';

const ONLINE_SHOP = {
  id: 'online-shop', group: 'business', icon: 'dgClass',
  ko: ['온라인 쇼핑몰', '모든 종류의 다이어그램이 하나씩 들어 있는 큰 예제'],
  en: ['Online Shop', 'The big sample: one diagram of every kind'],
  build: (language = 'ko') => buildSample(language),
};

export const SAMPLE_GROUPS = [
  { id: 'business', icon: 'dgClass', ko: '업무 시스템', en: 'Business Systems' },
  { id: 'public', icon: 'dgUseCase', ko: '공공·교육·의료', en: 'Public, Education & Health' },
  { id: 'finance', icon: 'dgSequence', ko: '금융', en: 'Finance' },
  { id: 'service', icon: 'dgComponent', ko: '웹·모바일 서비스', en: 'Web & Mobile Services' },
  { id: 'embedded', icon: 'dgState', ko: '임베디드·IoT', en: 'Embedded & IoT' },
  { id: 'cloud', icon: 'dgAws', ko: '클라우드·인프라', en: 'Cloud & Infrastructure' },
  { id: 'enterprise', icon: 'dgArchimate', ko: '아키텍처·프로세스', en: 'Architecture & Processes' },
  { id: 'plan', icon: 'dgGantt', ko: '프로젝트·UX·데이터', en: 'Projects, UX & Data' },
];

export const SAMPLE_PROJECTS = [ONLINE_SHOP, ...BUSINESS, ...PUBLIC, ...FINANCE, ...SERVICE, ...EMBEDDED, ...CLOUD, ...ENTERPRISE, ...PLAN];

/** A new project of this sample (null for an unknown id). */
export function buildSampleProject(id, language = 'ko') {
  return SAMPLE_PROJECTS.find((sample) => sample.id === id)?.build(language) ?? null;
}

/** The sample files installed with the program (scripts/make-samples.mjs). */
export const sampleFileName = (id, language) => `${id}.${language}.myuml`;
