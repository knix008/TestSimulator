const YT_ID_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(YT_ID_RE);
  return m ? m[1] : null;
}

export function isYouTubeUrl(input) {
  return Boolean(extractYouTubeId(input));
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.__ytApiPromise) return window.__ytApiPromise;

  window.__ytApiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const existing = document.querySelector('script[data-yt-api]');
    if (existing) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.dataset.ytApi = '1';
    tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
    document.head.appendChild(tag);
    // If API already loaded by cache
    const started = Date.now();
    const poll = setInterval(() => {
      if (window.YT?.Player) {
        clearInterval(poll);
        resolve(window.YT);
      } else if (Date.now() - started > 15000) {
        clearInterval(poll);
        reject(new Error('YouTube API load timeout'));
      }
    }, 50);
  });

  return window.__ytApiPromise;
}

export class YouTubePlayerController {
  /**
   * @param {HTMLElement} container
   * @param {{
   *  onStateChange?: (state: string, data: any) => void,
   *  onReady?: () => void,
   *  onError?: (message: string) => void,
   *  onTime?: (current: number, duration: number) => void
   * }} handlers
   */
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.player = null;
    this.videoId = null;
    this.title = '';
    this._tick = 0;
    this._ready = false;
    this._volume = 80;
    this._muted = false;
  }

  get active() {
    return Boolean(this.player && this.videoId);
  }

  async load(videoId, { autoplay = true, startVolume = 80 } = {}) {
    this.videoId = videoId;
    this._volume = startVolume;
    this.container.classList.remove('hidden');
    this.container.innerHTML = '';
    const host = document.createElement('div');
    host.id = `ytPlayerHost_${Date.now()}`;
    this.container.appendChild(host);

    const YT = await loadYouTubeApi();
    const origin = window.location.protocol === 'http:' || window.location.protocol === 'https:'
      ? window.location.origin
      : undefined;
    await new Promise((resolve, reject) => {
      this.player = new YT.Player(host.id, {
        width: '100%',
        height: '100%',
        videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          ...(origin ? { origin } : {})
        },
        events: {
          onReady: (e) => {
            this._ready = true;
            try {
              e.target.setVolume(this._volume);
              if (this._muted) e.target.mute();
              this.title = e.target.getVideoData?.()?.title || this.title || videoId;
            } catch { /* ignore */ }
            // Keep keyboard focus in the app so Space can pause/resume.
            try {
              const iframe = this.container.querySelector('iframe');
              if (iframe) {
                iframe.setAttribute('tabindex', '-1');
                iframe.addEventListener('focus', () => {
                  iframe.blur();
                  document.getElementById('videoWrap')?.focus?.();
                });
              }
            } catch { /* ignore */ }
            this.handlers.onReady?.(this);
            this._startTick();
            resolve();
          },
          onStateChange: (e) => {
            const map = {
              [-1]: 'unstarted',
              0: 'ended',
              1: 'playing',
              2: 'paused',
              3: 'buffering',
              5: 'cued'
            };
            const state = map[e.data] ?? 'unknown';
            try {
              const data = e.target.getVideoData?.();
              if (data?.title) this.title = data.title;
            } catch { /* ignore */ }
            this.handlers.onStateChange?.(state, e.data);
          },
          onError: (e) => {
            const messages = {
              2: 'Invalid YouTube video id',
              5: 'HTML5 player error',
              100: 'Video not found or private',
              101: 'Embedding disabled by owner',
              150: 'Embedding disabled by owner'
            };
            this.handlers.onError?.(messages[e.data] || `YouTube error ${e.data}`);
            reject(new Error(messages[e.data] || `YouTube error ${e.data}`));
          }
        }
      });
    });
  }

  destroy() {
    this._stopTick();
    try {
      this.player?.destroy?.();
    } catch { /* ignore */ }
    this.player = null;
    this.videoId = null;
    this._ready = false;
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
  }

  play() {
    this.player?.playVideo?.();
  }

  pause() {
    this.player?.pauseVideo?.();
  }

  stop() {
    this.player?.stopVideo?.();
  }

  seekTo(seconds) {
    this.player?.seekTo?.(seconds, true);
  }

  seekBy(delta) {
    const cur = this.getCurrentTime();
    this.seekTo(Math.max(0, cur + delta));
  }

  setVolume(percent) {
    this._volume = Math.max(0, Math.min(100, percent));
    this.player?.setVolume?.(this._volume);
    if (this._volume === 0) this.mute();
    else if (this._muted) this.unmute();
  }

  mute() {
    this._muted = true;
    this.player?.mute?.();
  }

  unmute() {
    this._muted = false;
    this.player?.unMute?.();
  }

  isMuted() {
    return this._muted || Boolean(this.player?.isMuted?.());
  }

  getCurrentTime() {
    try {
      return this.player?.getCurrentTime?.() || 0;
    } catch {
      return 0;
    }
  }

  getDuration() {
    try {
      return this.player?.getDuration?.() || 0;
    } catch {
      return 0;
    }
  }

  isPlaying() {
    try {
      return this.player?.getPlayerState?.() === 1;
    } catch {
      return false;
    }
  }

  setPlaybackRate(rate) {
    try {
      const wanted = Number(rate) || 1;
      const available = this.player?.getAvailablePlaybackRates?.() || [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      const nearest = available.reduce((best, cur) =>
        Math.abs(cur - wanted) < Math.abs(best - wanted) ? cur : best
      , available[0]);
      this.player?.setPlaybackRate?.(nearest);
    } catch { /* ignore */ }
  }

  _startTick() {
    this._stopTick();
    this._tick = window.setInterval(() => {
      if (!this._ready) return;
      this.handlers.onTime?.(this.getCurrentTime(), this.getDuration());
    }, 250);
  }

  _stopTick() {
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = 0;
    }
  }
}
