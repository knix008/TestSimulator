import {
  ALargeSmall, AlignLeft, Baseline, Blend, Bold, Bookmark, Brush, Check, Circle, CircleDashed, Compass, Contrast, Crosshair, Droplet, Eye, Feather, Film, Gauge, Hash, Italic, Layers, Lock, MoveHorizontal,
  Paintbrush, Palette, PenLine, Pipette, RotateCw, Ruler, ScanLine, Sparkles, Square, Strikethrough, SunDim, SwatchBook, Type, Underline, Wand, ZoomIn, type LucideIcon,
} from 'lucide-react'

/**
 * An icon for each setting in the right panel, by its label key. Anything not listed
 * gets the general one, so a new setting is never left without an icon.
 */
const ICONS: Record<string, LucideIcon> = {
  size: Circle, hardness: CircleDashed, opacity: Droplet, fillOpacity: Droplet, blend: Blend, brushSpacing: MoveHorizontal, brushAngle: RotateCw, brushRoundness: Circle, brushScatter: Sparkles,
  fillColor: Palette, strokeColor: PenLine, strokeWidth: PenLine, cornerRadius: Square, fillWith: Paintbrush, color: Palette, toColor: Palette, pattern: SwatchBook,
  zoomLevel: ZoomIn, hsbH: Palette, hsbS: Contrast, hsbB: SunDim, rgbR: Palette, rgbG: Palette, rgbB: Palette, hexLabel: Hash,
  font: Type, fontSize: ALargeSmall, leading: AlignLeft, tracking: MoveHorizontal, baseline: Baseline, antiAlias: ScanLine, indent: AlignLeft, paragraphSpacing: AlignLeft,
  lockTransparent: Lock, lockPosition: Lock, aligned: Crosshair, sampleAll: Layers, bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough, allCaps: Type, vtext: Type,
  lutPreset: Film, lutStrength: Gauge, histogram: Bookmark, feather: Feather, brush: Brush, wand: Wand, ruler: Ruler, eye: Eye, pipette: Pipette, compass: Compass, check: Check,
}

export const fieldIcon = (key: string): LucideIcon => ICONS[key] ?? Gauge
