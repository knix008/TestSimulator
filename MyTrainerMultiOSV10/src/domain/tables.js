// CSV tables for the table samples and for samples/*.csv (npm run samples): generated from a fixed
// seed, so the built-in samples work offline and match the files.
//   studentCsv — did a student pass? (numbers, a text column, a few missing values; classification)
//   houseCsv   — house prices (numbers and a text column; regression)
import { rng } from './datasets-core.js';

export function studentCsv(rows = 400, seed = 2026) {
  const r = rng(seed);
  const clubs = ['science', 'sports', 'music', 'no_club'];
  const lines = ['study_hours,sleep_hours,attendance,club,previous_score,passed'];
  for (let i = 0; i < rows; i++) {
    const study = Math.max(0, r.normal() * 2.5 + 5);
    const sleep = Math.min(10, Math.max(3, r.normal() * 1.2 + 7));
    const attendance = Math.min(100, Math.max(40, r.normal() * 12 + 85));
    const club = clubs[r.int(clubs.length)];
    const previous = Math.min(100, Math.max(20, r.normal() * 15 + 65));
    const score = 0.9 * study + 0.35 * (sleep - 7) + 0.06 * (attendance - 85) + 0.04 * (previous - 65) + (club === 'science' ? 0.6 : 0) + r.normal() * 0.9;
    const missing = r() < 0.03;
    lines.push([study.toFixed(1), missing ? '' : sleep.toFixed(1), attendance.toFixed(0), club, previous.toFixed(0), score > 4.6 ? 'yes' : 'no'].join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function houseCsv(rows = 500, seed = 2027) {
  const r = rng(seed);
  const districts = ['north', 'south', 'east', 'west'];
  const lines = ['area_m2,rooms,age_years,district,distance_km,price'];
  for (let i = 0; i < rows; i++) {
    const area = Math.max(20, r.normal() * 25 + 85);
    const rooms = Math.max(1, Math.round(area / 30 + r.normal() * 0.6));
    const age = Math.max(0, Math.round(r() * 40));
    const district = districts[r.int(districts.length)];
    const distance = Math.max(0.5, r() * 25);
    const price = Math.max(60, 9 * area * (1 - age * 0.006) * { north: 1.25, south: 1.0, east: 0.9, west: 1.1 }[district] * (1.3 - 0.015 * distance) + rooms * 20 + r.normal() * 25);
    lines.push([area.toFixed(1), rooms, age, district, distance.toFixed(1), (price / 100).toFixed(2)].join(','));
  }
  return `${lines.join('\n')}\n`;
}
