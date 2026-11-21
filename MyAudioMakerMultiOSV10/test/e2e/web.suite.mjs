// E2E cases: the real app in a browser (and, for cases marked `desktop`, in the desktop app), driven
// through window.__myaudiomaker and real DOM events. A case fails when it throws or when the page
// logs an error while it runs. Popups are frames in the web build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';

const G = '시작 화면';
export const cases = [
  {
    group: G, name: '카드 (머리말·바로 가기·최근·AI 작곡·템플릿·예제·배경), 아이콘·번역 빠짐 없음', desktop: true,
    async run(app) {
      const r = await app.run(`await T.reset({ song: false }); A.actions.showStartPage(true); await T.frames(4); return { cards: [...document.querySelectorAll('.start-card')].map((c) => c.dataset.card), dots: T.missingIcons(), raw: T.rawKeys(), genres: document.querySelectorAll('.genre-tile').length, samples: document.querySelectorAll('[data-start="sample"]').length, templates: document.querySelectorAll('[data-start="template"]').length };`);
      for (const c of ['hero', 'actions', 'recent', 'compose', 'templates', 'samples', 'background']) assert.ok(r.cards.includes(c), c);
      assert.equal(r.dots, 0, 'icons');
      assert.deepEqual(r.raw, [], 'untranslated keys');
      assert.equal(r.genres, 18);
      assert.equal(r.samples, 24);
      assert.equal(r.templates, 15);
    },
  },
  {
    group: G, name: '장르 타일 → AI 마법사가 그 장르로 열리고, 곡 만들기로 새 곡',
    async run(app) {
      const r = await app.run(`await T.reset({ song: false }); A.actions.showStartPage(true); await T.frames(2);
        document.querySelector('.genre-tile[data-value="lofi"]').click();
        await T.popupReady('compose');
        const d = T.frameOf('compose').contentDocument;
        const on = d.querySelector('[data-draft-segment="genre"].on')?.dataset.value;
        d.querySelector('textarea[data-draft="topic"]').value = '창가의 오후'; d.querySelector('textarea[data-draft="topic"]').dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-action="wizard-go"]').click();
        await T.until(() => A.state.doc && !A.state.showStart && A.state.doc.song.genre === 'lofi', 20000, 'lofi song');
        return { on, title: A.state.doc.song.title, topic: A.state.doc.song.topic, tracks: A.state.doc.song.tracks.length };`, 60000);
      assert.equal(r.on, 'lofi');
      assert.equal(r.topic, '창가의 오후');
      assert.ok(r.title && r.tracks >= 5);
    },
  },
  {
    group: G, name: '예제 24곡과 템플릿 15개가 모두 열림 (문제 패널에 오류·경고 없음)',
    async run(app) {
      const r = await app.run(`const bad = [];
        for (const s of A.domain.SAMPLES) { await T.sample(s.id); await T.sleep(450); const probs = A.state.problems.filter((p) => p.severity !== 'info'); if (probs.length || !A.state.doc.song.tracks.length) bad.push(s.id + ':' + probs.map((p) => p.code)); }
        for (const [id] of A.domain.TEMPLATES) { await T.fresh(id); if (!A.state.doc.song.sections.length) bad.push(id); }
        return bad;`, 180000);
      assert.deepEqual(r, []);
    },
  },
  {
    group: 'AI 작곡', name: '왼쪽 패널에서 주제·장르·분위기·영어 가사로 곡 만들기 (내장 작사기)', desktop: true,
    async run(app) {
      const r = await app.run(`await T.fresh('pop');
        Object.assign(A.state.compose, { topic: 'a rainy night in the city', genre: 'rnb', mood: 'romantic', language: 'en', structure: 'short', seed: 4242 });
        A.state.leftTab = 'compose'; A.api.renderAll();
        A.state.doc.markSaved();
        await A.run('aiCompose');
        const s = A.state.doc.song;
        const vocal = s.tracks.find((t) => t.role === 'vocal');
        return { genre: s.genre, lang: s.language, lyric: s.sections.find((x) => x.lyrics.length)?.lyrics[0], syl: vocal?.notes.filter((n) => n.syl).length, problems: A.state.problems.filter((p) => p.severity === 'error').length, provider: s.ai.provider };`, 60000);
      assert.equal(r.genre, 'rnb');
      assert.equal(r.lang, 'en');
      assert.match(r.lyric, /^[\x20-\x7e]+$/);
      assert.ok(r.syl > 50);
      assert.equal(r.provider, 'builtin');
    },
  },
  {
    group: 'AI 작곡', name: 'AI로 가사 새로 쓰기: 모든 노래 구간의 가사가 바뀌고 멜로디가 음절 수에 맞음, 실행 취소로 되돌아감',
    async run(app) {
      const r = await app.run(`await T.sample('pop-firstlove');
        const before = JSON.stringify(A.state.doc.song.sections.map((s) => s.lyrics));
        await A.run('aiLyrics');
        const s = A.state.doc.song;
        const after = JSON.stringify(s.sections.map((x) => x.lyrics));
        const { lyricFit } = await import('/src/music/composer.js');
        const off = s.sections.flatMap((x) => lyricFit(s, x)).filter((f) => f.notes !== f.syllables).length;
        A.actions.undo();
        return { changed: before !== after, off, back: JSON.stringify(A.state.doc.song.sections.map((x) => x.lyrics)) === before };`, 60000);
      assert.ok(r.changed, 'new lyrics');
      assert.equal(r.off, 0, 'every line fits its notes');
      assert.ok(r.back, 'undo');
    },
  },
  {
    group: 'AI 작곡', name: '다른 버전(새 시드): 같은 장르·구성, 다른 곡',
    async run(app) {
      const r = await app.run(`await T.sample('rock-youth'); const a = A.state.doc.song; A.state.doc.markSaved(); await A.run('aiVariation'); const b = A.state.doc.song;
        return { genre: b.genre, same: a.sections.map((s) => s.type).join() === b.sections.map((s) => s.type).join(), seed: a.seed !== b.seed };`, 60000);
      assert.equal(r.genre, 'rock');
      assert.ok(r.same && r.seed);
    },
  },
  {
    group: '편곡', name: '다시 만들기: 코드·멜로디·리드·반주·베이스·드럼·전부 (다른 구간은 그대로)',
    async run(app) {
      const r = await app.run(`await T.sample('edm-run'); const s = () => A.state.doc.song; const sec = s().sections.find((x) => x.type === 'verse' && !s().sections.some((y) => y.repeatOf === x.id)); A.actions.selectSection(sec.id);
        const { sectionSpans } = await import('/src/music/song.js');
        const span = sectionSpans(s()).find((x) => x.section.id === sec.id);
        const outside = () => JSON.stringify(s().tracks.map((t) => t.notes.filter((n) => n.t < span.start || n.t >= span.end)));
        const keep = outside(); const out = [];
        for (const part of ['chords', 'melody', 'lead', 'accompaniment', 'bass', 'drums', 'all']) { A.actions.regenerate(part); out.push(outside() === keep); }
        return out;`, 60000);
      assert.deepEqual(r, [true, true, true, true, true, true, true]);
    },
  },
  {
    group: '편곡', name: '구간 추가·복제·이동·삭제와 마디 수 변경, 실행 취소·다시 실행', desktop: true,
    async run(app) {
      const r = await app.run(`await T.sample('pop-friends'); const s = () => A.state.doc.song; const n0 = s().sections.length;
        const { songBeats } = await import('/src/music/song.js');
        const len0 = songBeats(s());
        A.actions.selectSection(s().sections[1].id); A.actions.addSection('bridge');
        const added = s().sections.length === n0 + 1 && s().sections[2].type === 'bridge' && songBeats(s()) === len0 + 32;
        await A.run('duplicateSection'); const dup = s().sections.length === n0 + 2;
        await A.run('sectionUp'); A.actions.setSectionBars(A.state.section, 4);
        A.state.settings.confirmDelete = false; await A.run('deleteSection');
        const n4 = s().sections.length;
        for (let i = 0; i < 5; i++) A.actions.undo();
        const back = s().sections.length === n0 && songBeats(s()) === len0;
        A.actions.redo();
        const notesInside = s().tracks.every((t) => t.notes.every((n) => n.t < songBeats(s())));
        return { added, dup, n4: n4 === n0 + 1, back, redo: s().sections.length === n0 + 1, notesInside };`, 60000);
      for (const [k, v] of Object.entries(r)) assert.ok(v, k);
    },
  },
  {
    group: '편곡', name: '트랙: 추가·악기 바꾸기·음소거·솔로·볼륨·복제·삭제',
    async run(app) {
      const r = await app.run(`await T.sample('jazz-cafe'); const s = () => A.state.doc.song; const n0 = s().tracks.length;
        A.actions.addTrack('violin'); const t = s().tracks.at(-1);
        A.state.track = t.id; A.state.leftTab = 'instruments'; A.api.renderAll(); await T.frames(2);
        document.querySelector('.inst-card[data-instrument="cello"] [data-inst-use]').click();
        const inst = s().tracks.find((x) => x.id === t.id).instrument;
        document.querySelector('.arr-head[data-track="' + t.id + '"] [data-track-mute]').click();
        const muted = s().tracks.find((x) => x.id === t.id).mute;
        document.querySelector('.arr-head[data-track="' + s().tracks[0].id + '"] [data-track-solo]').click();
        const { audible } = A.domain;
        const soloOnly = s().tracks.filter((x) => audible(s(), x)).length === 1;
        await A.run('duplicateTrack'); A.state.settings.confirmDelete = false; await A.run('deleteTrack');
        return { added: n0 + 1, now: s().tracks.length, inst, muted, soloOnly };`, 60000);
      assert.equal(r.now, r.added);
      assert.equal(r.inst, 'cello');
      assert.ok(r.muted && r.soloOnly);
    },
  },
  {
    group: '피아노 롤', name: '그리기·이동·길이·지우기, 키보드로 반음·옥타브, 퀀타이즈·복사·붙여넣기', desktop: true,
    async run(app) {
      const r = await app.run(`await T.sample('ballad-rain'); const s = () => A.state.doc.song;
        const lead = s().tracks.find((t) => t.role === 'lead'); A.actions.selectTrack(lead.id, { open: true, beat: 0 }); await T.frames(4);
        const roll = A.roll; roll.body.scrollTop = roll.rowOf(72) * roll.row - 100; roll.body.scrollLeft = 0; roll.draw(); await T.frames(2);
        const b = roll.body.getBoundingClientRect();
        const ev = (type, x, y, o = {}) => roll.body.dispatchEvent(new PointerEvent(type, { clientX: b.left + x, clientY: b.top + y, bubbles: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...o }));
        const n0 = lead.notes.length;
        A.run('tool:draw'); await T.frames(2);
        const x = roll.x(2) - roll.body.scrollLeft + 2; const y = roll.rowOf(72) * roll.row - roll.body.scrollTop + roll.row / 2;
        ev('pointerdown', x, y); ev('pointermove', x + roll.x(1), y); ev('pointerup', x + roll.x(1), y); await T.frames(2);
        const drawn = lead.notes.find((n) => n.t === 2 && n.p === 72);
        A.run('tool:select'); await T.frames(1);
        ev('pointerdown', x + 4, y); ev('pointermove', x + 4 + roll.x(1), y - roll.row * 2); ev('pointerup', x + 4 + roll.x(1), y - roll.row * 2); await T.frames(2);
        const moved = { t: drawn.t, p: drawn.p };
        roll.selection = new Set([drawn]);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
        const keyed = drawn.p;
        await A.run('copy'); A.actions.seek(16); await A.run('paste');
        const pasted = lead.notes.some((n) => n.t === 16 && n.p === keyed);
        drawn.t = 3.07; roll.selection = new Set([drawn]); await A.run('quantize');
        const q = drawn.t;
        A.run('tool:erase'); const ex = roll.x(drawn.t) - roll.body.scrollLeft + 3; const ey = roll.rowOf(drawn.p) * roll.row - roll.body.scrollTop + roll.row / 2;
        ev('pointerdown', ex, ey); ev('pointerup', ex, ey); await T.frames(2);
        A.run('tool:select');
        return { drawn: Boolean(drawn), moved, keyed, pasted, q, erased: !lead.notes.includes(drawn), count: lead.notes.length - n0 };`, 60000);
      assert.ok(r.drawn, 'a note drawn');
      assert.deepEqual(r.moved, { t: 3, p: 74 }, 'moved a beat later, a whole step up');
      assert.equal(r.keyed, 63, '+1 semitone, −1 octave');
      assert.ok(r.pasted, 'pasted at the play position');
      assert.equal(r.q, 3);
      assert.ok(r.erased);
      assert.equal(r.count, 1, 'one pasted note left');
    },
  },
  {
    group: '가사', name: '가사를 고치면 멜로디가 음절 수에 맞게 다시 쓰이고, 반복 코러스도 따라감', desktop: true,
    async run(app) {
      const r = await app.run(`await T.sample('pop-firstlove'); A.actions.setView('lyrics'); await T.frames(3);
        const s = () => A.state.doc.song; const chorus = s().sections.find((x) => x.type === 'chorus');
        const ta = document.querySelector('textarea[data-lyrics="' + chorus.id + '"]');
        ta.value = ['오늘 밤은 노래해', '하늘 높이 날아가 별을 따러 가자', '너와 나', '오늘 밤은 노래해'].join(String.fromCharCode(10));
        ta.dispatchEvent(new Event('change', { bubbles: true })); await T.frames(3);
        const { lyricFit } = await import('/src/music/composer.js');
        const fit = lyricFit(s(), chorus).map((f) => f.notes === f.syllables);
        const repeat = s().sections.filter((x) => x.repeatOf === chorus.id).every((x) => x.lyrics[1] === '하늘 높이 날아가 별을 따러 가자');
        const offCounts = document.querySelectorAll('[data-lyric-section="' + chorus.id + '"] .lyric-count.off').length;
        return { fit, repeat, offCounts };`, 60000);
      assert.deepEqual(r.fit, [true, true, true, true]);
      assert.ok(r.repeat, 'repeated choruses take the words');
      assert.equal(r.offCounts, 0);
    },
  },
  {
    group: '가사', name: '코드 줄 직접 입력 → 반주·베이스가 새 코드를 따름, 잘못된 코드는 거부',
    async run(app) {
      const r = await app.run(`await T.sample('folk-home'); const s = () => A.state.doc.song; const sec = s().sections[1]; A.actions.selectSection(sec.id); A.state.rightTab = 'section'; A.api.renderAll(); await T.frames(2);
        const input = document.querySelector('[data-section-field="chords"]'); input.value = 'Am | F | C | G'; input.dispatchEvent(new Event('change', { bubbles: true })); await T.frames(2);
        const chords = sec.chords.map((c) => c.symbol).slice(0, 4).join(' ');
        const { sectionSpans } = await import('/src/music/song.js'); const span = sectionSpans(s()).find((x) => x.section.id === sec.id);
        const bass = s().tracks.find((t) => t.role === 'bass').notes.find((n) => n.t === span.start);
        const input2 = document.querySelector('[data-section-field="chords"]'); input2.value = 'Q7 Zz'; input2.dispatchEvent(new Event('change', { bubbles: true })); await T.frames(2);
        return { chords, bassPc: bass ? bass.p % 12 : null, kept: sec.chords[0].symbol };`, 60000);
      assert.equal(r.chords, 'Am F C G');
      assert.equal(r.bassPc, 9, 'the bass plays A');
      assert.equal(r.kept, 'Am', 'bad chords are refused');
    },
  },
  {
    group: '곡', name: '조옮김·조 바꾸기·빠르기·박자, 상단 칩이 따라감',
    async run(app) {
      const r = await app.run(`await T.sample('pop-firstlove'); const s = () => A.state.doc.song; const k0 = s().key.tonic; const p0 = s().tracks[0].notes[0].p; const c0 = s().sections[1].chords[0].symbol;
        await A.run('transposeUp'); await A.run('transposeUp');
        const k = s().key.tonic === (k0 + 2) % 12 && s().tracks[0].notes[0].p === p0 + 2 && s().sections[1].chords[0].symbol !== c0;
        A.state.rightTab = 'song'; A.api.renderAll(); await T.frames(2);
        const sel = document.querySelector('[data-song="timeSignature"]'); sel.value = '3/4'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { k, chip: document.querySelector('[data-song-chip="ts"]').textContent.trim() };`, 60000);
      assert.ok(r.k);
      assert.equal(r.chip, '3/4');
    },
  },
  {
    group: '재생', name: '재생하면 위치가 흐르고, 구간 반복은 그 구간 안에서 되돌아감, 메트로놈', desktop: true,
    async run(app) {
      const r = await app.run(`await T.sample('house-city'); const s = A.state.doc.song;
        A.actions.play(0); await T.sleep(1200); const p1 = A.state.position; A.actions.stopPlayback();
        const { sectionSpans } = await import('/src/music/song.js'); const span = sectionSpans(s)[0];
        s.loop = { on: true, start: span.start, end: span.start + 2 };
        A.api.updateSettings({ metronome: true }, { quiet: true });
        A.actions.play(0); const seen = []; for (let i = 0; i < 16; i++) { await T.sleep(100); seen.push(A.state.position); } A.actions.stopPlayback();
        s.loop.on = false; A.api.updateSettings({ metronome: false }, { quiet: true });
        return { p1, inside: seen.every((p) => p >= span.start - 0.01 && p <= span.start + 2.05), wrapped: seen.some((p, i) => i && p < seen[i - 1]), ctx: A.player.ac?.state };`, 60000);
      assert.ok(r.p1 > 1, `position moved (${r.p1})`);
      assert.ok(r.inside, 'stays in the loop');
      assert.ok(r.wrapped, 'jumps back');
    },
  },
  {
    group: '내보내기', name: 'WAV 렌더링(소리 있음), 스템, MIDI·LRC·가사·코드표 파일',
    async run(app) {
      const before = new Set(fs.readdirSync(app.downloads));
      const r = await app.run(`await T.sample('lofi-study'); window.showSaveFilePicker = undefined;
        const { renderSong } = await import('/src/audio/engine.js'); const s = A.state.doc.song;
        const b = await renderSong(s, { start: 0, end: 8, sampleRate: 22050 }); let peak = 0; for (const v of b.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
        const drums = s.tracks.find((t) => t.role === 'drums');
        const stem = await renderSong(s, { start: 0, end: 8, sampleRate: 22050, tracks: [drums.id] }); let sp = 0; for (const v of stem.getChannelData(0)) sp = Math.max(sp, Math.abs(v));
        await A.run('exportMidi'); await A.run('exportLrc'); await A.run('exportLyrics'); await A.run('exportChords');
        return { peak, sp, len: b.duration };`, 120000);
      assert.ok(r.peak > 0.05, `audible (${r.peak})`);
      assert.ok(r.sp > 0.02, 'a drum stem');
      assert.ok(r.len > 8 * 60 / 90, 'the tail is included');
      await sleep(1500);
      const files = fs.readdirSync(app.downloads).filter((f) => !before.has(f));
      for (const ext of ['.mid', '.lrc', '.txt']) assert.ok(files.some((f) => f.endsWith(ext)), `${ext} in ${files.join(', ')}`);
      const mid = files.find((f) => f.endsWith('.mid'));
      assert.equal(fs.readFileSync(path.join(app.downloads, mid)).subarray(0, 4).toString(), 'MThd');
    },
  },
  {
    group: '내보내기', name: '오디오 내보내기 창 → WAV 파일 (다운로드)',
    async run(app) {
      const before = new Set(fs.readdirSync(app.downloads));
      await app.run(`await T.sample('lofi-study'); window.showSaveFilePicker = undefined; const s = A.state.doc.song; A.actions.selectSection(s.sections[0].id); A.run('exportAudio'); await T.popupReady('exportaudio');
        const d = T.frameOf('exportaudio').contentDocument; d.querySelector('[data-draft-segment="range"][data-value="section"]').click(); await T.sleep(200);
        T.frameOf('exportaudio').contentDocument.querySelector('[data-action="export-go"]').click(); return 1;`, 30000);
      const end = Date.now() + 60000;
      let wav = null;
      while (Date.now() < end && !wav) { wav = fs.readdirSync(app.downloads).filter((f) => !before.has(f)).find((f) => f.endsWith('.wav')); if (!wav) await sleep(300); }
      assert.ok(wav, 'a .wav download');
      await sleep(500);
      const bytes = fs.readFileSync(path.join(app.downloads, wav));
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
      assert.ok(bytes.length > 100000);
    },
  },
  {
    group: '파일', name: '.mam 저장 내용 → 다시 열기, MIDI 가져오기 (가사가 보컬로)', desktop: true,
    async run(app) {
      const r = await app.run(`await T.sample('citypop-drive'); const s = A.state.doc.song;
        const { packSong } = await import('/src/io/fileformat.js'); const { songToMidi } = await import('/src/io/midi.js');
        const bytes = packSong(s); const midi = songToMidi(s);
        A.state.doc.markSaved(); await A.actions.openBytes('again.mam', bytes); const same = A.state.doc.song.tracks.map((t) => t.notes.length).join() === s.tracks.map((t) => t.notes.length).join();
        A.state.doc.markSaved(); await A.actions.openBytes('song.mid', midi); const m = A.state.doc.song; A.state.doc.markSaved();
        return { same, bpm: m.bpm === s.bpm, vocal: m.tracks.find((t) => t.role === 'vocal')?.notes.filter((n) => n.syl).length, src: s.tracks.find((t) => t.role === 'vocal').notes.length };`, 60000);
      assert.ok(r.same && r.bpm);
      assert.equal(r.vocal, r.src);
    },
  },
  {
    group: '보기', name: '편곡·피아노 롤·가사·리드 시트 화면, 확대·축소·전체 보기', desktop: true,
    async run(app) {
      const r = await app.run(`await T.sample('waltz-love'); const out = {};
        for (const v of ['arrangement', 'roll', 'lyrics', 'sheet']) { A.actions.setView(v); await T.frames(3); for (const c of ['zoomIn', 'zoomOut', 'zoomFit']) await A.run(c); out[v] = !document.querySelector('.view-' + v).hidden; }
        out.heads = document.querySelectorAll('.sheet-view svg ellipse').length;
        out.dots = T.missingIcons(); out.raw = T.rawKeys();
        return out;`, 60000);
      assert.ok(r.arrangement && r.roll && r.lyrics && r.sheet);
      assert.ok(r.heads > 50, `note heads on the sheet (${r.heads})`);
      assert.equal(r.dots, 0);
      assert.deepEqual(r.raw, []);
    },
  },
  {
    group: '인쇄', name: '인쇄 창: 쪽 수·미리보기·PDF 저장(내부 훅), 페이지 종류 끄고 켜기',
    async run(app) {
      const r = await app.run(`await T.sample('pop-firstlove'); A.run('print'); await T.popupReady('print'); await T.sleep(500);
        const w = T.frameOf('print').contentWindow; const d = w.document;
        const pages = d.querySelector('#page-number').textContent;
        let pdf = 0; w.__myaudiomakerPdfHook = async (list, bytes) => { pdf = bytes.length; };
        d.querySelector('[data-print-pick="leadsheet"]').click(); await T.sleep(300);
        const fewer = w.document.querySelector('#page-number').textContent;
        w.document.querySelector('[data-action="print-pdf"]').click(); await T.until(() => pdf > 0, 30000, 'pdf');
        return { pages, fewer, pdf, svg: Boolean(w.document.querySelector('.preview-stage svg')) };`, 60000);
      assert.notEqual(r.pages, r.fewer, 'unticking the lead sheet changes the count');
      assert.ok(r.pdf > 1000);
      assert.ok(r.svg);
    },
  },
  {
    group: '설정', name: '설정 10개 탭: 스크롤 없이 들어감, 아이콘·번역 빠짐 없음; AI 탭 제공자·키 저장',
    async run(app) {
      const r = await app.run(`await T.reset(); const out = {};
        for (const tab of ['general', 'start', 'appearance', 'font', 'background', 'audio', 'editor', 'ai', 'recent', 'shortcuts']) {
          A.popups.open('settings', { tab }); await T.popupReady('settings'); await T.sleep(250);
          const d = T.frameOf('settings').contentDocument; const b = d.querySelector('.popup-body');
          out[tab] = { over: b.scrollHeight - b.clientHeight, dots: T.missingIcons(d), raw: T.rawKeys(d) };
          await A.popups.close('settings');
        }
        A.popups.open('settings', { tab: 'ai' }); await T.popupReady('settings');
        let d = T.frameOf('settings').contentDocument; d.querySelector('[data-setting="aiProvider"][data-value="claude"]').click(); await T.sleep(300);
        d = T.frameOf('settings').contentDocument; const key = d.querySelector('[data-ai-key]'); key.value = 'sk-ant-test-123'; key.dispatchEvent(new Event('change', { bubbles: true })); await T.sleep(200);
        const stored = localStorage.getItem('myaudiomaker.aiKey.v1');
        d.querySelector('[data-action="ai-key-clear"]').click(); await T.sleep(200);
        d = T.frameOf('settings').contentDocument; d.querySelector('[data-setting="aiProvider"][data-value="builtin"]').click(); await T.sleep(200);
        await A.popups.close('settings');
        return { out, stored, cleared: localStorage.getItem('myaudiomaker.aiKey.v1') };`, 60000);
      for (const [tab, v] of Object.entries(r.out)) { assert.ok(v.over <= 2, `${tab}: no scroll (${v.over})`); assert.equal(v.dots, 0, `${tab}: icons`); assert.deepEqual(v.raw, [], `${tab}: text`); }
      assert.equal(r.stored, 'sk-ant-test-123');
      assert.equal(r.cleared, null);
    },
  },
  {
    group: '설정', name: 'Claude 를 골랐지만 키가 없으면 내장 작사기로 작곡 (오류 없음)',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); A.api.updateSettings({ aiProvider: 'claude' }, { quiet: true }); A.state.settings.aiApiKey = ''; A.state.doc.markSaved();
        await A.run('aiCompose'); const p = A.state.doc.song.ai.provider; A.api.updateSettings({ aiProvider: 'builtin' }, { quiet: true }); return p;`, 60000);
      assert.equal(r, 'builtin');
    },
  },
  {
    group: '메뉴', name: '메뉴 7개와 하위 메뉴: 아이콘·번역 빠짐 없음',
    async run(app) {
      const r = await app.run(`await T.sample('pop-firstlove'); const out = {};
        for (const m of ['file', 'edit', 'song', 'ai', 'play', 'view', 'help']) { A.api.openMenubarMenu(m); await T.popupReady('menu'); await T.sleep(120); const d = T.frameOf('menu').contentDocument; out[m] = { n: d.querySelectorAll('.menu-item').length, dots: T.missingIcons(d), raw: T.rawKeys(d) }; await T.reset(); }
        return out;`, 60000);
      for (const [m, v] of Object.entries(r)) { assert.ok(v.n >= 6, m); assert.equal(v.dots, 0, m); assert.deepEqual(v.raw, [], m); }
    },
  },
  {
    group: '모양', name: '영어로 바꾸면 화면 전체가 영어 (번역 빠짐 없음), 어두운 테마',
    async run(app) {
      const r = await app.run(`await T.sample('en-pop-love'); A.api.updateSettings({ language: 'en', theme: 'dark' }); await T.frames(3);
        const out = {}; for (const v of ['arrangement', 'roll', 'lyrics', 'sheet']) { A.actions.setView(v); await T.frames(2); out[v] = T.rawKeys(); }
        out.hangul = /[가-힣]/.test((document.querySelector('#menubar').textContent + document.querySelector('#tabs').textContent + document.querySelector('#right-panel').textContent).replaceAll('한국어', ''));
        A.api.updateSettings({ language: 'ko', theme: 'light' }); return out;`, 60000);
      for (const v of ['arrangement', 'roll', 'lyrics', 'sheet']) assert.deepEqual(r[v], [], v);
      assert.equal(r.hangul, false);
    },
  },
  {
    group: '패널', name: '패널 접기·펼치기, 왼쪽·오른쪽 탭, 문제 패널의 항목 → 대상 보기',
    async run(app) {
      const r = await app.run(`await T.sample('pop-firstlove'); const out = {};
        for (const id of ['leftPanel', 'rightPanel', 'bottomPanel']) { await A.run(id); await A.run(id); }
        for (const tab of ['compose', 'instruments', 'sections']) { document.querySelector('[data-left-tab="' + tab + '"]').click(); await T.frames(1); }
        for (const tab of ['song', 'section', 'track', 'notes', 'mix']) { document.querySelector('[data-editor-tab="' + tab + '"]').click(); await T.frames(1); }
        const s = A.state.doc.song; s.sections[1].lyrics.push('여기에 멜로디가 없는 새 줄 하나'); A.run('checkNow'); await T.frames(2);
        const row = document.querySelector('[data-problem]'); out.problem = Boolean(row); row?.click(); await T.frames(2);
        out.section = A.state.section === s.sections[1].id;
        out.dots = T.missingIcons(); out.raw = T.rawKeys();
        return out;`, 60000);
      assert.ok(r.problem && r.section);
      assert.equal(r.dots, 0);
      assert.deepEqual(r.raw, []);
    },
  },
];

/** Every command that does not leave the page (files, exit) once, with a song open: no page errors. */
export async function commandCases(app) {
  const ids = await app.run(`return Object.keys(A.commands);`);
  const skip = new Set(['exit', 'open', 'save', 'saveAs', 'importAny', 'exportAudio', 'exportStems', 'exportMidi', 'exportLyrics', 'exportLrc', 'exportChords', 'exportJson', 'pasteLyrics', 'copyLyrics', 'copyMessages', 'backgroundImage', 'userGuide', 'tutorialDoc', 'tutorialVideo', 'tutorial', 'aiCompose', 'aiWizard', 'aiLyrics', 'aiVariation', 'closeProject', 'new', 'recentFolders', 'paste']);
  return [{
    group: '명령', name: `명령 ${ids.length - skip.size}개를 하나씩 실행 (페이지 오류·남은 팝업 없음)`,
    async run(context) {
      const failed = [];
      for (const id of ids.filter((x) => !skip.has(x))) {
        try {
          await context.run(`if (!A.state.doc || A.state.showStart) await T.sample('pop-firstlove'); A.state.settings.confirmDelete = false; A.state.doc.markSaved(); await Promise.race([A.run(${JSON.stringify(id)}), T.sleep(1500)]); await T.sleep(60); A.actions.stopPlayback(); await T.reset(); return 1;`, 30000);
        } catch (error) { failed.push(`${id}: ${error.message.slice(0, 160)}`); }
        const logged = context.takeErrors();
        if (logged.length) failed.push(`${id}: ${logged[0].slice(0, 200)}`);
      }
      assert.deepEqual(failed, []);
    },
  }];
}
