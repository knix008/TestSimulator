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
      assert.equal(r.samples, 40);
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
    group: G, name: '예제 40곡과 템플릿 15개가 모두 열림 (문제 패널에 오류·경고 없음)',
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
        for (const tab of ['general', 'start', 'appearance', 'font', 'background', 'audio', 'sounds', 'editor', 'ai', 'recent', 'shortcuts']) {
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
    group: '설정', name: 'AI 작곡 패널·마법사의 AI·모델 목록 → 설정에 바로 저장, 세 곳이 같은 값',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); A.state.leftTab = 'compose'; A.api.updateSettings({ aiProvider: 'builtin', aiModel: 'claude-opus-5-5', ollamaModels: [] });
        const pick = (which, value) => { const el = document.querySelector('[data-ai-pick="' + which + '"]'); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
        const builtinModel = !!document.querySelector('[data-ai-pick="model"]');
        pick('provider', 'claude'); await T.frames(2);
        const claudeModels = [...document.querySelectorAll('[data-ai-pick="model"] option')].map((o) => o.value);
        pick('model', 'claude-haiku-5-5'); await T.frames(2);
        const saved = JSON.parse(localStorage.getItem('myaudiomaker.settings.v1') ?? '{}');
        const status = document.querySelector('#statusbar, .statusbar')?.textContent ?? '';
        A.run('aiWizard'); await T.popupReady('compose', 8000); await T.until(() => T.frameOf('compose').contentDocument.querySelector('[data-ai-pick="model"]'), 8000, 'wizard picker');
        let d = T.frameOf('compose').contentDocument;
        const wizard = { provider: d.querySelector('[data-ai-pick="provider"]').value, model: d.querySelector('[data-ai-pick="model"]').value };
        const m = d.querySelector('[data-ai-pick="model"]'); m.value = 'claude-opus-5-5'; m.dispatchEvent(new Event('change', { bubbles: true })); await T.sleep(400);
        const fromWizard = A.state.settings.aiModel;
        await A.popups.close('compose');
        A.api.updateSettings({ aiProvider: 'ollama', ollamaModel: 'llama3.1', ollamaModels: ['qwen2.5:14b', 'llama3.1'] }); await T.frames(2);
        const ollamaModels = [...document.querySelectorAll('[data-ai-pick="model"] option')].map((o) => o.value);
        pick('model', 'qwen2.5:14b'); await T.frames(2);
        const ollamaPicked = A.state.settings.ollamaModel;
        A.api.updateSettings({ aiProvider: 'builtin', ollamaModel: 'llama3.1', ollamaModels: [], aiModel: 'claude-opus-5-5' });
        return { builtinModel, claudeModels, saved: [saved.aiProvider, saved.aiModel], status, wizard, fromWizard, ollamaModels, ollamaPicked, dots: T.missingIcons() };`, 60000);
      assert.equal(r.builtinModel, false, 'the built-in writer has no model list');
      for (const m of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'custom']) assert.ok(r.claudeModels.includes(m), m);
      assert.deepEqual(r.saved, ['claude', 'claude-haiku-5-5'], 'saved in the settings at once');
      assert.deepEqual(r.wizard, { provider: 'claude', model: 'claude-haiku-5-5' }, 'the wizard shows the same choice');
      assert.equal(r.fromWizard, 'claude-opus-5-5', 'a choice in the wizard reaches the main window');
      assert.deepEqual(r.ollamaModels.sort(), ['llama3.1', 'qwen2.5:14b']);
      assert.equal(r.ollamaPicked, 'qwen2.5:14b');
      assert.equal(r.dots, 0, 'icons');
    },
  },
  {
    group: '설정', name: 'AI 가 실패하면 내장 작사기로 대신 (경고 알림), 끄면 오류 창·곡 그대로',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); A.state.doc.markSaved();
        A.api.updateSettings({ aiProvider: 'ollama', ollamaUrl: 'http://127.0.0.1:9', aiFallback: true, aiTimeout: 60 }, { quiet: true });
        const before = A.state.doc.song.title;
        const d1 = await A.run('aiCompose'); await T.sleep(300);
        const fell = { provider: A.state.doc.song.ai.provider, changed: A.state.doc.song.title !== before || A.state.doc !== d1 };
        const warned = A.state.log.some((m) => /내장 작사기로 만들었습니다|built-in writer made it/.test(JSON.stringify(m)));
        return { fell, warned: Boolean(warned) };`, 120000);
      // The request to the closed port is expected to fail; nothing else may.
      const expected = (text) => /127\.0\.0\.1:9|Failed to fetch|ERR_CONNECTION_REFUSED|ERR_UNSAFE_PORT|error\.compose/.test(String(text));
      const first = app.takeErrors();
      assert.deepEqual(first.filter((e) => !expected(e)), [], 'no other page errors');
      assert.equal(r.fell.provider, 'builtin', 'the built-in writer made the song');
      assert.ok(r.warned, 'a warning says why');
      const off = await app.run(`A.state.doc.markSaved();
        A.api.updateSettings({ aiFallback: false }, { quiet: true });
        const doc = A.state.doc;
        await A.run('aiCompose'); await T.sleep(400);
        const errorOpen = A.popups.isOpen('error');
        await A.popups.close('error');
        const same = A.state.doc === doc;
        A.api.updateSettings({ aiProvider: 'builtin', ollamaUrl: 'http://localhost:11434', aiFallback: true, aiTimeout: 180 }, { quiet: true });
        return { errorOpen, same };`, 120000);
      const second = app.takeErrors();
      assert.deepEqual(second.filter((e) => !expected(e)), [], 'no other page errors');
      assert.ok(off.errorOpen, 'without the fallback the error window opens');
      assert.ok(off.same, 'and the open song stays');
    },
  },
  {
    group: G, name: '프로그램 이름·정보 카드는 고정: 손잡이·크기 조절 없음, 다른 카드를 맨 위에 둬도 그 아래',
    async run(app) {
      const r = await app.run(`await T.reset({ song: false });
        A.api.updateSettings({ startLayout: { version: 2, cards: { hero: { col: 1, row: 30, w: 1, h: 4, fit: false }, recent: { col: 0, row: 0, w: 1, h: 10, fit: true } } } }, { quiet: true });
        A.actions.showStartPage(true); await T.frames(6); await T.sleep(300);
        const hero = document.querySelector('.start-card[data-card="hero"]');
        const box = (el) => el.getBoundingClientRect();
        const cards = [...document.querySelectorAll('.start-board > .start-card')];
        const h = box(hero); const board = box(document.querySelector('.start-board'));
        const result = { handle: !!hero.querySelector('[data-card-handle]'), corner: !!hero.querySelector('[data-card-resize]'), others: document.querySelectorAll('[data-card-handle]').length,
          top: cards.every((c) => c === hero || box(c).top >= h.bottom - 1), full: Math.abs(h.width - board.width) < 2 };
        A.api.updateSettings({ startLayout: null }, { quiet: true });
        return result;`);
      assert.equal(r.handle, false, 'no move handle');
      assert.equal(r.corner, false, 'no resize corner');
      assert.ok(r.others >= 6, 'the other cards still move');
      assert.ok(r.top, 'every other card is below it');
      assert.ok(r.full, 'it spans the whole board');
    },
  },
  {
    group: '패널', name: '속성 탭(곡·구간·트랙·음표·믹스): 라벨 열·값 열이 한 줄로 맞음, 머리말·버튼 줄은 전체 폭',
    async run(app) {
      const r = await app.run(`await T.fresh('pop');
        const out = {};
        for (const tab of ['song', 'section', 'track', 'mix']) {
          document.querySelector('[data-editor-tab="' + tab + '"]').click(); await T.frames(3);
          const props = document.querySelector('#editors .props');
          const left = props.getBoundingClientRect().left;
          const labels = [...props.querySelectorAll(':scope > .prop-row > .prop-label')].map((e) => Math.round(e.getBoundingClientRect().left));
          const controls = [...props.querySelectorAll(':scope > .prop-row > .prop-control')].map((e) => Math.round(e.getBoundingClientRect().left));
          const wide = [...props.children].filter((e) => !e.classList.contains('prop-row')).map((e) => Math.round(e.getBoundingClientRect().width));
          out[tab] = { labels: [...new Set(labels)].length, controls: [...new Set(controls)].length, rows: labels.length, labelRight: Math.max(...labels) < Math.min(...controls), wideMin: wide.length ? Math.min(...wide) : null, inner: Math.round(props.clientWidth - 20) };
        }
        return out;`);
      for (const [tab, v] of Object.entries(r)) {
        assert.ok(v.rows >= 2, `${tab}: rows`);
        assert.equal(v.labels, 1, `${tab}: every label starts in one column`);
        assert.equal(v.controls, 1, `${tab}: every control starts in one column`);
        assert.ok(v.labelRight, `${tab}: labels left of the controls`);
        if (v.wideMin != null) assert.ok(v.wideMin >= v.inner - 4, `${tab}: headers and button rows take the whole width (${v.wideMin} of ${v.inner})`);
      }
    },
  },
  {
    group: '패널', name: '오른쪽 패널은 가로로 스크롤되지 않음 (모든 탭, 가장 좁은 폭·기본 폭·넓은 폭, 음표 선택 시)',
    async run(app) {
      const r = await app.run(`await T.fresh('pop');
        const { PANEL_MIN } = await import('/src/domain/settings.js').catch(() => ({ PANEL_MIN: null }));
        const widths = [PANEL_MIN?.right ?? 260, 340, 520];
        const out = [];
        for (const w of widths) {
          A.api.updateSettings({ rightWidth: w, showRightPanel: true }); await T.frames(3);
          for (const tab of ['song', 'section', 'track', 'notes', 'mix']) {
            if (tab === 'notes') { A.actions.setView('roll'); await T.frames(2); A.run('selectAll'); await T.frames(2); }
            document.querySelector('[data-editor-tab="' + tab + '"]').click(); await T.frames(3);
            const panel = document.querySelector('#right-panel');
            const pr = panel.getBoundingClientRect();
            const scrolls = [...panel.querySelectorAll('*'), panel].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && !['hidden', 'clip'].includes(getComputedStyle(e).overflowX)).map((e) => (e.id || e.className) + ' ' + e.clientWidth + '<' + e.scrollWidth);
            const sticking = [...panel.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > pr.right + 1; }).slice(0, 3).map((e) => e.tagName + '.' + e.className);
            if (scrolls.length || sticking.length) out.push({ w, tab, scrolls: scrolls.slice(0, 3), sticking });
          }
          A.actions.setView('arrangement');
        }
        A.api.updateSettings({ rightWidth: 340 });
        return out;`, 60000);
      assert.deepEqual(r, [], 'nothing in the right panel is wider than the panel');
    },
  },
  {
    group: '가사', name: '가사 화면: 구간마다 멜로디 악보(음표 아래 음절)가 가사 위에, 악보 버튼으로 숨기기·보이기',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); await A.actions.openSampleAsk(A.domain.SAMPLES[0].id); A.actions.setView('lyrics'); await T.frames(4);
        const cards = [...document.querySelectorAll('.lyric-card')];
        const withStaff = cards.filter((c) => c.querySelector('.lyric-staff svg'));
        const sungCards = cards.filter((c) => c.querySelector('textarea').value.trim());
        const syllables = Math.min(...sungCards.map((c) => c.querySelector('.lyric-staff svg')?.querySelectorAll('text.ly').length ?? 0));
        const fits = withStaff.every((c) => c.querySelector('svg').getBoundingClientRect().width <= c.getBoundingClientRect().width + 1);
        document.querySelector('[data-lyrics-staff-toggle]').click(); await T.frames(3);
        const hidden = document.querySelectorAll('.lyric-staff').length;
        document.querySelector('[data-lyrics-staff-toggle]').click(); await T.frames(3);
        return { withStaff: withStaff.length, sung: sungCards.length, syllables, fits, hidden, back: document.querySelectorAll('.lyric-staff').length, setting: A.state.settings.lyricsStaff };`);
      assert.ok(r.withStaff >= r.sung && r.sung > 3, `every sung section has a staff (${r.withStaff} / ${r.sung})`);
      assert.ok(r.syllables > 5, 'syllables under the notes');
      assert.ok(r.fits, 'no staff is wider than its card');
      assert.equal(r.hidden, 0, 'the Staff button hides them');
      assert.equal(r.back, r.withStaff, 'and shows them again');
      assert.equal(r.setting, true);
    },
  },
  {
    group: '보기', name: '리드 시트: 쉼표·빔·붙임줄, 모든 음절이 음표 아래 (겹침 없음)',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); await A.actions.openSampleAsk(A.domain.SAMPLES[0].id); A.actions.setView('sheet'); await T.frames(4);
        const svg = document.querySelector('.view-sheet svg');
        const lines = [...svg.querySelectorAll('g.sheet-line')];
        let overlaps = 0;
        for (const line of lines) {
          const boxes = [...line.querySelectorAll('text.ly')].map((t) => t.getBoundingClientRect()).sort((a, b) => a.left - b.left);
          for (let i = 1; i < boxes.length; i++) if (boxes[i].left < boxes[i - 1].right - 1) overlaps++;
        }
        const sung = A.state.doc.song.tracks.find((t) => t.role === 'vocal').notes.filter((n) => n.syl).length;
        return { lines: lines.length, overlaps, syllables: svg.querySelectorAll('text.ly').length, sung, ties: [...svg.querySelectorAll('g.nt path')].filter((p) => /Q/.test(p.getAttribute('d'))).length, beams: svg.querySelectorAll('rect').length };`);
      assert.ok(r.lines > 8);
      assert.equal(r.overlaps, 0, 'no syllable runs into the next');
      assert.ok(r.syllables >= r.sung * 0.95, `the syllables are on the sheet (${r.syllables} / ${r.sung})`);
      assert.ok(r.beams > 20, 'beams and rests are drawn');
    },
  },
  {
    group: '편곡', name: '보컬 트랙에 음표와 가사(줄 또는 음절), 설정으로 끄면 보통 트랙',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); await A.actions.openSampleAsk(A.domain.SAMPLES[0].id); A.actions.setView('arrangement'); await T.frames(3);
        const vocalId = A.state.doc.song.tracks.find((t) => t.role === 'vocal').id;
        const head = () => document.querySelector('.arr-head[data-track="' + vocalId + '"]');
        const other = document.querySelector('.arr-head:not([data-track="' + vocalId + '"])');
        const on = { vocal: head().getBoundingClientRect().height, other: other.getBoundingClientRect().height, cls: head().classList.contains('lyric-lane') };
        // The lane under the vocal head is still the vocal track (clicks find the right lane).
        const body = document.querySelector('.arr-body').getBoundingClientRect();
        const hb = head().getBoundingClientRect();
        const lane = A.arrangement.laneAt(hb.top + hb.height - 4)?.id === vocalId && A.arrangement.laneAt(other.getBoundingClientRect().top + 4)?.id === other.dataset.track;
        A.api.updateSettings({ vocalLaneLyrics: false }); await T.frames(3);
        const off = head().getBoundingClientRect().height;
        A.api.updateSettings({ vocalLaneLyrics: true }); await T.frames(2);
        return { on, off, lane, bodyTop: Math.round(body.top) };`);
      assert.ok(r.on.cls, 'the vocal lane shows lyrics');
      assert.ok(r.on.vocal > r.on.other + 30, `taller for the words (${r.on.vocal} vs ${r.on.other})`);
      assert.ok(r.lane, 'clicks still find the right lanes');
      assert.equal(r.off, r.on.other, 'turned off: an ordinary lane');
    },
  },
  {
    group: '재생', name: '가사 따라 보기: 재생 중 지금 부르는 줄, 부른 음절이 차례로 표시되고 멈추면 사라짐',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); await A.actions.openSampleAsk(A.domain.SAMPLES[0].id); A.actions.setView('lyrics'); await T.frames(2);
        A.actions.seek(34); await A.actions.play();
        const seen = [];
        for (let i = 0; i < 5; i++) { await T.sleep(450); const ks = [...document.querySelectorAll('.karaoke .ks')]; seen.push({ sung: ks.filter((e) => e.classList.contains('sung')).length, of: ks.length, shown: !document.querySelector('.karaoke').hidden, lit: document.querySelectorAll('.view-lyrics g.nt.now').length }); }
        A.actions.stopPlayback(); await T.sleep(200);
        const hiddenAfter = document.querySelector('.karaoke').hidden;
        A.api.updateSettings({ karaoke: false }, { quiet: true }); await A.actions.play(); await T.sleep(500);
        const offShown = !document.querySelector('.karaoke').hidden; A.actions.stopPlayback();
        A.api.updateSettings({ karaoke: true }, { quiet: true });
        return { seen, hiddenAfter, offShown };`, 60000);
      assert.ok(r.seen.every((s) => s.shown && s.of > 3), 'the line is shown while playing');
      const sung = r.seen.map((s) => s.sung);
      assert.ok(sung[sung.length - 1] > sung[0], `syllables are lit one after another (${sung})`);
      assert.ok(r.seen.some((s) => s.lit > 0), 'the note being sung lights on the staff');
      assert.ok(r.hiddenAfter, 'hidden after stopping');
      assert.equal(r.offShown, false, 'turned off: not shown');
    },
  },
  {
    group: 'AI 음성', name: '설정 › AI 음성 탭: 엔진·음성 뱅크(TIGER 받기·다시 받기)·가져오기·품질, 아이콘·번역 빠짐 없음',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); A.popups.open('settings', { tab: 'voice' }); await T.popupReady('settings');
        await T.until(() => /TIGER/i.test(T.frameOf('settings').contentDocument.querySelector('.popup-body')?.textContent ?? ''), 10000, 'voice banks listed');
        const d = T.frameOf('settings').contentDocument;
        const actions = [...d.querySelectorAll('[data-action^="voice-"]')].map((b) => b.dataset.action);
        const text = d.querySelector('.popup-body').textContent;
        const out = { actions: [...new Set(actions)], dots: d.querySelectorAll('svg[data-icon="dot"]').length, raw: (text.match(/\\b(voice|settings|sounds)\\.[a-zA-Z.]+/g) ?? []), hasTiger: /TIGER/i.test(text) };
        await A.popups.close('settings');
        return out;`);
      assert.ok(r.hasTiger, 'the TIGER bank is listed');
      for (const a of ['voice-test']) assert.ok(r.actions.includes(a), `${a} button (${r.actions})`);
      assert.ok(r.actions.some((a) => /download|redownload/.test(a)), `a download / re-download button (${r.actions})`);
      assert.ok(r.actions.some((a) => /import/.test(a)), 'an import button');
      assert.equal(r.dots, 0, 'icons');
      assert.deepEqual(r.raw, [], 'untranslated keys');
    },
  },
  {
    group: 'AI 음성', name: 'AI 음성으로 재생: 라이선스에 동의하지 않았으면 설정 › AI 음성(라이선스)을 열고 가이드 보컬로 재생 (다운로드 없음)',
    async run(app) {
      const r = await app.run(`await T.fresh('pop'); await A.actions.openSampleAsk(A.domain.SAMPLES[0].id);
        const v = await import('/src/audio/singer/index.js'); await v.acceptLicence('tiger', false);
        A.api.updateSettings({ voiceEngine: 'ai', voiceBank: 'tiger' }, { quiet: true });
        A.run('play');
        await T.until(() => A.state.playing, 30000, 'playing');
        const playing = A.state.playing; const tr = A.state.doc.song.tracks.find((t) => t.role === 'vocal');
        const ai = A.player.hasVocal(tr.id); A.actions.stopPlayback();
        const settingsOpen = A.popups.isOpen('settings');
        await A.popups.close('settings');
        const told = A.state.log.some((m) => /라이선스|licence/.test(m.text ?? ''));
        A.api.updateSettings({ voiceEngine: 'guide' }, { quiet: true });
        return { playing, ai, settingsOpen, told };`, 60000);
      assert.ok(r.settingsOpen, 'Settings › Voice opened for the licence');
      assert.ok(r.told, 'a notice explains why');
      assert.ok(r.playing, 'it still plays');
      assert.equal(r.ai, false, 'with the guide voice');
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
