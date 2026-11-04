import type { AppSettings, LayerEffects, Tool } from './types'

/**
 * The presets the panels start with. They are data rather than saved settings, so they
 * cannot be lost, are named in both languages, and what the user saves is kept apart.
 */
type Names = { ko: string; en: string }

export type BuiltInBrush = { id: string; name: Names; size: number; hardness: number; opacity: number; spacing: number; angle: number; roundness: number; scatter: number }

const brush = (id: string, ko: string, en: string, size: number, hardness: number, opacity: number, spacing = 0.25, angle = 0, roundness = 1, scatter = 0): BuiltInBrush => ({ id, name: { ko, en }, size, hardness, opacity, spacing, angle, roundness, scatter })

export const BUILTIN_BRUSHES: BuiltInBrush[] = [
  brush('hard5', '단단한 원 5', 'Hard round 5', 5, 1, 1),
  brush('hard13', '단단한 원 13', 'Hard round 13', 13, 1, 1),
  brush('hard30', '단단한 원 30', 'Hard round 30', 30, 1, 1),
  brush('hard80', '단단한 원 80', 'Hard round 80', 80, 1, 1),
  brush('soft13', '부드러운 원 13', 'Soft round 13', 13, 0, 1),
  brush('soft30', '부드러운 원 30', 'Soft round 30', 30, 0, 1),
  brush('soft80', '부드러운 원 80', 'Soft round 80', 80, 0, 1),
  brush('soft200', '부드러운 원 200', 'Soft round 200', 200, 0, 1),
  brush('airbrush', '에어브러시', 'Airbrush', 60, 0, 0.2, 0.1),
  brush('airbrushFine', '가는 에어브러시', 'Fine airbrush', 20, 0, 0.3, 0.08),
  brush('pencil', '연필', 'Pencil', 3, 0.9, 0.8, 0.1),
  brush('ink', '잉크', 'Ink', 6, 1, 1, 0.05),
  brush('marker', '마커', 'Marker', 24, 0.8, 0.6, 0.1, 0, 0.5),
  brush('highlighter', '형광펜', 'Highlighter', 34, 0.9, 0.35, 0.1, 90, 0.3),
  brush('calligraphy', '서예', 'Calligraphy', 22, 1, 1, 0.05, 45, 0.15),
  brush('calligraphyWide', '넓은 서예', 'Wide calligraphy', 44, 1, 1, 0.05, -45, 0.2),
  brush('chalk', '분필', 'Chalk', 28, 0.5, 0.7, 0.3, 0, 0.8, 0.4),
  brush('charcoal', '목탄', 'Charcoal', 18, 0.6, 0.8, 0.2, 30, 0.6, 0.3),
  brush('spray', '스프레이', 'Spray', 16, 0.3, 0.5, 0.5, 0, 1, 2.5),
  brush('splatter', '물감 튀김', 'Splatter', 30, 0.8, 0.8, 1.2, 0, 1, 3),
  brush('dots', '점선', 'Dotted line', 8, 1, 1, 2),
  brush('dashes', '파선', 'Dashed line', 10, 1, 1, 1.8, 0, 0.3),
  brush('leaf', '잎사귀', 'Leaf', 26, 0.7, 0.9, 0.9, 40, 0.35, 0.6),
  brush('flat', '납작 붓', 'Flat brush', 40, 0.7, 0.9, 0.08, 90, 0.12),
]

export type BuiltInToolPreset = { id: string; name: Names; tool: Tool; values: Partial<AppSettings> }

const toolPreset = (id: string, ko: string, en: string, tool: Tool, values: Partial<AppSettings>): BuiltInToolPreset => ({ id, name: { ko, en }, tool, values })

export const BUILTIN_TOOL_PRESETS: BuiltInToolPreset[] = [
  toolPreset('sketch', '스케치 연필', 'Sketch pencil', 'pencil', { brushSize: 3, brushHardness: 1, brushOpacity: 0.8 }),
  toolPreset('softPaint', '부드러운 칠', 'Soft paint', 'brush', { brushSize: 60, brushHardness: 0, brushOpacity: 0.5 }),
  toolPreset('hardPaint', '단단한 칠', 'Hard paint', 'brush', { brushSize: 20, brushHardness: 1, brushOpacity: 1 }),
  toolPreset('softEraser', '부드러운 지우개', 'Soft eraser', 'eraser', { brushSize: 50, brushHardness: 0, brushOpacity: 1 }),
  toolPreset('hardEraser', '단단한 지우개', 'Hard eraser', 'eraser', { brushSize: 20, brushHardness: 1, brushOpacity: 1 }),
  toolPreset('softClone', '부드러운 복제', 'Soft clone', 'clone', { brushSize: 40, brushHardness: 0.2, brushOpacity: 1, cloneAligned: true }),
  toolPreset('spot', '잡티 제거', 'Blemish fix', 'spotHeal', { brushSize: 24, brushHardness: 0.5 }),
  toolPreset('dodgeLight', '은은한 닷지', 'Gentle dodge', 'dodge', { brushSize: 60, brushOpacity: 0.2 }),
  toolPreset('burnLight', '은은한 번', 'Gentle burn', 'burn', { brushSize: 60, brushOpacity: 0.2 }),
  toolPreset('blurSoft', '부드럽게 흐리기', 'Soft blur', 'blurTool', { brushSize: 40, brushOpacity: 0.6 }),
  toolPreset('sharpenFine', '가볍게 선명하게', 'Light sharpen', 'sharpenTool', { brushSize: 30, brushOpacity: 0.3 }),
  toolPreset('smudgeFinger', '손가락 문지르기', 'Finger smudge', 'smudge', { brushSize: 30, brushOpacity: 0.6 }),
  toolPreset('featherRect', '페더 사각 선택', 'Feathered marquee', 'marquee', { marqueeFeather: 20 }),
  toolPreset('sharpRect', '정확한 사각 선택', 'Sharp marquee', 'marquee', { marqueeFeather: 0, antiAlias: false }),
  toolPreset('featherOval', '페더 원형 선택', 'Feathered ellipse', 'ellipseMarquee', { marqueeFeather: 20 }),
  toolPreset('wandTight', '좁은 자동 선택', 'Tight wand', 'wand', { fillTolerance: 12, wandContiguous: true }),
  toolPreset('wandWide', '넓은 자동 선택', 'Wide wand', 'wand', { fillTolerance: 64, wandContiguous: false }),
  toolPreset('bucketWide', '넓은 페인트 통', 'Wide bucket', 'fill', { fillTolerance: 64 }),
  toolPreset('outlineRect', '윤곽 사각형', 'Outline rectangle', 'rect', { shapeFilled: false, shapeStroke: 4 }),
  toolPreset('roundCard', '둥근 카드', 'Round card', 'roundRect', { shapeFilled: true, shapeCorner: 24, shapeStroke: 0 }),
  toolPreset('hexagon', '육각형', 'Hexagon', 'polygon', { shapeSides: 6, shapeFilled: true }),
  toolPreset('radialGradient', '방사형 그레이디언트', 'Radial gradient', 'gradient', { gradientKind: 'radial' }),
]

export type BuiltInStyle = { id: string; name: Names; effects: Partial<LayerEffects> }

const style = (id: string, ko: string, en: string, effects: Partial<LayerEffects>): BuiltInStyle => ({ id, name: { ko, en }, effects })

export const BUILTIN_STYLES: BuiltInStyle[] = [
  style('softShadow', '부드러운 그림자', 'Soft shadow', { dropShadow: true, shadowBlur: 18, shadowX: 4, shadowY: 8, shadowOpacity: 0.5 }),
  style('hardShadow', '단단한 그림자', 'Hard shadow', { dropShadow: true, shadowBlur: 0, shadowX: 8, shadowY: 8, shadowOpacity: 0.9 }),
  style('longShadow', '긴 그림자', 'Long shadow', { dropShadow: true, shadowBlur: 6, shadowX: 24, shadowY: 24, shadowOpacity: 0.45 }),
  style('whiteOutline', '흰 윤곽선', 'White outline', { stroke: true, strokeColor: '#ffffff', strokeWidth: 4 }),
  style('blackOutline', '검은 윤곽선', 'Black outline', { stroke: true, strokeColor: '#000000', strokeWidth: 3 }),
  style('sticker', '스티커', 'Sticker', { stroke: true, strokeColor: '#ffffff', strokeWidth: 10, dropShadow: true, shadowBlur: 10, shadowX: 2, shadowY: 4, shadowOpacity: 0.45 }),
  style('neonBlue', '파란 네온', 'Blue neon', { outerGlow: true, glowColor: '#38bdf8', glowSize: 24, glowOpacity: 1 }),
  style('neonPink', '분홍 네온', 'Pink neon', { outerGlow: true, glowColor: '#f472b6', glowSize: 24, glowOpacity: 1 }),
  style('neonGreen', '초록 네온', 'Green neon', { outerGlow: true, glowColor: '#4ade80', glowSize: 24, glowOpacity: 1 }),
  style('softGlow', '은은한 광채', 'Soft glow', { outerGlow: true, glowColor: '#fff7cc', glowSize: 40, glowOpacity: 0.6 }),
  style('innerGlow', '안쪽 광채', 'Inner glow', { innerGlow: true, innerGlowColor: '#ffffbe', innerGlowSize: 16, innerGlowOpacity: 0.9 }),
  style('deepInset', '깊게 파임', 'Deep inset', { innerShadow: true, innerShadowBlur: 14, innerShadowX: 4, innerShadowY: 6, innerShadowOpacity: 0.9 }),
  style('bevelSoft', '부드러운 입체', 'Soft bevel', { bevel: true, bevelStyle: 'inner', bevelSize: 8, bevelDepth: 100, bevelSoften: 4 }),
  style('bevelHard', '단단한 입체', 'Hard bevel', { bevel: true, bevelStyle: 'inner', bevelSize: 12, bevelDepth: 240, bevelSoften: 0 }),
  style('emboss', '돋을새김', 'Emboss', { bevel: true, bevelStyle: 'emboss', bevelSize: 10, bevelDepth: 160 }),
  style('pillow', '베개 입체', 'Pillow', { bevel: true, bevelStyle: 'pillow', bevelSize: 10, bevelDepth: 140 }),
  style('satin', '새틴', 'Satin', { satin: true, satinColor: '#000000', satinOpacity: 0.5, satinDistance: 12, satinSize: 16 }),
  style('tintRed', '붉은 색조', 'Red tint', { colorOverlay: true, overlayColor: '#ef4444', overlayOpacity: 0.45 }),
  style('tintBlue', '푸른 색조', 'Blue tint', { colorOverlay: true, overlayColor: '#3b82f6', overlayOpacity: 0.45 }),
  style('goldGradient', '금색 그레이디언트', 'Gold gradient', { gradientOverlay: true, gradientFrom: '#b8860b', gradientTo: '#fff4c2', gradientAngle: 90, gradientOpacity: 1, gradientStyle: 'linear' }),
  style('sunsetGradient', '노을 그레이디언트', 'Sunset gradient', { gradientOverlay: true, gradientFrom: '#be123c', gradientTo: '#f97316', gradientAngle: 90, gradientOpacity: 0.85, gradientStyle: 'linear' }),
  style('poster', '포스터', 'Poster', { stroke: true, strokeColor: '#111111', strokeWidth: 6, dropShadow: true, shadowBlur: 0, shadowX: 10, shadowY: 10, shadowOpacity: 1, shadowColor: '#f59e0b' }),
]

/** Every shape the Shapes panel and the options bar offer, in their order. */
export const BUILTIN_SHAPES = ['star', 'heart', 'arrow', 'triangle', 'diamond', 'plus', 'cross', 'chevron', 'speech', 'moon', 'lightning', 'pentagon', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'drop', 'cloud', 'shield', 'star6'] as const
