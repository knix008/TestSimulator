import I18n from './i18n/i18n.js';
import { AudioEngine, defaultEffectSettings } from './audio/engine.js';
import { AudioRecorder } from './audio/recorder.js';
import { audioBufferToWav, saveWav, openAudioFilesWeb } from './audio/exporter.js';
import { isSupportedAudioFile, getExtension, formatListLabel } from './audio/formats.js';
import { EQ_BANDS, EQ_GAIN_MIN, EQ_GAIN_MAX, clampEqGain, defaultEqGains } from './audio/eq.js';
import { WaveformView, formatTime } from './ui/waveform.js';
import { SpectrumEqView } from './ui/spectrumEq.js';

const engine = new AudioEngine();
const recorder = new AudioRecorder(engine);

const state = {
  clips: [],
  activeId: null,
  loop: false
};

const els = {
  libraryList: document.getElementById('libraryList'),
  libraryEmpty: document.getElementById('libraryEmpty'),
  statusText: document.getElementById('statusText'),
  timeCurrent: document.getElementById('timeCurrent'),
  timeTotal: document.getElementById('timeTotal'),
  selectionInfo: document.getElementById('selectionInfo'),
  peakLabel: document.getElementById('peakLabel'),
  meterFillL: document.getElementById('meterFillL'),
  meterFillR: document.getElementById('meterFillR'),
  themeSelect: document.getElementById('themeSelect'),
  langSelect: document.getElementById('langSelect'),
  toneModal: document.getElementById('toneModal'),
  dropOverlay: document.getElementById('dropOverlay'),
  btnPlay: document.getElementById('btnPlay'),
  iconPlay: document.getElementById('iconPlay'),
  iconPause: document.getElementById('iconPause'),
  playLabel: document.getElementById('playLabel'),
  btnRecord: document.getElementById('btnRecord'),
  btnLoop: document.getElementById('btnLoop'),
  spectrum: document.getElementById('spectrum'),
  trackName: document.getElementById('trackName'),
  trackMeta: document.getElementById('trackMeta'),
  clipCount: document.getElementById('clipCount'),
  eqFaders: document.getElementById('eqFaders')
};

const waveform = new WaveformView(document.getElementById('waveform'), {
  onSeek: (t) => {
    engine.seek(t);
    updateTimeUi();
  },
  onSelect: (sel) => {
    engine.setSelection(sel);
    updateSelectionUi();
  }
});

const spectrumEq = new SpectrumEqView(els.spectrum, {
  gains: defaultEqGains(),
  onChange: (gains) => {
    syncEqFaders(gains);
    engine.setSettings({ ...readEffectsFromUi(), eqGains: gains });
  }
});

function setStatus(keyOrText, asKey = true) {
  els.statusText.textContent = asKey ? I18n.t(keyOrText) : keyOrText;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ses.theme', theme);
  els.themeSelect.value = theme;
  waveform.draw();
  spectrumEq.draw();
}

function uid() {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function activeClip() {
  return state.clips.find((c) => c.id === state.activeId) || null;
}

function renderLibrary() {
  const has = state.clips.length > 0;
  els.libraryEmpty.hidden = has;
  els.libraryList.hidden = !has;
  els.libraryList.innerHTML = '';
  if (els.clipCount) els.clipCount.textContent = String(state.clips.length);

  for (const clip of state.clips) {
    const item = document.createElement('div');
    item.className = `library-item${clip.id === state.activeId ? ' active' : ''}`;
    const fmt = (clip.format || getExtension(clip.name) || 'audio').toUpperCase();
    item.innerHTML = `
      <div class="wave-mini" aria-hidden="true">
        <i style="height:40%"></i><i style="height:70%"></i><i style="height:45%"></i><i style="height:85%"></i>
      </div>
      <div>
        <div class="name">${escapeHtml(clip.name)}</div>
        <div class="meta">${fmt} · ${I18n.t('duration')}: ${formatTime(clip.buffer.duration)}</div>
      </div>
    `;
    item.addEventListener('click', () => selectClip(clip.id));
    els.libraryList.appendChild(item);
  }
  updateTrackHeader();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function selectClip(id) {
  const clip = state.clips.find((c) => c.id === id);
  if (!clip) return;
  state.activeId = id;
  engine.setBuffer(clip.buffer);
  waveform.setBuffer(clip.buffer);
  els.timeTotal.textContent = formatTime(clip.buffer.duration);
  updateSelectionUi();
  updateTimeUi();
  renderLibrary();
  setPlayUi(false);
}

function updateTrackHeader() {
  const clip = activeClip();
  if (!clip) {
    els.trackName.textContent = I18n.t('noTrack');
    els.trackMeta.textContent = '—';
    return;
  }
  els.trackName.textContent = clip.name;
  els.trackMeta.textContent = `${formatTime(clip.buffer.duration)} · ${clip.buffer.numberOfChannels}ch · ${clip.buffer.sampleRate} Hz`;
}

function toArrayBuffer(data) {
  if (!data) return null;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (Array.isArray(data)) return new Uint8Array(data).buffer;
  return null;
}

async function importFiles(fileEntries) {
  if (!fileEntries?.length) return;
  setStatus('statusDecoding');
  try {
    await engine.ensureContext();
    let lastId = null;
    let imported = 0;
    const failed = [];

    for (const entry of fileEntries) {
      const name = entry.name || I18n.t('untitled');
      if (!isSupportedAudioFile(name, entry.mime || '')) {
        failed.push(name);
        continue;
      }
      try {
        const ab = toArrayBuffer(entry.buffer);
        const buffer = await engine.decodeArrayBuffer(ab, name);
        const clip = {
          id: uid(),
          name,
          buffer,
          sourcePath: entry.path || '',
          format: getExtension(name) || 'audio'
        };
        state.clips.unshift(clip);
        lastId = clip.id;
        imported += 1;
      } catch (err) {
        console.error(err);
        failed.push(name);
      }
    }

    if (lastId) await selectClip(lastId);

    if (imported > 0 && failed.length === 0) {
      setStatus('statusImported');
    } else if (imported > 0 && failed.length > 0) {
      setStatus(
        `${I18n.t('statusImportedPartial')} (${imported}/${imported + failed.length})`,
        false
      );
    } else {
      setStatus(
        `${I18n.t('statusUnsupportedFormat')}: ${formatListLabel()}`,
        false
      );
    }
  } catch (err) {
    console.error(err);
    setStatus('statusError');
  }
}

async function openAudio() {
  try {
    let files;
    if (window.electronAPI?.isElectron) {
      files = await window.electronAPI.openAudioFiles();
    } else {
      files = await openAudioFilesWeb();
    }
    await importFiles(files);
  } catch (err) {
    console.error(err);
    setStatus('statusError');
  }
}

async function saveActive() {
  const clip = activeClip();
  if (!clip) {
    setStatus('needAudio');
    return;
  }
  try {
    setStatus('statusDecoding');
    const rendered = await engine.renderOffline();
    const wav = audioBufferToWav(rendered);
    const base = clip.name.replace(/\.[^.]+$/, '') || 'export';
    const result = await saveWav(wav, `${base}_fx.wav`);
    setStatus(result?.ok ? 'saveSuccess' : 'saveFailed');
  } catch (err) {
    console.error(err);
    setStatus('saveFailed');
  }
}

async function togglePlay() {
  const clip = activeClip();
  if (!clip && !recorder.isRecording) {
    setStatus('needAudio');
    return;
  }
  await engine.ensureContext();

  if (engine.isPlaying) {
    engine.pause();
    setPlayUi(false);
    setStatus('statusReady');
  } else {
    await engine.play();
    setPlayUi(true);
    setStatus('statusPlaying');
  }
}

function stopPlayback() {
  engine.stop();
  setPlayUi(false);
  updateTimeUi();
  waveform.setPlayhead(engine.getCurrentTime());
  setStatus('statusReady');
}

function setPlayUi(playing) {
  els.iconPlay.hidden = playing;
  els.iconPause.hidden = !playing;
  const label = I18n.t(playing ? 'pause' : 'play');
  els.btnPlay.title = label;
  if (els.playLabel) {
    els.playLabel.textContent = label;
    els.playLabel.setAttribute('data-i18n', playing ? 'pause' : 'play');
  }
}

function clearSelection() {
  engine.setSelection(null);
  waveform.setSelection(null);
  updateSelectionUi();
}

async function toggleRecord() {
  try {
    if (recorder.isRecording) {
      const blob = await recorder.stop();
      els.btnRecord.classList.remove('active');
      if (blob) {
        const ab = await blob.arrayBuffer();
        const buffer = await engine.decodeArrayBuffer(ab);
        const clip = {
          id: uid(),
          name: `REC_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`,
          buffer,
          sourcePath: ''
        };
        state.clips.unshift(clip);
        await selectClip(clip.id);
        setStatus('statusRecorded');
      }
    } else {
      await engine.ensureContext();
      await recorder.start();
      els.btnRecord.classList.add('active');
      setStatus('statusRecording');
    }
  } catch (err) {
    console.error(err);
    els.btnRecord.classList.remove('active');
    setStatus(err?.name === 'NotAllowedError' ? 'micDenied' : 'statusError');
  }
}

function toggleLoop() {
  state.loop = !state.loop;
  engine.setLoop(state.loop);
  els.btnLoop.classList.toggle('active-toggle', state.loop);
}

function openToneModal() {
  els.toneModal.classList.add('open');
}

function closeToneModal() {
  els.toneModal.classList.remove('open');
}

async function createTone() {
  const type = document.getElementById('toneType').value;
  const frequency = Number(document.getElementById('toneFreq').value) || 440;
  const duration = Number(document.getElementById('toneDuration').value) || 2;
  await engine.ensureContext();
  const buffer = await engine.generateTone({ type, frequency, duration });
  const clip = {
    id: uid(),
    name: `${type}_${frequency}Hz_${duration}s.wav`,
    buffer,
    sourcePath: ''
  };
  state.clips.unshift(clip);
  await selectClip(clip.id);
  closeToneModal();
  setStatus('statusGenerated');
}

async function reviewClip() {
  const clip = activeClip();
  if (!clip) {
    setStatus('needAudio');
    return;
  }
  engine.stop();
  await engine.play(engine.selection ? engine.selection.start : 0);
  setPlayUi(true);
  setStatus('statusPlaying');
}

function readEffectsFromUi() {
  return {
    gainDb: Number(document.getElementById('fxGain').value),
    playbackRate: Number(document.getElementById('fxRate').value),
    filterType: document.getElementById('fxFilterType').value,
    filterFreq: Number(document.getElementById('fxFilterFreq').value),
    filterQ: Number(document.getElementById('fxFilterQ').value),
    delayTime: Number(document.getElementById('fxDelayTime').value),
    delayFeedback: Number(document.getElementById('fxDelayFeedback').value),
    delayMix: Number(document.getElementById('fxDelayMix').value),
    distortion: Number(document.getElementById('fxDistortion').value),
    reverbMix: Number(document.getElementById('fxReverbMix').value),
    reverbDecay: Number(document.getElementById('fxReverbDecay').value),
    eqGains: spectrumEq.getGains()
  };
}

function syncEqFaders(gains) {
  for (const band of EQ_BANDS) {
    const slider = document.getElementById(`eqSlider_${band.id}`);
    const value = document.getElementById(`eqVal_${band.id}`);
    const db = clampEqGain(gains[band.id] ?? 0);
    if (slider && Number(slider.value) !== db) slider.value = String(db);
    if (value) value.textContent = `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
  }
}

function buildEqFaders() {
  if (!els.eqFaders) return;
  els.eqFaders.innerHTML = '';
  for (const band of EQ_BANDS) {
    const wrap = document.createElement('div');
    wrap.className = 'eq-fader';
    wrap.innerHTML = `
      <button type="button" class="btn eq-up" data-band="${band.id}" aria-label="+">▲</button>
      <input type="range" class="eq-slider" id="eqSlider_${band.id}"
        min="${EQ_GAIN_MIN}" max="${EQ_GAIN_MAX}" step="0.1" value="0" orient="vertical" />
      <button type="button" class="btn eq-down" data-band="${band.id}" aria-label="-">▼</button>
      <span class="eq-value" id="eqVal_${band.id}">+0.0</span>
      <span class="eq-label">${band.label}</span>
    `;
    els.eqFaders.appendChild(wrap);

    const slider = wrap.querySelector('.eq-slider');
    slider.addEventListener('input', () => {
      const gains = spectrumEq.getGains();
      gains[band.id] = clampEqGain(Number(slider.value));
      spectrumEq.setGains(gains);
      syncEqFaders(gains);
      engine.setSettings({ ...readEffectsFromUi(), eqGains: gains });
    });
    wrap.querySelector('.eq-up').addEventListener('click', () => spectrumEq.nudge(band.id, 0.5));
    wrap.querySelector('.eq-down').addEventListener('click', () => spectrumEq.nudge(band.id, -0.5));
  }
}

function updateEffectLabels(s) {
  document.getElementById('valGain').textContent = `${s.gainDb.toFixed(1)} dB`;
  document.getElementById('valRate').textContent = `${s.playbackRate.toFixed(2)}×`;
  document.getElementById('valFilterFreq').textContent = `${Math.round(s.filterFreq)} Hz`;
  document.getElementById('valFilterQ').textContent = s.filterQ.toFixed(2);
  document.getElementById('valDelayTime').textContent = `${s.delayTime.toFixed(2)} s`;
  document.getElementById('valDelayFeedback').textContent = s.delayFeedback.toFixed(2);
  document.getElementById('valDelayMix').textContent = `${Math.round(s.delayMix * 100)}%`;
  document.getElementById('valDistortion').textContent = `${Math.round(s.distortion * 100)}%`;
  document.getElementById('valReverbMix').textContent = `${Math.round(s.reverbMix * 100)}%`;
  document.getElementById('valReverbDecay').textContent = `${s.reverbDecay.toFixed(2)} s`;
}

function bindEffects() {
  const ids = [
    'fxGain', 'fxRate', 'fxFilterType', 'fxFilterFreq', 'fxFilterQ',
    'fxDelayTime', 'fxDelayFeedback', 'fxDelayMix', 'fxDistortion',
    'fxReverbMix', 'fxReverbDecay'
  ];
  for (const id of ids) {
    document.getElementById(id).addEventListener('input', () => {
      const s = readEffectsFromUi();
      updateEffectLabels(s);
      engine.setSettings(s);
    });
  }
  document.getElementById('btnResetFx').addEventListener('click', () => {
    const s = defaultEffectSettings();
    document.getElementById('fxGain').value = s.gainDb;
    document.getElementById('fxRate').value = s.playbackRate;
    document.getElementById('fxFilterType').value = s.filterType;
    document.getElementById('fxFilterFreq').value = s.filterFreq;
    document.getElementById('fxFilterQ').value = s.filterQ;
    document.getElementById('fxDelayTime').value = s.delayTime;
    document.getElementById('fxDelayFeedback').value = s.delayFeedback;
    document.getElementById('fxDelayMix').value = s.delayMix;
    document.getElementById('fxDistortion').value = s.distortion;
    document.getElementById('fxReverbMix').value = s.reverbMix;
    document.getElementById('fxReverbDecay').value = s.reverbDecay;
    spectrumEq.reset();
    syncEqFaders(spectrumEq.getGains());
    updateEffectLabels(s);
    engine.resetSettings();
  });
  document.getElementById('btnResetEq')?.addEventListener('click', () => {
    spectrumEq.reset();
    syncEqFaders(spectrumEq.getGains());
    engine.setSettings(readEffectsFromUi());
  });
  updateEffectLabels(readEffectsFromUi());
}

function updateTimeUi() {
  els.timeCurrent.textContent = formatTime(engine.getCurrentTime());
  els.timeTotal.textContent = formatTime(engine.getDuration());
}

function updateSelectionUi() {
  if (engine.selection) {
    const { start, end } = engine.selection;
    els.selectionInfo.textContent = `${I18n.t('selection')}: ${formatTime(start)} – ${formatTime(end)}`;
  } else {
    els.selectionInfo.textContent = `${I18n.t('selection')}: ${I18n.t('noSelection')}`;
  }
}

function drawSpectrum() {
  const analyser = engine.getAnalyser();
  if (analyser) spectrumEq.setAnalyser(analyser);
  spectrumEq.draw();

  const peak = engine.getPeakLevel();
  const pct = `${Math.min(100, peak * 100)}%`;
  if (els.meterFillL) els.meterFillL.style.height = pct;
  if (els.meterFillR) els.meterFillR.style.height = `${Math.min(100, peak * 92)}%`;
  els.peakLabel.textContent = `${I18n.t('peak')} ${Math.round(peak * 100)}%`;
}

function animate() {
  if (engine.isPlaying) {
    const t = engine.getCurrentTime();
    waveform.setPlayhead(t);
    updateTimeUi();
  } else {
    waveform.setPlayhead(engine.getCurrentTime());
  }
  drawSpectrum();
  requestAnimationFrame(animate);
}

function bindDrop() {
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    els.dropOverlay.classList.add('visible');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      els.dropOverlay.classList.remove('visible');
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    els.dropOverlay.classList.remove('visible');
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => isSupportedAudioFile(f));
    const entries = [];
    for (const file of files) {
      entries.push({
        name: file.name,
        path: file.name,
        buffer: await file.arrayBuffer(),
        mime: file.type || ''
      });
    }
    if (!entries.length) {
      setStatus(`${I18n.t('statusUnsupportedFormat')}: ${formatListLabel()}`, false);
      return;
    }
    await importFiles(entries);
  });
}

function bindUi() {
  document.getElementById('btnImport').addEventListener('click', openAudio);
  document.getElementById('btnImportSide').addEventListener('click', openAudio);
  document.getElementById('btnTone').addEventListener('click', openToneModal);
  document.getElementById('btnToneSide').addEventListener('click', openToneModal);
  document.getElementById('btnSave').addEventListener('click', saveActive);
  document.getElementById('btnSaveTransport').addEventListener('click', saveActive);
  document.getElementById('btnReview').addEventListener('click', reviewClip);
  document.getElementById('btnReviewTransport')?.addEventListener('click', reviewClip);
  document.getElementById('btnPlay').addEventListener('click', togglePlay);
  document.getElementById('btnStop').addEventListener('click', stopPlayback);
  document.getElementById('btnRecord').addEventListener('click', toggleRecord);
  document.getElementById('btnLoop').addEventListener('click', toggleLoop);
  document.getElementById('btnZoomIn').addEventListener('click', () => waveform.zoomIn());
  document.getElementById('btnZoomOut').addEventListener('click', () => waveform.zoomOut());
  document.getElementById('btnClearSel')?.addEventListener('click', clearSelection);
  document.getElementById('toneCancel').addEventListener('click', closeToneModal);
  document.getElementById('toneCreate').addEventListener('click', createTone);
  els.toneModal.addEventListener('click', (e) => {
    if (e.target === els.toneModal) closeToneModal();
  });

  els.themeSelect.addEventListener('change', () => applyTheme(els.themeSelect.value));
  els.langSelect.addEventListener('change', async () => {
    await I18n.load(els.langSelect.value);
    document.title = I18n.t('appName');
    updateSelectionUi();
    renderLibrary();
    setPlayUi(engine.isPlaying);
    updateTrackHeader();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveActive();
    } else if (e.code === 'KeyO' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openAudio();
    }
  });

  if (window.electronAPI?.isElectron) {
    window.electronAPI.onMenuOpenAudio(openAudio);
    window.electronAPI.onMenuSaveAudio(saveActive);
  }

  bindDrop();
  bindEffects();
  engine.onEnded = () => {
    setPlayUi(false);
    setStatus('statusReady');
    updateTimeUi();
  };
}

async function init() {
  await I18n.init();
  els.langSelect.value = I18n.getLocale();
  document.title = I18n.t('appName');

  const savedTheme = localStorage.getItem('ses.theme') || 'dark';
  applyTheme(savedTheme);

  buildEqFaders();
  bindUi();
  updateSelectionUi();
  spectrumEq.resize();
  animate();
  setStatus('statusReady');
}

init();
