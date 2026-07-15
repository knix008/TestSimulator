import * as THREE from 'three'

/**
 * Build a walkable room-like scene from RGB + monocular depth.
 * Shapes the depth surface toward a floor / walls / ceiling so it reads as space,
 * not a floating photo card.
 *
 * @param {CanvasImageSource & { width: number, height: number, naturalWidth?: number, naturalHeight?: number }} image
 * @param {{ width: number, height: number, data: Float32Array }} depthMap
 * @param {{
 *   meshRes?: number,
 *   depthScale?: number,
 *   near?: number,
 *   far?: number,
 *   invertDepth?: boolean | 'auto',
 *   maxAnisotropy?: number
 * }} options
 */
export function buildSpaceFromDepth(image, depthMap, options = {}) {
  const meshRes = options.meshRes ?? 384
  const depthScale = options.depthScale ?? 1.8
  const near = options.near ?? 0.75
  const baseFar = options.far ?? 14
  const invertMode = options.invertDepth ?? 'auto'
  const maxAnisotropy = options.maxAnisotropy ?? 16

  const { width: dw, height: dh, data } = depthMap
  const imgW = image.naturalWidth || image.width
  const imgH = image.naturalHeight || image.height
  const aspect = imgW / Math.max(1, imgH)
  const cols = meshRes
  const rows = Math.max(16, Math.round(meshRes / aspect))

  const lumaGuide = sampleImageLumaGrid(image, cols, rows)
  let depths = sampleDepthGrid(data, dw, dh, cols, rows)
  depths = smoothDepth(depths, cols, rows, 1, lumaGuide)
  normalizeByPercentile(depths, 0.02, 0.98)

  const std = computeStdDev(depths)
  const contrastBoost = THREE.MathUtils.clamp((0.19 - std) * 3.8, 0, 0.62)
  if (contrastBoost > 0) {
    applyGlobalContrast(depths, contrastBoost)
    enhanceDepthLocalContrast(depths, cols, rows, contrastBoost * 0.5)
  }

  if (invertMode === true || (invertMode === 'auto' && shouldInvertDepth(depths, cols, rows))) {
    invertDepthInPlace(depths)
  }

  const postStd = computeStdDev(depths)
  const adapt = THREE.MathUtils.clamp((postStd - 0.1) / 0.2, 0, 1)
  const gamma = THREE.MathUtils.lerp(0.72, 0.88, adapt)
  for (let i = 0; i < depths.length; i++) depths[i] = Math.pow(depths[i], gamma)

  const far = near + baseFar * depthScale * THREE.MathUtils.lerp(1.18, 0.92, adapt)

  let positions = new Float32Array(cols * rows * 3)
  let uvs = new Float32Array(cols * rows * 2)
  const fovY = THREE.MathUtils.degToRad(72)
  const tanHalfFovY = Math.tan(fovY / 2)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const u = x / (cols - 1)
      const v = y / (rows - 1)

      const zPin = -(near + depths[i] * (far - near))
      const xPin = (u - 0.5) * 2 * (-zPin) * tanHalfFovY * aspect
      const yPin = (0.5 - v) * 2 * (-zPin) * tanHalfFovY

      const ang = (u - 0.5) * 1.25
      const radius = -zPin
      const xCyl = Math.sin(ang) * radius * (aspect * 0.92)
      const zCyl = -Math.cos(ang) * radius
      const wrap = smoothstep(0.12, 0.55, Math.abs(u - 0.5))

      positions[i * 3] = THREE.MathUtils.lerp(xPin, xCyl, wrap * 0.85)
      positions[i * 3 + 1] = yPin
      positions[i * 3 + 2] = THREE.MathUtils.lerp(zPin, zCyl, wrap * 0.7)
      uvs[i * 2] = u
      uvs[i * 2 + 1] = 1 - v
    }
  }

  const floorY = estimateBandY(positions, cols, rows, 0.72, 1.0, 0.35)
  const ceilY = estimateBandY(positions, cols, rows, 0.0, 0.22, 0.65)
  shapeAsRoom(positions, cols, rows, floorY, ceilY)

  const indices = buildFullIndices(cols, rows)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.translate(0, -floorY, 0)
  geometry.computeBoundingBox()

  const texture = createPhotoTexture(image, maxAnisotropy)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.FrontSide,
    toneMapped: true
  })

  const root = new THREE.Group()
  root.name = 'spaceRoot'

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'spaceMesh'
  root.add(mesh)

  // Dark backdrop only — no second copy of the photo texture.
  const box = geometry.boundingBox.clone()
  root.add(createDarkEnclosure(box))

  // Start a little inside the reconstructed volume so WASD can walk deeper (−Z).
  const depthSpan = Math.max(2.5, box.max.z - box.min.z)
  const spawnZ = THREE.MathUtils.clamp(
    box.max.z - Math.min(1.8, depthSpan * 0.22),
    box.min.z + 0.8,
    box.max.z - 0.35
  )
  const spawn = new THREE.Vector3(0, 1.6, spawnZ)

  return {
    mode: 'space',
    mesh: root,
    enclosure: null,
    floorY: 0,
    spawn,
    bounds: box
  }
}

function shapeAsRoom(positions, cols, rows, floorY, ceilY) {
  for (let y = 0; y < rows; y++) {
    const v = y / (rows - 1)
    for (let x = 0; x < cols; x++) {
      const u = x / (cols - 1)
      const i = y * cols + x
      let px = positions[i * 3]
      let py = positions[i * 3 + 1]
      let pz = positions[i * 3 + 2]

      if (v > 0.58) {
        const w = Math.pow(smoothstep(0.58, 0.98, v), 1.4)
        py = THREE.MathUtils.lerp(py, floorY, w * 0.72)
      }

      if (v < 0.25) {
        const w = Math.pow(1 - smoothstep(0.0, 0.25, v), 1.2)
        py = THREE.MathUtils.lerp(py, ceilY, w * 0.55)
      }

      const side = Math.max(smoothstep(0.82, 1.0, u), smoothstep(0.18, 0.0, u))
      if (side > 0) {
        const sideX = (u < 0.5 ? -1 : 1) * Math.abs(px) * (1.04 + 0.1 * side)
        px = THREE.MathUtils.lerp(px, sideX, side * 0.55)
        py = THREE.MathUtils.lerp(py, THREE.MathUtils.clamp(py, floorY, ceilY), side * 0.22)
      }

      positions[i * 3] = px
      positions[i * 3 + 1] = py
      positions[i * 3 + 2] = pz
    }
  }
}

function buildFullIndices(cols, rows) {
  const indices = []
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const a = y * cols + x
      const b = a + 1
      const c = a + cols
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  return indices
}

function sampleDepthGrid(data, width, height, cols, rows) {
  const out = new Float32Array(cols * rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const u = x / (cols - 1)
      const v = y / (rows - 1)
      out[y * cols + x] = sampleBilinear(data, width, height, u * (width - 1), v * (height - 1))
    }
  }
  return out
}

function sampleBilinear(data, width, height, fx, fy) {
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const a = data[y0 * width + x0]
  const b = data[y0 * width + x1]
  const c = data[y1 * width + x0]
  const d = data[y1 * width + x1]
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}

function smoothDepth(src, cols, rows, radius, lumaGuide) {
  const out = new Float32Array(src.length)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0
      let wsum = 0
      const center = src[y * cols + x]
      const centerLuma = lumaGuide ? lumaGuide[y * cols + x] : 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
          const val = src[yy * cols + xx]
          const spatial = dx * dx + dy * dy
          const range = Math.abs(val - center)
          const luma = lumaGuide ? lumaGuide[yy * cols + xx] : centerLuma
          const edge = Math.abs(luma - centerLuma)
          const w = Math.exp(-spatial / 2.2 - range * 18 - edge * 14)
          sum += val * w
          wsum += w
        }
      }
      out[y * cols + x] = sum / Math.max(1e-6, wsum)
    }
  }
  return out
}

function normalizeByPercentile(depths, lowP, highP) {
  const sorted = Array.from(depths).sort((a, b) => a - b)
  const lo = sorted[Math.floor((sorted.length - 1) * lowP)]
  const hi = sorted[Math.floor((sorted.length - 1) * highP)]
  const range = Math.max(1e-6, hi - lo)
  for (let i = 0; i < depths.length; i++) {
    depths[i] = THREE.MathUtils.clamp((depths[i] - lo) / range, 0, 1)
  }
}

function applyGlobalContrast(depths, amount) {
  const gain = 1 + amount
  for (let i = 0; i < depths.length; i++) {
    const centered = (depths[i] - 0.5) * gain + 0.5
    depths[i] = THREE.MathUtils.clamp(centered, 0, 1)
  }
}

function enhanceDepthLocalContrast(depths, cols, rows, amount) {
  if (amount <= 0) return
  const blurred = smoothDepth(depths, cols, rows, 1)
  for (let i = 0; i < depths.length; i++) {
    const detail = depths[i] - blurred[i]
    depths[i] = THREE.MathUtils.clamp(depths[i] + detail * amount, 0, 1)
  }
}

function computeStdDev(values) {
  if (!values.length) return 0
  let mean = 0
  for (let i = 0; i < values.length; i++) mean += values[i]
  mean /= values.length
  let variance = 0
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - mean
    variance += d * d
  }
  variance /= values.length
  return Math.sqrt(variance)
}

function sampleImageLumaGrid(image, cols, rows) {
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, cols, rows)
  const rgba = ctx.getImageData(0, 0, cols, rows).data
  const out = new Float32Array(cols * rows)
  for (let i = 0; i < out.length; i++) {
    const r = rgba[i * 4] / 255
    const g = rgba[i * 4 + 1] / 255
    const b = rgba[i * 4 + 2] / 255
    out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return out
}

function shouldInvertDepth(depths, cols, rows) {
  let bottom = 0
  let center = 0
  let bn = 0
  let cn = 0
  const y0 = Math.floor(rows * 0.78)
  const cy0 = Math.floor(rows * 0.35)
  const cy1 = Math.floor(rows * 0.55)
  const cx0 = Math.floor(cols * 0.35)
  const cx1 = Math.floor(cols * 0.65)
  for (let y = y0; y < rows; y++) {
    for (let x = 0; x < cols; x += 2) {
      bottom += depths[y * cols + x]
      bn++
    }
  }
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x += 2) {
      center += depths[y * cols + x]
      cn++
    }
  }
  if (!bn || !cn) return false
  return bottom / bn < center / cn
}

function invertDepthInPlace(depths) {
  for (let i = 0; i < depths.length; i++) depths[i] = 1 - depths[i]
}

function estimateBandY(positions, cols, rows, v0, v1, percentile) {
  const yStart = Math.floor(v0 * (rows - 1))
  const yEnd = Math.floor(v1 * (rows - 1))
  const samples = []
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = 0; x < cols; x += 2) {
      samples.push(positions[(y * cols + x) * 3 + 1])
    }
  }
  samples.sort((a, b) => a - b)
  if (!samples.length) return 0
  return samples[Math.floor((samples.length - 1) * percentile)]
}

function createPhotoTexture(image, maxAnisotropy) {
  const texture = new THREE.Texture(image)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = Math.max(1, maxAnisotropy)
  texture.flipY = true
  texture.needsUpdate = true
  return texture
}

function createDarkEnclosure(box) {
  const group = new THREE.Group()
  group.name = 'spaceShell'

  const width = Math.max(10, (box.max.x - box.min.x) * 2.2)
  const height = Math.max(5, (box.max.y - box.min.y) * 2.0)
  const depth = Math.max(14, (box.max.z - box.min.z) * 2.2 + 4)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x070a0e,
    side: THREE.BackSide,
    toneMapped: false
  })
  const shell = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat)
  shell.position.set(0, height * 0.28, (box.min.z + box.max.z) * 0.5 - 1.5)
  group.add(shell)
  return group
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
