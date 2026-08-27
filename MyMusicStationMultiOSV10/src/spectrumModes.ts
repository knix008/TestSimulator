export type SpectrumColorOrder = 'blue-red' | 'red-blue'

export const spectrumStyles = [
  'bars',
  'mirror',
  'wave',
  'line',
  'radial',
  'dots',
  'blocks',
  'ridge',
  'ring',
  'needle',
  'pulse',
  'stripe',
  'spark',
  'aurora',
  'matrix',
] as const
export type SpectrumStyle = (typeof spectrumStyles)[number]

export const defaultSpectrumStyle: SpectrumStyle = 'bars'

// Number of perceptually-spaced display bands the raw FFT is resampled into.
export const spectrumBandCount = 96

const spectrumMinHz = 20
const spectrumMaxHz = 20000

/**
 * Resample the raw linear FFT magnitudes into log-spaced (perceptual) bands.
 *
 * The AnalyserNode always spans 0 Hz .. Nyquist (sampleRate / 2) with linearly
 * spaced bins, which crams the entire bass region into the first few bins. This
 * redistributes the energy onto a log frequency axis from ~20 Hz to ~20 kHz so
 * the audible range is represented the way we hear it. Each output band takes
 * the peak of the raw bins it covers (max), which keeps transients lively; for
 * bands narrower than one bin it interpolates between neighbours.
 */
export const buildLogBands = (
  freqData: Uint8Array,
  sampleRate: number,
  bandCount: number = spectrumBandCount,
  out: Uint8Array = new Uint8Array(bandCount),
): Uint8Array => {
  const binCount = freqData.length
  const nyquist = sampleRate / 2 || 22050
  const hzPerBin = nyquist / binCount
  const maxHz = Math.min(spectrumMaxHz, nyquist)
  const logMin = Math.log10(spectrumMinHz)
  const logMax = Math.log10(maxHz)
  const logSpan = logMax - logMin

  for (let index = 0; index < bandCount; index += 1) {
    const f0 = 10 ** (logMin + (logSpan * index) / bandCount)
    const f1 = 10 ** (logMin + (logSpan * (index + 1)) / bandCount)
    const rawStart = f0 / hzPerBin
    const rawEnd = f1 / hzPerBin
    const startBin = Math.floor(rawStart)
    const endBin = Math.ceil(rawEnd)

    if (endBin - startBin <= 1) {
      // Band narrower than a bin: linearly interpolate between neighbours.
      const center = (rawStart + rawEnd) / 2
      const lower = Math.max(0, Math.min(binCount - 1, Math.floor(center)))
      const upper = Math.min(binCount - 1, lower + 1)
      const frac = center - lower
      out[index] = Math.round(freqData[lower] * (1 - frac) + freqData[upper] * frac)
      continue
    }

    let peak = 0
    const from = Math.max(0, startBin)
    const to = Math.min(binCount, endBin)
    for (let bin = from; bin < to; bin += 1) {
      if (freqData[bin] > peak) {
        peak = freqData[bin]
      }
    }
    out[index] = peak
  }

  return out
}

export const isSpectrumStyle = (value: unknown): value is SpectrumStyle =>
  typeof value === 'string' && (spectrumStyles as readonly string[]).includes(value)

export const nextSpectrumStyle = (current: SpectrumStyle): SpectrumStyle => {
  const index = spectrumStyles.indexOf(current)
  return spectrumStyles[(index + 1) % spectrumStyles.length]
}

const hueFor = (t: number, colorOrder: SpectrumColorOrder, level: number) => {
  const hue = colorOrder === 'red-blue' ? t * 240 : 240 - t * 240
  const saturation = 70 + level * 30
  const lightness = 38 + level * 22
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; t: number }
type MatrixDrop = { y: number; speed: number; t: number }

const sparkParticles: Spark[] = []
const matrixDrops: MatrixDrop[] = []
let matrixReady = false

const averageBand = (freqData: Uint8Array, start: number, end: number) => {
  const from = Math.max(0, Math.floor(start))
  const to = Math.min(freqData.length, Math.ceil(end))
  if (to <= from) {
    return 0
  }

  let sum = 0
  for (let index = from; index < to; index += 1) {
    sum += freqData[index]
  }
  return sum / (to - from) / 255
}

export const drawSpectrumFrame = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  style: SpectrumStyle,
  colorOrder: SpectrumColorOrder,
  freqData: Uint8Array,
  timeData: Uint8Array,
) => {
  const width = canvas.width
  const height = canvas.height
  const binCount = freqData.length
  context.clearRect(0, 0, width, height)

  if (style === 'wave') {
    context.beginPath()
    const slice = width / Math.max(timeData.length - 1, 1)

    timeData.forEach((value, index) => {
      const level = value / 255
      const x = index * slice
      const y = level * height
      if (index === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    })

    context.strokeStyle = hueFor(0.35, colorOrder, 0.75)
    context.lineWidth = 2
    context.stroke()

    const waveFill = context.createLinearGradient(0, 0, 0, height)
    waveFill.addColorStop(0, 'rgba(76, 201, 166, 0.28)')
    waveFill.addColorStop(1, 'rgba(76, 201, 166, 0.04)')
    context.lineTo(width, height)
    context.lineTo(0, height)
    context.closePath()
    context.fillStyle = waveFill
    context.fill()
    return
  }

  if (style === 'line') {
    context.beginPath()
    const step = width / Math.max(binCount - 1, 1)

    freqData.forEach((value, index) => {
      const level = value / 255
      const x = index * step
      const y = height - Math.max(2, level * height)
      if (index === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    })

    context.strokeStyle = hueFor(0.4, colorOrder, 0.8)
    context.lineWidth = 2.2
    context.stroke()

    context.lineTo(width, height)
    context.lineTo(0, height)
    context.closePath()
    const gradient = context.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, 'rgba(90, 160, 255, 0.4)')
    gradient.addColorStop(1, 'rgba(90, 160, 255, 0.04)')
    context.fillStyle = gradient
    context.fill()
    return
  }

  if (style === 'radial') {
    const cx = width / 2
    const cy = height / 2
    const maxRadius = Math.min(width, height) * 0.42
    const inner = maxRadius * 0.28
    const count = Math.min(binCount, 64)

    for (let index = 0; index < count; index += 1) {
      const value = freqData[index]
      const level = value / 255
      const t = index / Math.max(count - 1, 1)
      const angle = t * Math.PI * 2 - Math.PI / 2
      const radius = inner + level * (maxRadius - inner)
      context.beginPath()
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
      context.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
      context.strokeStyle = hueFor(t, colorOrder, level)
      context.lineWidth = 2.4
      context.lineCap = 'round'
      context.stroke()
    }
    return
  }

  if (style === 'dots') {
    const barWidth = width / binCount
    freqData.forEach((value, index) => {
      const level = value / 255
      const t = index / Math.max(binCount - 1, 1)
      const x = index * barWidth + barWidth / 2
      const radius = Math.max(1.5, 1.5 + level * 4.5)
      // Keep the whole dot inside the canvas: never let its top edge clip.
      const y = Math.max(radius, height - Math.max(4, level * height))
      context.beginPath()
      context.fillStyle = hueFor(t, colorOrder, level)
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    })
    return
  }

  if (style === 'blocks') {
    const columns = Math.min(binCount, 48)
    const rows = 16
    const gap = 2
    const cellWidth = (width - gap * (columns - 1)) / columns
    const cellHeight = (height - gap * (rows - 1)) / rows

    for (let index = 0; index < columns; index += 1) {
      const sampleIndex = Math.floor((index / columns) * binCount)
      const level = freqData[sampleIndex] / 255
      const lit = Math.round(level * rows)
      const t = index / Math.max(columns - 1, 1)

      for (let row = 0; row < rows; row += 1) {
        const active = row < lit
        const x = index * (cellWidth + gap)
        const y = height - (row + 1) * cellHeight - row * gap
        context.fillStyle = active
          ? hueFor(t, colorOrder, (row + 1) / rows)
          : 'color-mix(in srgb, currentColor 8%, transparent)'
        if (!active) {
          context.globalAlpha = 0.18
          context.fillStyle = '#8a94a0'
        }
        context.fillRect(x, y, Math.max(cellWidth, 1), Math.max(cellHeight, 1))
        context.globalAlpha = 1
      }
    }
    return
  }

  if (style === 'mirror') {
    const barWidth = width / binCount
    const mid = height / 2
    freqData.forEach((value, index) => {
      const level = value / 255
      const half = Math.max(1, level * mid)
      const t = index / Math.max(binCount - 1, 1)
      const x = index * barWidth
      const w = Math.max(barWidth - 2, 2)
      context.fillStyle = hueFor(t, colorOrder, level)
      context.fillRect(x, mid - half, w, half)
      context.fillRect(x, mid, w, half)
    })
    return
  }

  if (style === 'ridge') {
    const step = width / Math.max(binCount - 1, 1)
    context.beginPath()
    context.moveTo(0, height)
    freqData.forEach((value, index) => {
      const level = value / 255
      const x = index * step
      const y = height - Math.max(2, level * height * 0.92)
      context.lineTo(x, y)
    })
    context.lineTo(width, height)
    context.closePath()

    const fill = context.createLinearGradient(0, 0, width, 0)
    fill.addColorStop(0, hueFor(0, colorOrder, 0.7))
    fill.addColorStop(0.5, hueFor(0.5, colorOrder, 0.85))
    fill.addColorStop(1, hueFor(1, colorOrder, 0.7))
    context.globalAlpha = 0.72
    context.fillStyle = fill
    context.fill()
    context.globalAlpha = 1
    context.strokeStyle = hueFor(0.45, colorOrder, 0.95)
    context.lineWidth = 2
    context.stroke()
    return
  }

  if (style === 'ring') {
    const cx = width / 2
    const cy = height / 2
    const rings = 8
    const maxRadius = Math.min(width, height) * 0.46

    for (let ring = 0; ring < rings; ring += 1) {
      const from = (ring / rings) * binCount
      const to = ((ring + 1) / rings) * binCount
      const level = averageBand(freqData, from, to)
      const radius = maxRadius * ((ring + 1) / rings) * (0.45 + level * 0.55)
      const t = ring / Math.max(rings - 1, 1)
      context.beginPath()
      context.arc(cx, cy, Math.max(4, radius), 0, Math.PI * 2)
      context.strokeStyle = hueFor(t, colorOrder, level)
      context.lineWidth = 1.5 + level * 3.5
      context.globalAlpha = 0.35 + level * 0.55
      context.stroke()
      context.globalAlpha = 1
    }
    return
  }

  if (style === 'needle') {
    const mid = height / 2
    const count = Math.min(binCount, 96)
    const step = width / count

    for (let index = 0; index < count; index += 1) {
      const sampleIndex = Math.floor((index / count) * binCount)
      const level = freqData[sampleIndex] / 255
      const t = index / Math.max(count - 1, 1)
      const x = index * step + step / 2
      const half = Math.max(2, level * mid * 0.95)
      context.beginPath()
      context.moveTo(x, mid - half)
      context.lineTo(x, mid + half)
      context.strokeStyle = hueFor(t, colorOrder, level)
      context.lineWidth = Math.max(1, step * 0.35)
      context.lineCap = 'round'
      context.stroke()
    }
    return
  }

  if (style === 'pulse') {
    const cx = width / 2
    const cy = height / 2
    const bass = averageBand(freqData, 0, binCount * 0.12)
    const mid = averageBand(freqData, binCount * 0.12, binCount * 0.4)
    const treble = averageBand(freqData, binCount * 0.4, binCount)
    const energy = bass * 0.55 + mid * 0.3 + treble * 0.15
    const maxRadius = Math.min(width, height) * 0.42

    const glow = context.createRadialGradient(cx, cy, 0, cx, cy, maxRadius)
    glow.addColorStop(0, hueFor(0.2, colorOrder, energy))
    glow.addColorStop(0.45, hueFor(0.55, colorOrder, mid))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    context.globalAlpha = 0.35 + energy * 0.45
    context.fillStyle = glow
    context.beginPath()
    context.arc(cx, cy, maxRadius * (0.55 + energy * 0.45), 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1

    for (let ring = 0; ring < 3; ring += 1) {
      const level = ring === 0 ? bass : ring === 1 ? mid : treble
      const radius = maxRadius * (0.28 + ring * 0.18 + level * 0.28)
      context.beginPath()
      context.arc(cx, cy, radius, 0, Math.PI * 2)
      context.strokeStyle = hueFor(ring / 2, colorOrder, level)
      context.lineWidth = 2 + level * 4
      context.globalAlpha = 0.45 + level * 0.45
      context.stroke()
      context.globalAlpha = 1
    }
    return
  }

  if (style === 'stripe') {
    const rows = 18
    const rowHeight = height / rows

    for (let row = 0; row < rows; row += 1) {
      const from = (row / rows) * binCount
      const to = ((row + 1) / rows) * binCount
      const level = averageBand(freqData, from, to)
      const t = row / Math.max(rows - 1, 1)
      const barWidth = Math.max(4, level * width)
      context.fillStyle = hueFor(t, colorOrder, level)
      context.globalAlpha = 0.35 + level * 0.65
      context.fillRect((width - barWidth) / 2, row * rowHeight + 1, barWidth, Math.max(rowHeight - 2, 1))
      context.globalAlpha = 1
    }
    return
  }

  if (style === 'spark') {
    const columns = Math.min(binCount, 56)
    const step = width / columns

    for (let index = 0; index < columns; index += 1) {
      const sampleIndex = Math.floor((index / columns) * binCount)
      const level = freqData[sampleIndex] / 255
      if (level < 0.42 || sparkParticles.length > 180) {
        continue
      }

      const spawn = Math.floor(level * 2)
      for (let count = 0; count < spawn; count += 1) {
        sparkParticles.push({
          x: index * step + step / 2,
          y: height - level * height * 0.85,
          vx: (Math.random() - 0.5) * 1.4,
          vy: -1.2 - level * 2.8 - Math.random(),
          life: 0.55 + level * 0.7,
          t: index / Math.max(columns - 1, 1),
        })
      }
    }

    for (let index = sparkParticles.length - 1; index >= 0; index -= 1) {
      const particle = sparkParticles[index]
      particle.x += particle.vx
      particle.y += particle.vy
      particle.vy += 0.05
      particle.life -= 0.02

      if (particle.life <= 0 || particle.y < -8) {
        sparkParticles.splice(index, 1)
        continue
      }

      context.beginPath()
      context.fillStyle = hueFor(particle.t, colorOrder, Math.min(1, particle.life))
      context.globalAlpha = Math.max(0.15, particle.life)
      context.arc(particle.x, particle.y, 1.4 + particle.life * 1.8, 0, Math.PI * 2)
      context.fill()
      context.globalAlpha = 1
    }

    // faint base bars under sparks
    for (let index = 0; index < columns; index += 1) {
      const sampleIndex = Math.floor((index / columns) * binCount)
      const level = freqData[sampleIndex] / 255
      const t = index / Math.max(columns - 1, 1)
      const barHeight = Math.max(1, level * height * 0.35)
      context.globalAlpha = 0.28
      context.fillStyle = hueFor(t, colorOrder, level)
      context.fillRect(index * step + 1, height - barHeight, Math.max(step - 2, 1), barHeight)
      context.globalAlpha = 1
    }
    return
  }

  if (style === 'aurora') {
    const layers = 4
    const step = width / Math.max(binCount - 1, 1)

    for (let layer = 0; layer < layers; layer += 1) {
      // Anchor each layer near the bottom and cap the amplitude so the peaks
      // never rise above the canvas top (offset scales with height for mini mode).
      const offset = (layer - (layers - 1) / 2) * height * 0.03
      const scale = 0.34 + layer * 0.05
      const base = height * (0.9 - layer * 0.05)
      context.beginPath()
      freqData.forEach((value, index) => {
        const level = value / 255
        const neighbor = freqData[Math.min(binCount - 1, index + layer + 1)] / 255
        const mixed = level * 0.65 + neighbor * 0.35
        const x = index * step
        const y = base - mixed * height * scale + offset
        if (index === 0) {
          context.moveTo(x, y)
        } else {
          context.lineTo(x, y)
        }
      })
      context.strokeStyle = hueFor(layer / Math.max(layers - 1, 1), colorOrder, 0.7 + layer * 0.05)
      context.lineWidth = 2.2 - layer * 0.25
      context.globalAlpha = 0.35 + layer * 0.12
      context.stroke()
      context.globalAlpha = 1
    }
    return
  }

  if (style === 'matrix') {
    const columns = 36
    if (!matrixReady || matrixDrops.length !== columns) {
      matrixDrops.length = 0
      for (let index = 0; index < columns; index += 1) {
        matrixDrops.push({
          y: Math.random() * height,
          speed: 1.2 + Math.random() * 2.4,
          t: index / Math.max(columns - 1, 1),
        })
      }
      matrixReady = true
    }

    const colWidth = width / columns
    const cell = 7

    for (let index = 0; index < columns; index += 1) {
      const sampleIndex = Math.floor((index / columns) * binCount)
      const level = freqData[sampleIndex] / 255
      const drop = matrixDrops[index]
      drop.speed = 1 + level * 4.5
      drop.y += drop.speed
      if (drop.y > height + cell * 6) {
        drop.y = -Math.random() * height * 0.3
      }

      const trail = 8 + Math.floor(level * 10)
      for (let step = 0; step < trail; step += 1) {
        const y = drop.y - step * cell
        // Only draw cells that fit fully inside the canvas (no top/bottom spill).
        if (y < 0 || y > height - cell) {
          continue
        }
        context.globalAlpha = Math.max(0.08, 1 - step / trail) * (0.35 + level * 0.65)
        context.fillStyle = hueFor(drop.t, colorOrder, 1 - step / trail)
        context.fillRect(index * colWidth + 2, y, Math.max(colWidth - 4, 1), cell - 1)
      }
      context.globalAlpha = 1
    }
    return
  }

  // bars (default)
  const barWidth = width / binCount
  freqData.forEach((value, index) => {
    const level = value / 255
    const barHeight = Math.max(2, level * height)
    const t = index / Math.max(binCount - 1, 1)
    context.fillStyle = hueFor(t, colorOrder, level)
    context.fillRect(index * barWidth, height - barHeight, Math.max(barWidth - 2, 2), barHeight)
  })
}
