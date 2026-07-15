import * as THREE from 'three'

/**
 * Build an object-like 3D mesh from RGB + monocular depth.
 *
 * @param {CanvasImageSource & { width: number, height: number, naturalWidth?: number, naturalHeight?: number }} image
 * @param {{ width: number, height: number, data: Float32Array }} depthMap
 * @param {{ meshRes?: number, depthScale?: number, maxAnisotropy?: number, transparentBgThreshold?: number, backgroundRemovalMode?: 'auto'|'on'|'off'|string }} options
 */
export function buildObjectFromDepth(image, depthMap, options = {}) {
  const meshRes = options.meshRes ?? 320
  const depthScale = options.depthScale ?? 1.6
  const maxAnisotropy = options.maxAnisotropy ?? 8
  const transparentBgThreshold = THREE.MathUtils.clamp(
    Number(options.transparentBgThreshold ?? 0.005),
    0.001,
    0.2
  )
  const bgRemovalMode = normalizeBgRemovalMode(options.backgroundRemovalMode)

  const { width: dw, height: dh, data } = depthMap
  const imgW = image.naturalWidth || image.width
  const imgH = image.naturalHeight || image.height
  const aspect = imgW / Math.max(1, imgH)
  const cols = meshRes
  const rows = Math.max(20, Math.round(meshRes / Math.max(0.45, aspect)))

  let depths = sampleDepthGrid(data, dw, dh, cols, rows)
  depths = smoothDepth(depths, cols, rows, 1)
  normalizeByPercentile(depths, 0.03, 0.97)

  if (shouldInvertForObject(depths, cols, rows)) invertDepthInPlace(depths)

  const keepSourceAlpha =
    bgRemovalMode === 'off' ||
    (bgRemovalMode === 'auto' && hasMeaningfulTransparency(image, transparentBgThreshold))
  const fgMask = keepSourceAlpha ? null : computeForegroundMask(depths, cols, rows)

  for (let i = 0; i < depths.length; i++) {
    depths[i] = Math.pow(depths[i], 0.78)
  }

  const positions = new Float32Array(cols * rows * 3)
  const uvs = new Float32Array(cols * rows * 2)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const u = x / (cols - 1)
      const v = y / (rows - 1)

      const px = (u - 0.5) * 2
      const py = (0.5 - v) * 2 / Math.max(0.01, aspect)
      const pz = -depths[i] * depthScale

      positions[i * 3] = px
      positions[i * 3 + 1] = py
      positions[i * 3 + 2] = pz
      uvs[i * 2] = u
      uvs[i * 2 + 1] = 1 - v
    }
  }

  recenterDepth(positions)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(
    keepSourceAlpha
      ? buildFullIndices(cols, rows)
      : buildForegroundIndices(cols, rows, fgMask, 0.16)
  )
  geometry.computeVertexNormals()

  const boxPre = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'))
  geometry.translate(0, -boxPre.min.y, 0)
  geometry.computeBoundingBox()

  const maskedImage = keepSourceAlpha ? image : makeMaskedImageCanvas(image, fgMask, cols, rows)
  const texture = createPhotoTexture(maskedImage, maxAnisotropy)
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.03,
    roughness: 0.92,
    metalness: 0.02
  })

  const root = new THREE.Group()
  root.name = 'objectRoot'

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'objectMesh'
  root.add(mesh)

  const box = geometry.boundingBox.clone()
  const spanX = box.max.x - box.min.x
  const spanZ = box.max.z - box.min.z
  const spawn = new THREE.Vector3(0, 1.4, Math.max(2.6, spanX * 1.3 + Math.abs(spanZ) * 1.6))

  return {
    mode: 'object',
    mesh: root,
    enclosure: null,
    floorY: 0,
    spawn,
    bounds: box
  }
}

function normalizeBgRemovalMode(value) {
  const v = String(value || '').toLowerCase()
  if (v === 'on' || v === 'off') return v
  return 'auto'
}

function hasMeaningfulTransparency(image, threshold = 0.005) {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return false

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false

  ctx.drawImage(image, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data

  const total = width * height
  const step = Math.max(1, Math.floor(Math.sqrt(total / 160000)))
  let sampled = 0
  let transparent = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      sampled++
      if (rgba[i + 3] < 250) transparent++
    }
  }

  // Treat image as already cut-out when transparency is clearly present.
  return sampled > 0 && transparent / sampled >= threshold
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

function smoothDepth(src, cols, rows, radius) {
  const out = new Float32Array(src.length)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0
      let wsum = 0
      const center = src[y * cols + x]
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
          const val = src[yy * cols + xx]
          const spatial = dx * dx + dy * dy
          const range = Math.abs(val - center)
          const w = Math.exp(-spatial / 2.0 - range * 20)
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

function shouldInvertForObject(depths, cols, rows) {
  let center = 0
  let border = 0
  let cn = 0
  let bn = 0

  const cx0 = Math.floor(cols * 0.3)
  const cx1 = Math.floor(cols * 0.7)
  const cy0 = Math.floor(rows * 0.25)
  const cy1 = Math.floor(rows * 0.75)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x += 2) {
      const val = depths[y * cols + x]
      const inCenter = x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1
      if (inCenter) {
        center += val
        cn++
      } else {
        border += val
        bn++
      }
    }
  }

  if (!cn || !bn) return false
  return center / cn > border / bn
}

function invertDepthInPlace(depths) {
  for (let i = 0; i < depths.length; i++) depths[i] = 1 - depths[i]
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

function buildForegroundIndices(cols, rows, mask, minMask) {
  const indices = []
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const a = y * cols + x
      const b = a + 1
      const c = a + cols
      const d = c + 1

      const mA = mask[a]
      const mB = mask[b]
      const mC = mask[c]
      const mD = mask[d]

      if ((mA + mB + mC) / 3 >= minMask) indices.push(a, c, b)
      if ((mB + mC + mD) / 3 >= minMask) indices.push(b, c, d)
    }
  }
  return indices
}

function recenterDepth(positions) {
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2]
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const midZ = (minZ + maxZ) * 0.5
  for (let i = 2; i < positions.length; i += 3) {
    positions[i] -= midZ + 0.25
  }
}

function computeForegroundMask(depths, cols, rows) {
  const closeness = new Float32Array(depths.length)
  for (let i = 0; i < depths.length; i++) closeness[i] = 1 - depths[i]

  const sorted = Array.from(closeness).sort((a, b) => a - b)
  const cut = sorted[Math.floor((sorted.length - 1) * 0.62)]
  const candidate = new Uint8Array(depths.length)
  for (let i = 0; i < candidate.length; i++) {
    candidate[i] = closeness[i] >= cut ? 1 : 0
  }

  const seed = findBestCenterSeed(closeness, cols, rows)
  const connected = floodFillMask(candidate, cols, rows, seed)

  const out = new Float32Array(depths.length)
  for (let i = 0; i < out.length; i++) {
    if (!connected[i]) {
      out[i] = 0
      continue
    }

    // Keep a soft alpha ramp near the boundary for cleaner edges.
    const v = (closeness[i] - cut) / Math.max(1e-6, 1 - cut)
    out[i] = THREE.MathUtils.clamp(v * 1.2, 0.08, 1)
  }

  blurMaskInPlace(out, cols, rows, 1)
  return out
}

function findBestCenterSeed(values, cols, rows) {
  const cx0 = Math.floor(cols * 0.35)
  const cx1 = Math.floor(cols * 0.65)
  const cy0 = Math.floor(rows * 0.3)
  const cy1 = Math.floor(rows * 0.7)

  let best = Math.floor(rows * 0.5) * cols + Math.floor(cols * 0.5)
  let bestVal = -Infinity

  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      const i = y * cols + x
      if (values[i] > bestVal) {
        bestVal = values[i]
        best = i
      }
    }
  }
  return best
}

function floodFillMask(candidate, cols, rows, seed) {
  const out = new Uint8Array(candidate.length)
  if (!candidate[seed]) return out

  const q = [seed]
  out[seed] = 1

  while (q.length) {
    const i = q.pop()
    const y = Math.floor(i / cols)
    const x = i - y * cols

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
        const ni = yy * cols + xx
        if (!candidate[ni] || out[ni]) continue
        out[ni] = 1
        q.push(ni)
      }
    }
  }

  return out
}

function blurMaskInPlace(mask, cols, rows, radius) {
  const src = new Float32Array(mask)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0
      let wsum = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
          const w = dx === 0 && dy === 0 ? 1.0 : 0.6
          sum += src[yy * cols + xx] * w
          wsum += w
        }
      }
      mask[y * cols + x] = sum / Math.max(1e-6, wsum)
    }
  }
}

function makeMaskedImageCanvas(image, mask, cols, rows) {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return image

  ctx.drawImage(image, 0, 0, width, height)
  const img = ctx.getImageData(0, 0, width, height)
  const rgba = img.data

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x / Math.max(1, width - 1)) * (cols - 1)
      const v = (y / Math.max(1, height - 1)) * (rows - 1)
      const a = sampleMaskBilinear(mask, cols, rows, u, v)
      const i = (y * width + x) * 4
      rgba[i + 3] = Math.round(THREE.MathUtils.clamp(a, 0, 1) * 255)
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

function sampleMaskBilinear(mask, cols, rows, fx, fy) {
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(cols - 1, x0 + 1)
  const y1 = Math.min(rows - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0

  const a = mask[y0 * cols + x0]
  const b = mask[y0 * cols + x1]
  const c = mask[y1 * cols + x0]
  const d = mask[y1 * cols + x1]
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
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
