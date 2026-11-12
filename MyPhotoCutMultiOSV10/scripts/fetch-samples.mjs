// npm run samples — downloads the sample portraits shown on the start page into public/samples/
// (all public domain, from Wikimedia Commons; public/samples/CREDITS.md lists the sources).
// The files are kept in the repository; run this only to fetch them again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_PHOTOS } from '../src/domain/samples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'samples');
fs.mkdirSync(out, { recursive: true });
const UA = 'MyPhotoCut-samples/1.0 (sample download script)';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Commons metadata. A file already saved is not asked for again. */
async function commonsInfo(sample) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(sample.commons)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960&format=json`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await pause(attempt === 0 ? 800 : 8000 * attempt);
    const body = await (await fetch(api, { headers: { 'User-Agent': UA } })).text();
    if (body.startsWith('{')) return JSON.parse(body);
    console.warn(`… ${sample.file}: waiting for Commons`);
  }
  return null;
}

const credits = ['# Sample photos', '', 'All pictures are in the public domain (Wikimedia Commons). Width 960 px.', '', '| File | Source | Licence |', '|---|---|---|'];
for (const sample of SAMPLE_PHOTOS) {
  const target = path.join(out, sample.file);
  if (fs.existsSync(target) && !process.argv.includes('--force')) {
    const href = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(sample.commons.replaceAll(' ', '_'))}`;
    credits.push(`| ${sample.file} | [File:${sample.commons}](${href}) | Public domain |`);
    console.log(`✔ ${sample.file} (kept)`);
    continue;
  }
  const info = await commonsInfo(sample);
  const page = info ? Object.values(info.query.pages)[0] : null;
  const image = page?.imageinfo?.[0];
  if (!image?.thumburl) { console.warn(`✘ ${sample.file}: not found`); continue; }
  const licence = image.extmetadata?.LicenseShortName?.value ?? '?';
  const bytes = Buffer.from(await (await fetch(image.thumburl, { headers: { 'User-Agent': UA } })).arrayBuffer());
  fs.writeFileSync(target, bytes);
  credits.push(`| ${sample.file} | [${page.title}](${image.descriptionurl}) | ${licence} |`);
  console.log(`✔ ${sample.file} (${licence})`);
}
fs.writeFileSync(path.join(out, 'CREDITS.md'), `${credits.join('\n')}\n`);
