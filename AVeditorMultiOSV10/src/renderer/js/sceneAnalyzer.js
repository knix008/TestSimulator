import { loadOllamaSettings, isLikelyVlmModel } from './ollamaSettings.js';

/**
 * Analyze an entire media timeline in small steps:
 * seek → capture one JPEG → Ollama VLM → append one JSONL line → discard frame.
 */
export class SceneAnalyzer {
  constructor({ preview, i18n }) {
    this.preview = preview;
    this.i18n = i18n;
    this._cancelled = false;
    this._running = false;
  }

  get running() {
    return this._running;
  }

  cancel() {
    this._cancelled = true;
  }

  /**
   * @param {object} opts
   * @param {string} opts.outPath
   * @param {(p:{percent:number,label:string,index:number,total:number})=>void} [opts.onProgress]
   * @param {object} [opts.settings]
   * @param {object} [opts.sourceMeta]  { name, path }
   */
  async run({ outPath, onProgress, settings, sourceMeta } = {}) {
    if (this._running) throw new Error('Analysis already running');
    const api = window.electronAPI;
    if (!api?.ollamaChat || !api?.writeTextFile) {
      throw new Error(this.i18n.t('ollama.unavailable'));
    }

    const cfg = settings || loadOllamaSettings();
    if (!cfg.model) throw new Error(this.i18n.t('ollama.modelRequired'));

    const media = this.preview.mediaEl;
    if (!media) throw new Error(this.i18n.t('ollama.noMedia'));

    const duration = Number(media.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(this.i18n.t('ollama.noDuration'));
    }

    const interval = Math.max(0.5, Number(cfg.intervalSec) || 2);
    const times = [];
    for (let t = 0; t < duration; t += interval) times.push(Number(t.toFixed(3)));
    if (times.length === 0 || times[times.length - 1] < duration - 0.05) {
      times.push(Number(Math.max(0, duration - 0.05).toFixed(3)));
    }

    const wasPlaying = !media.paused;
    if (wasPlaying) media.pause();

    this._running = true;
    this._cancelled = false;

    const locale = (this.i18n.getLocale?.() || 'en') === 'ko' ? 'ko' : 'en';
    const systemPrompt = locale === 'ko'
      ? 'You are a media scene describer. Always write the entire answer in Korean (한국어) only. Do not use English except for proper nouns.'
      : 'You are a media scene describer. Always write the entire answer in English only. Do not use Korean or other languages except for proper nouns.';
    const prompt = locale === 'ko'
      ? [
          '언어: 반드시 한국어로만 답하세요.',
          '이 영상/오디오 장면을 1~3문장으로 구체적으로 설명하세요.',
          '보이는 대상, 행동, 장소, 분위기를 포함하세요. 추측은 짧게 표시하세요.',
          '영어 문장으로 답하지 마세요.',
        ].join(' ')
      : [
          'Language: Respond in English only.',
          'Describe this media scene in 1–3 concrete sentences.',
          'Include subjects, actions, place, and mood. Mark guesses briefly.',
          'Do not answer in Korean or any other language.',
        ].join(' ');

    const meta = {
      type: 'meta',
      version: 1,
      language: locale,
      source: sourceMeta || {
        name: this.preview.currentFile?.name || null,
        path: this.preview.currentFile?.path || null,
      },
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      intervalSec: interval,
      duration,
      totalScenes: times.length,
      vlmHint: isLikelyVlmModel(cfg.model),
      startedAt: new Date().toISOString(),
    };

    try {
      // Fresh file — then append one scene at a time (low memory).
      let w = await api.writeTextFile(outPath, `${JSON.stringify(meta)}\n`, { append: false });
      if (!w?.ok) throw new Error(w?.error || 'Failed to create analysis file');

      for (let i = 0; i < times.length; i += 1) {
        if (this._cancelled) {
          await api.writeTextFile(
            outPath,
            `${JSON.stringify({
              type: 'cancelled',
              atIndex: i,
              completedAt: new Date().toISOString(),
            })}\n`,
            { append: true }
          );
          onProgress?.({
            percent: Math.round((i / times.length) * 100),
            label: this.i18n.t('ollama.cancelled'),
            index: i,
            total: times.length,
          });
          return { ok: false, cancelled: true, outPath, count: i };
        }

        const start = times[i];
        const end = i + 1 < times.length ? times[i + 1] : duration;
        const percent = Math.round((i / times.length) * 100);
        onProgress?.({
          percent,
          label: this.i18n.t('ollama.analyzingScene', {
            current: i + 1,
            total: times.length,
            time: formatTime(start),
          }),
          index: i,
          total: times.length,
        });

        let imageBase64 = null;
        try {
          imageBase64 = await this.preview.captureFrameBase64(start, {
            maxWidth: 768,
            quality: 0.72,
          });
        } catch {
          imageBase64 = null;
        }

        const scenePrompt = imageBase64
          ? prompt
          : (locale === 'ko'
            ? `언어: 반드시 한국어로만 답하세요. 시각 프레임이 없는 오디오 구간입니다(시작 ${start}초). 가능한 범위에서 이 구간의 내용을 추정해 짧게 설명하세요. 확신이 없으면 모른다고 하세요. 영어 문장으로 답하지 마세요.`
            : `Language: English only. This is an audio-only segment (start ${start}s) with no video frame. Briefly describe what you can infer; say if unknown. Do not answer in Korean.`);

        const chat = await api.ollamaChat({
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          system: systemPrompt,
          prompt: scenePrompt,
          images: imageBase64 ? [imageBase64] : [],
          timeoutMs: 180000,
        });

        // Drop frame buffer immediately.
        imageBase64 = null;

        const record = {
          type: 'scene',
          index: i,
          start,
          end: Number(end.toFixed(3)),
          language: locale,
          description: chat?.ok ? String(chat.content || '').trim() : null,
          error: chat?.ok ? null : (chat?.error || 'Ollama error'),
          model: cfg.model,
          at: new Date().toISOString(),
        };

        w = await api.writeTextFile(outPath, `${JSON.stringify(record)}\n`, { append: true });
        if (!w?.ok) throw new Error(w?.error || 'Failed to append analysis');

        // Yield so UI can paint progress / stay responsive.
        await new Promise((r) => setTimeout(r, 0));
      }

      await api.writeTextFile(
        outPath,
        `${JSON.stringify({
          type: 'done',
          total: times.length,
          completedAt: new Date().toISOString(),
        })}\n`,
        { append: true }
      );

      onProgress?.({
        percent: 100,
        label: this.i18n.t('ollama.done'),
        index: times.length,
        total: times.length,
      });

      return { ok: true, cancelled: false, outPath, count: times.length };
    } finally {
      this._running = false;
      this._cancelled = false;
    }
  }
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}
