// Sample captures offered on the start page and in File > Open Sample. Each build() returns a fresh
// CaptureFile; scripts/make-samples.mjs writes them to samples/<id>.pcapng.
import { samples as basics } from './build/basics.js';
import { samples as web } from './build/web.js';
import { samples as tls } from './build/tls.js';
import { samples as names } from './build/names.js';
import { samples as lan } from './build/lan.js';
import { samples as voip } from './build/voip.js';
import { demoCapture } from './synth.js';

/** Display order of the groups, with their titles. */
export const SAMPLE_GROUPS = [
  { id: 'basics', ko: '기초', en: 'Basics' },
  { id: 'web', ko: '웹', en: 'Web' },
  { id: 'names', ko: '이름 서비스', en: 'Name services' },
  { id: 'troubleshooting', ko: '문제 해결', en: 'Troubleshooting' },
  { id: 'lan', ko: '라우팅·LAN', en: 'Routing & LAN' },
  { id: 'iot', ko: 'IoT·산업', en: 'IoT & industrial' },
  { id: 'voip', ko: 'VoIP', en: 'VoIP' },
];

const mixed = {
  id: 'mixed-office-lan', group: 'basics', icon: 'network',
  ko: ['사무실 LAN 혼합 트래픽', '작은 사무실 네트워크 30초: DNS, HTTPS, HTTP, QUIC, ARP, ping, DHCP, mDNS, SSDP, NTP'],
  en: ['Mixed office LAN', '30 seconds of a small office network: DNS, HTTPS, HTTP, QUIC, ARP, ping, DHCP, mDNS, SSDP, NTP'],
  build: () => demoCapture({ seed: 7, rate: 40, seconds: 30 }),
};

const ALL = [mixed, ...basics, ...web, ...tls, ...names, ...lan, ...voip];
const order = new Map(SAMPLE_GROUPS.map((g, i) => [g.id, i]));

/** [{ id, group, icon, ko: [title, desc], en: [title, desc], build() → CaptureFile }] */
export const SAMPLES = ALL
  .map((s, i) => ({ s, i }))
  .sort((a, b) => (order.get(a.s.group) ?? 99) - (order.get(b.s.group) ?? 99) || a.i - b.i)
  .map(({ s }) => {
    const build = s.build;
    // File name follows the id (English, kebab-case) whatever the builder called it.
    return { ...s, build: () => { const f = build(); f.name = `${s.id}.pcapng`; return f; } };
  });
