export type SpectrumColorOrder = 'blue-red' | 'red-blue'

export const spectrumStyles = ['bars', 'mirror', 'wave', 'line', 'radial', 'dots', 'blocks'] as const
export type SpectrumStyle = (typeof spectrumStyles)[number]

export const defaultSpectrumStyle: SpectrumStyle = 'bars'

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
      const y = height - Math.max(4, level * height)
      const radius = Math.max(1.5, 1.5 + level * 4.5)
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
