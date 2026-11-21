// Text of the bundled sound library (recorded instruments): loading progress, the Settings › Sounds section,
// checking and repairing. One line per key, Korean then English (like i18n/music.js). {placeholders} are
// filled by t(key, params).
const T = {
  // ── loading before play / export (audio/sampler.js preloadInstruments → onProgress)
  'sounds.loading.title': ['악기 소리를 불러오는 중', 'Loading instrument sounds'],
  'sounds.loading.text': ['악기 소리를 불러오는 중… {done}/{total} ({name})', 'Loading instrument sounds… {done}/{total} ({name})'],
  'sounds.loading.bytes': ['{bytes} / {totalBytes}', '{bytes} of {totalBytes}'],
  'sounds.loading.instruments': ['악기 {done}/{total}', 'Instruments {done}/{total}'],
  'sounds.loading.fallback': ['일부 악기 소리를 불러오지 못해 내장 신시사이저로 연주합니다: {names}', 'Some instrument sounds could not be loaded; the built-in synthesizer plays them: {names}'],
  // ── Settings › Sounds
  'settings.sounds': ['소리', 'Sounds'],
  'sounds.section.title': ['악기 소리 라이브러리', 'Instrument sound library'],
  'sounds.section.desc': ['실제 녹음한 악기 소리(약 {size})가 프로그램과 함께 설치됩니다. 없는 악기는 내장 신시사이저가 연주합니다.', 'Real recorded instruments (about {size}) come with the program. Instruments without recordings are played by the built-in synthesizer.'],
  'sounds.summary.installed': ['설치됨 — 악기 {sets}개, {size}', 'Installed — {sets} instruments, {size}'],
  'sounds.summary.partial': ['일부 없음 — 파일 {missing}개가 없습니다', 'Incomplete — {missing} files are missing'],
  'sounds.summary.broken': ['손상됨 — 파일 {broken}개가 손상되었습니다', 'Damaged — {broken} files are damaged'],
  'sounds.summary.missing': ['없음 — 내장 신시사이저로 연주합니다', 'Not installed — the built-in synthesizer plays everything'],
  'sounds.summary.unavailable': ['소리 라이브러리를 찾을 수 없습니다 — 내장 신시사이저로 연주합니다', 'The sound library was not found — the built-in synthesizer plays everything'],
  'sounds.summary.unchecked': ['아직 확인하지 않았습니다', 'Not checked yet'],
  'sounds.status.installed': ['설치됨', 'Installed'],
  'sounds.status.partial': ['일부 없음', 'Incomplete'],
  'sounds.status.missing': ['없음', 'Missing'],
  'sounds.status.broken': ['손상됨', 'Damaged'],
  'sounds.status.unavailable': ['찾을 수 없음', 'Not found'],
  'sounds.category': ['{category}: {status} (악기 {count}개)', '{category}: {status} ({count} instruments)'],
  'sounds.check': ['소리 확인', 'Check sounds'],
  'sounds.check.deep': ['모든 소리를 풀어서 확인', 'Decode every sound to check'],
  'sounds.check.progress': ['소리 파일을 확인하는 중… {done}/{total}', 'Checking sound files… {done}/{total}'],
  'sounds.repair': ['다시 받기 / 고치기', 'Re-download / repair'],
  'sounds.repair.progress': ['소리 파일을 다시 받는 중… {done}/{total}', 'Downloading sound files again… {done}/{total}'],
  'sounds.repair.done': ['소리 파일 {fixed}개를 고쳤습니다.', 'Repaired {fixed} sound files.'],
  'sounds.repair.nothing': ['고칠 파일이 없습니다. 모든 소리가 정상입니다.', 'Nothing to repair: every sound is fine.'],
  'sounds.repair.failed': ['파일 {count}개를 받지 못했습니다. 네트워크와 받을 위치를 확인하세요.', '{count} files could not be downloaded. Check the network and the download location.'],
  'sounds.repair.unavailable': ['데스크톱 프로그램은 소리 파일을 받을 위치가 정해져 있지 않습니다. 아래에 받을 위치를 입력하거나 프로그램을 다시 설치하면 소리가 복구됩니다.', 'The desktop program has no download location for sound files. Enter one below, or reinstall the program to restore the sounds.'],
  'sounds.repair.web': ['웹 버전은 이 사이트에서 소리 파일을 다시 받습니다.', 'The web version downloads the sound files again from this site.'],
  'sounds.baseUrl': ['소리 파일 받을 위치 (URL)', 'Sound download location (URL)'],
  'sounds.baseUrl.hint': ['manifest.json과 같은 소리 파일이 있는 폴더의 주소. 비워 두면 다시 받기를 쓰지 않습니다.', 'Address of a folder with the same sound files (manifest.json …). Leave empty to turn re-downloading off.'],
  'sounds.credits': ['소리 출처와 라이선스', 'Sound credits and licences'],
  'sounds.credits.desc': ['VCSL·VSCO 2 CE(Versilian Studios), Karoryfer Lecolds, Virtuosity Drums (CC0), Greg Sullivan의 일렉트릭 피아노(CC BY 3.0)', 'VCSL and VSCO 2 CE (Versilian Studios), Karoryfer Lecolds, Virtuosity Drums (CC0), electric pianos by Greg Sullivan (CC BY 3.0)'],
  'sounds.sampled': ['녹음된 소리', 'Recorded'],
  'sounds.synth': ['신시사이저', 'Synthesizer'],
};

export { T };
export const ko = Object.fromEntries(Object.entries(T).map(([k, [a]]) => [k, a]));
export const en = Object.fromEntries(Object.entries(T).map(([k, [, b]]) => [k, b]));
