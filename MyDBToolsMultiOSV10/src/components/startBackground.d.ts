// Types for startBackground.js (ported as plain JavaScript from MyUMLMaker).
export type AnimationKind =
  | 'aurora' | 'waves' | 'particles' | 'constellation' | 'bubbles' | 'gridflow' | 'flowchart' | 'starfield' | 'rain' | 'snow'
  | 'fireflies' | 'ripples' | 'coderain' | 'hexagons' | 'orbits' | 'lava' | 'spiral' | 'confetti' | 'nodes' | 'ribbons';

export const ANIMATIONS: AnimationKind[];
export const ANIMATION_KINDS: AnimationKind[];

export interface BackgroundColors {
  bg: string;
  accent: string;
  accent2?: string;
  text: string;
  dark: boolean;
}

export class AnimatedBackground {
  constructor(
    canvas: HTMLCanvasElement,
    options?: { colors?: () => BackgroundColors; speed?: () => number; kind?: string; vivid?: boolean },
  );
  kind: AnimationKind;
  frames: number;
  speed: () => number;
  setKind(kind: string): void;
  shuffle(random?: () => number): AnimationKind;
  start(): void;
  pause(): void;
  stop(): void;
  draw(): void;
  destroy(): void;
}
