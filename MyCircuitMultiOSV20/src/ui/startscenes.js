// Start page backgrounds (25, a full 5 × 5 grid), each showing something
// different: 11 views of a sample board in 3D (orbit, X-ray, copper only,
// close-up, bare board, measured, floating parts, underside, low angle, no
// mask, side view), 12 animated drawings (startbg2d.js), a picture and a plain
// backdrop.
//
//   3D:  file, sky [top, bottom], view, motion, opts (viewer options), zoom
//   2D:  kind (a startbg2d.js scene), file for the schematic / PCB ones
//   motion: "orbit" turns round the board, "swing" sways left and right,
//           "tilt" rocks up and down while turning, "top" spins seen from
//           above, "wave" sways and rocks, "drift" sways gently, "still"
//           does not move. The picture pans and zooms slowly and the plain
//           backdrop has a drifting glow, so the speed applies to every scene.

export const START_SCENES = [
  // 3D: a sample board, each scene shows it differently.
  { id: "arduino", name: ["아두이노 회전", "Arduino orbit"], file: "08-arduino-minimal.mycircuit", sky: ["#2a3a55", "#0d131d"], view: "iso", motion: "orbit" },
  { id: "xray", name: ["X-ray 기판", "X-ray board"], file: "11-four-layer-attiny.mycircuit", sky: ["#0d2a3a", "#02080d"], view: "iso", motion: "swing", opts: { transparentBoard: true } },
  { id: "copper", name: ["구리 배선", "Copper art"], file: "09-usb-uart-ch340.mycircuit", sky: ["#1c1408", "#060402"], view: "top", motion: "top", opts: { components: false, soldermask: false, silkscreen: false } },
  { id: "macro", name: ["가까이 보기", "Close-up"], file: "10-shift-register-leds.mycircuit", sky: ["#2d4a2d", "#0c160c"], view: "front", motion: "swing", zoom: 0.42 },
  { id: "bare", name: ["빈 기판", "Bare board"], file: "03-555-blinker.mycircuit", sky: ["#5a2f2f", "#1a0c0c"], view: "iso", motion: "tilt", opts: { components: false } },
  { id: "measure", name: ["치수와 축", "Measured"], file: "04-power-supply-7805.mycircuit", sky: ["#26364a", "#0a1018"], view: "iso", motion: "orbit", opts: { grid: true, axes: true, dimensions: true } },
  { id: "floating", name: ["떠 있는 부품", "Floating parts"], file: "15-regulated-555.mycircuit", sky: ["#3d2a4a", "#110a16"], view: "iso", motion: "wave", opts: { boardBody: false, soldermask: false, silkscreen: false, copper: false, zones: false } },
  { id: "underside", name: ["기판 아래면", "Underside"], file: "13-nand-sr-latch.mycircuit", sky: ["#1d3d5c", "#060f18"], view: "bottom", motion: "orbit" },
  { id: "lowangle", name: ["낮은 시점", "Low angle"], file: "06-opamp-amplifier.mycircuit", sky: ["#c0664a", "#2a1020"], view: "front", motion: "swing", zoom: 0.7 },
  { id: "nomask", name: ["마스크 없이", "No solder mask"], file: "14-two-stage-opamp.mycircuit", sky: ["#1c4a3a", "#061610"], view: "iso", motion: "orbit", opts: { soldermask: false } },
  { id: "side", name: ["옆에서 보기", "Side view"], file: "12-custom-library.mycircuit", sky: ["#3a3d42", "#0e0f11"], view: "left", motion: "drift", zoom: 0.8 },
  // 2D: animated drawings.
  { id: "traces", name: ["자라는 배선", "Growing traces"], kind: "traces", swatch: ["#0b2a1c", "#d9a441"] },
  { id: "schematic", name: ["회로도 흐름", "Drifting schematic"], kind: "schematic", file: "08-arduino-minimal.mycircuit", swatch: ["#1d2027", "#4cc674"] },
  { id: "pcb2d", name: ["PCB 레이아웃", "PCB layout"], kind: "pcb2d", file: "09-usb-uart-ch340.mycircuit", swatch: ["#0f1218", "#d0443e"] },
  { id: "scope", name: ["오실로스코프", "Oscilloscope"], kind: "scope", swatch: ["#06120d", "#ffe14d"] },
  { id: "rain", name: ["부품 비", "Falling parts"], kind: "rain", swatch: ["#14161c", "#e0716b"] },
  { id: "current", name: ["흐르는 전류", "Flowing current"], kind: "current", swatch: ["#101318", "#fff6a0"] },
  { id: "matrix", name: ["넷 이름", "Net names"], kind: "matrix", swatch: ["#050a08", "#46dc82"] },
  { id: "blueprint", name: ["도면", "Blueprint"], kind: "blueprint", swatch: ["#123a6b", "#e8f2ff"] },
  { id: "bode", name: ["보드 선도", "Bode plot"], kind: "bode", swatch: ["#11141b", "#4dd2ff"] },
  { id: "spectrum", name: ["스펙트럼", "Spectrum"], kind: "spectrum", swatch: ["#0a0c12", "#ff7a3d"] },
  { id: "logic", name: ["로직 분석기", "Logic analyser"], kind: "logic", swatch: ["#0f1116", "#4cc674"] },
  { id: "netgraph", name: ["넷 그래프", "Net graph"], kind: "netgraph", swatch: ["#13121c", "#b79cff"] },
  { id: "picture", name: ["그림", "Picture"], picture: true },
  { id: "plain", name: ["단색", "Plain"], plain: true },
];

export const START_SCENE_DEFAULT = "arduino";
// Motion speed: the percentage on screen times MOTION_SCALE gives the rate
// the scenes are written for, so 50 % (the default) moves 1.5× as fast as the
// first version did at 100 %.
export const MOTION_SCALE = 3;
export const START_SCREEN_DEFAULTS = { scene: START_SCENE_DEFAULT, transparency: 70, motion: 50 };
export const motionRate = (screen) => (screen.motion / 100) * MOTION_SCALE;

export function startScene(id) {
  return START_SCENES.find((s) => s.id === id) || START_SCENES[0];
}

export function startScreenOf(settings) {
  const s = settings && typeof settings.startScreen === "object" && settings.startScreen ? settings.startScreen : {};
  const clamp = (v, d, max) => (Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.round(+v))) : d);
  return {
    scene: startScene(s.scene).id,
    transparency: clamp(s.transparency, START_SCREEN_DEFAULTS.transparency, 100),
    motion: clamp(s.motion, START_SCREEN_DEFAULTS.motion, 100),
    motionV2: true, // saved speeds are on the ×3 scale
  };
}

// Camera offset (degrees of azimuth, elevation) at time t (scaled seconds)
// for a motion; "orbit"/"top" return a turning rate instead. All are tuned to
// the same pace: about 8° per second at speed 1 (12°/s at the default 50 %),
// "drift" a little gentler, and every motion stops at speed 0.
export function sceneMotion(motion, t) {
  switch (motion) {
    case "orbit": return { rate: [8, 0] };
    case "top": return { rate: [8, 0] };
    case "swing": return { at: [Math.sin(t * 0.25) * 32, 0] };
    case "tilt": return { at: [t * 6, Math.sin(t * 0.4) * 12] };
    case "wave": return { at: [Math.sin(t * 0.27) * 30, Math.sin(t * 0.54) * 10] };
    case "drift": return { at: [Math.sin(t * 0.3) * 18, Math.sin(t * 0.21) * 5] };
    default: return { at: [0, 0] };
  }
}
