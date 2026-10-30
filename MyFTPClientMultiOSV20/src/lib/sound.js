// Success / error beeps (the original used Console.Beep — audible even with
// the Windows sound scheme set to "none"). Web Audio works in both hosts.
let ctx = null;
let enabled = true;

export function setSoundsEnabled(on) { enabled = !!on; }

function beep(freq, ms, at) {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.04;
    osc.connect(gain).connect(ctx.destination);
    const t0 = ctx.currentTime + at / 1000;
    osc.start(t0);
    osc.stop(t0 + ms / 1000);
  } catch { /* no audio device */ }
}

export function playSuccess() { if (!enabled) return; beep(880, 120, 0); beep(1100, 150, 130); }
export function playError() { if (!enabled) return; beep(440, 350, 0); }
