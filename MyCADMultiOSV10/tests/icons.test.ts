import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

function pixel(png: { width: number; data: Uint8Array }, x: number, y: number) {
  const i = (png.width * y + x) << 2
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] }
}

describe('icons', () => {
  it('[Icons] app icon has a transparent border and a bright upper-left glow', () => {
    const png = PNG.sync.read(fs.readFileSync(path.resolve('assets/icon.png')))
    expect(pixel(png, 0, 0).a).toBe(0)
    expect(pixel(png, png.width - 1, 0).a).toBe(0)
    expect(pixel(png, 0, png.height - 1).a).toBe(0)
    const glow = pixel(png, Math.round(png.width * 0.24), Math.round(png.height * 0.22))
    const body = pixel(png, Math.round(png.width * 0.62), Math.round(png.height * 0.62))
    expect(glow.a).toBeGreaterThan(0)
    expect(glow.r + glow.g + glow.b).toBeGreaterThan(body.r + body.g + body.b)
  })

  it('[Icons] document icon is a separate image from the application icon', () => {
    const app = fs.readFileSync(path.resolve('assets/icon.png'))
    const file = fs.readFileSync(path.resolve('assets/file-icon.png'))
    expect(app.equals(file)).toBe(false)
    expect(fs.existsSync(path.resolve('assets/icon.ico'))).toBe(true)
    expect(fs.existsSync(path.resolve('assets/file-icon.ico'))).toBe(true)
    expect(fs.existsSync(path.resolve('public/favicon.png'))).toBe(true)
  })
})
