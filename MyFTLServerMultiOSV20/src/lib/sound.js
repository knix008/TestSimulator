// Short Web Audio cues for "server started" and "error" (the WinForms
// original used Console.Beep). Off when the setting says so.
let enabled = true;
let ctx = null;

export function setSoundsEnabled(v) { enabled = !!v; }

function tone(freq, ms, when = 0, type = 'sine', gain = 0.08) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(ctx.destination);
    const t0 = ctx.currentTime + when;
    o.start(t0); o.stop(t0 + ms / 1000);
  } catch { /* no audio */ }
}

export function playSuccess() { if (enabled) { tone(660, 90); tone(880, 120, 0.1); } }
export function playError() { if (enabled) { tone(220, 160, 0, 'square', 0.05); tone(180, 200, 0.16, 'square', 0.05); } }
