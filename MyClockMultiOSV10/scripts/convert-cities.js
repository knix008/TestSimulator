'use strict';
/** One-off: convert legacy-wpf/Models/CityDatabase.cs into src/js/data/cities.js (IANA zones). */
const fs = require('fs');
const path = require('path');

const WIN_TO_IANA = {
  'AUS Central Standard Time': 'Australia/Darwin',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Afghanistan Standard Time': 'Asia/Kabul',
  'Alaskan Standard Time': 'America/Anchorage',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'Arabic Standard Time': 'Asia/Baghdad',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'Atlantic Standard Time': 'America/Halifax',
  'Azerbaijan Standard Time': 'Asia/Baku',
  'Bahia Standard Time': 'America/Bahia',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'Belarus Standard Time': 'Europe/Minsk',
  'Caucasus Standard Time': 'Asia/Yerevan',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'Central America Standard Time': 'America/Guatemala',
  'Central Asia Standard Time': 'Asia/Almaty',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Central Standard Time': 'America/Chicago',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Eastern Standard Time (Mexico)': 'America/Cancun',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'China Standard Time': 'Asia/Shanghai',
  'Cuba Standard Time': 'America/Havana',
  'E. Africa Standard Time': 'Africa/Nairobi',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Eastern Standard Time': 'America/New_York',
  'Egypt Standard Time': 'Africa/Cairo',
  'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
  'FLE Standard Time': 'Europe/Kiev',
  'Fiji Standard Time': 'Pacific/Fiji',
  'GMT Standard Time': 'Europe/London',
  'GTB Standard Time': 'Europe/Bucharest',
  'Georgian Standard Time': 'Asia/Tbilisi',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'India Standard Time': 'Asia/Kolkata',
  'Iran Standard Time': 'Asia/Tehran',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Jordan Standard Time': 'Asia/Amman',
  'Kaliningrad Standard Time': 'Europe/Kaliningrad',
  'Korea Standard Time': 'Asia/Seoul',
  'Libya Standard Time': 'Africa/Tripoli',
  'Malay Peninsula Standard Time': 'Asia/Kuala_Lumpur',
  'Mauritius Standard Time': 'Indian/Mauritius',
  'Middle East Standard Time': 'Asia/Beirut',
  'Montevideo Standard Time': 'America/Montevideo',
  'Morocco Standard Time': 'Africa/Casablanca',
  'Mountain Standard Time': 'America/Denver',
  'Myanmar Standard Time': 'Asia/Yangon',
  'N. Central Asia Standard Time': 'Asia/Novosibirsk',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'Pacific SA Standard Time': 'America/Santiago',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Pakistan Standard Time': 'Asia/Karachi',
  'Paraguay Standard Time': 'America/Asuncion',
  'Romance Standard Time': 'Europe/Paris',
  'Russian Standard Time': 'Europe/Moscow',
  'SA Eastern Standard Time': 'America/Cayenne',
  'SA Pacific Standard Time': 'America/Bogota',
  'SA Western Standard Time': 'America/La_Paz',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Samoa Standard Time': 'Pacific/Apia',
  'Singapore Standard Time': 'Asia/Singapore',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'Sudan Standard Time': 'Africa/Khartoum',
  'Taipei Standard Time': 'Asia/Taipei',
  'Tasmania Standard Time': 'Australia/Hobart',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Tonga Standard Time': 'Pacific/Tongatapu',
  'Turkey Standard Time': 'Europe/Istanbul',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'US Mountain Standard Time': 'America/Phoenix',
  'Venezuela Standard Time': 'America/Caracas',
  'Vladivostok Standard Time': 'Asia/Vladivostok',
  'W. Australia Standard Time': 'Australia/Perth',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'W. Europe Standard Time': 'Europe/Berlin',
  'West Asia Standard Time': 'Asia/Tashkent',
  'West Pacific Standard Time': 'Pacific/Port_Moresby'
};

const src = fs.readFileSync(path.join(__dirname, '..', 'legacy-wpf', 'Models', 'CityDatabase.cs'), 'utf8');
const re = /new\("([^"]*)",\s*"([^"]*)",\s*"([^"]*)"(?:,\s*"([^"]*)")?\)/g;
const rows = [];
const unknown = new Set();
let m;
while ((m = re.exec(src)) !== null) {
  const [, city, country, winTz, cityEn = ''] = m;
  const zone = WIN_TO_IANA[winTz];
  if (!zone) { unknown.add(winTz); continue; }
  rows.push({ city, country, zone, en: cityEn });
}
if (unknown.size) {
  console.error('Unmapped Windows time zones:', [...unknown]);
  process.exit(1);
}

const body = rows
  .map((r) => `  [${JSON.stringify(r.city)}, ${JSON.stringify(r.country)}, ${JSON.stringify(r.zone)}, ${JSON.stringify(r.en)}]`)
  .join(',\n');

const out = `'use strict';

/**
 * World city database — 도시, 국가, IANA 시간대, 영문 도시명.
 * legacy-wpf/Models/CityDatabase.cs 에서 변환 (Windows TZ ID → IANA).
 */
const CITY_ROWS = [
${body}
];

const CITIES = CITY_ROWS.map(([city, country, zone, en]) => ({ city, country, zone, en }));

/** 도시/국가/영문명 부분 일치 검색 — 접두 일치를 앞쪽에 둔다. */
function searchCities(query, limit = 12) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const c of CITIES) {
    const city = c.city.toLowerCase();
    const en = c.en.toLowerCase();
    const country = c.country.toLowerCase();
    if (city.startsWith(q) || en.startsWith(q)) starts.push(c);
    else if (city.includes(q) || en.includes(q) || country.includes(q)) contains.push(c);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

if (typeof module !== 'undefined') module.exports = { CITIES, searchCities };
`;

const dest = path.join(__dirname, '..', 'src', 'js', 'data', 'cities.js');
fs.writeFileSync(dest, out, 'utf8');
console.log(`wrote ${dest} — ${rows.length} cities`);
