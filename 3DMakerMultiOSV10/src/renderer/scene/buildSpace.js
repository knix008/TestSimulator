import * as THREE from 'three'

/**
 * Build a walkable, room-like mesh from RGB + monocular depth.
 *
 * @param {CanvasImageSource & { width: number, height: number, naturalWidth?: number, naturalHeight?: number }} image
 * @param {{ width: number, height: number, data: Float32Array }} depthMap
 * @param {{
 *   meshRes?: number,
 *   depthScale?: number,
 *   near?: number,
 *   far?: number,
 *   invertDepth?: boolean | 'auto'
 * }} options
 */
export function buildSpaceFromDepth(image, depthMap, options = {}) {
  const meshRes = options.meshRes ?? 256
  const depthScale = options.depthScale ?? 1.35
  const near = options.near ?? 1.05
  const far = (options.far ?? 10.5) * depthScale
  const invertMode = options.invertDepth ?? 'auto'

  const { width: dw, height: dh, data } = depthMap
  const imgW = image.naturalWidth || image.width
  const imgH = image.naturalHeight || image.height
  const aspect = imgW / Math.max(1, imgH)
  const cols = meshRes
  const rows = Math.max(12, Math.round(meshRes / aspect))

  let depths = sampleDepthGrid(data, dw, dh, cols, rows)
  depths = smoothDepth(depths, cols, rows, 1)
  normalizeByPercentile(depths, 0.03, 0.97)

  if (invertMode === true || (invertMode === 'auto' && shouldInvertDepth(depths, cols, rows))) {
    invertDepthInPlace(depths)
  }

  const positions = new Float32Array(cols * rows * 3)
  const uvs = new Float32Array(cols * rows * 2)
  const fovY = THREE.MathUtils.degToRad(68)
  const tanHalfFovY = Math.tan(fovY / 2)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const u = x / (cols - 1)
      const v = y / (rows - 1)

      const z = -(near + depths[i] * (far - near))
      const px = easeLateral(u) * (-z) * tanHalfFovY * aspect * 2
      const py = (0.5 - v) * 2 * (-z) * tanHalfFovY

      positions[i * 3] = px
      positions[i * 3 + 1] = py
      positions[i * 3 + 2] = z
      uvs[i * 2] = u
      uvs[i * 2 + 1] = 1 - v
    }
  }

  // Wrap borders so the capture reads like a volume, not a flat card.
  for (let x = 0; x < cols; x++) {
    exaggerateBorderVertex(positions, cols, rows, x, 0, aspect, tanHalfFovY)
    exaggerateBorderVertex(positions, cols, rows, x, rows - 1, aspect, tanHalfFovY)
  }
  for (let y = 0; y < rows; y++) {
    exaggerateBorderVertex(positions, cols, rows, 0, y, aspect, tanHalfFovY)
    exaggerateBorderVertex(positions, cols, rows, cols - 1, y, aspect, tanHalfFovY)
  }

  const indices = buildEdgeAwareIndices(depths, cols, rows, 0.085)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const floorY = estimateFloorY(positions, cols, rows)
  geometry.translate(0, -floorY, 0)
  geometry.computeBoundingBox()

  const texture = new THREE.Texture(image)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  texture.anisotropy = 8

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: false
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'spaceMesh'
  mesh.receiveShadow = true

  const box = geometry.boundingBox.clone()
  const spawn = new THREE.Vector3(0, 1.55, Math.min(-0.35, box.max.z - 0.55))
  const enclosure = createEnclosure(box)

  return {
    mesh,
    enclosure,
    floorY: 0,
    spawn,
    bounds: box
  }
}

function easeLateral(u) {
  const x = u - 0.5
  return x * (1 + 0.1 * x * x * 4)
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
          const w = Math.exp(-spatial / 2.2 - range * 18)
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
    const t = THREE.MathUtils.clamp((depths[i] - lo) / range, 0, 1)
    depths[i] = Math.pow(t, 0.72)
  }
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

function buildEdgeAwareIndices(depths, cols, rows, jump) {
  const indices = []
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const a = y * cols + x
      const b = a + 1
      const c = a + cols
      const d = c + 1
      const da = depths[a]
      const db = depths[b]
      const dc = depths[c]
      const dd = depths[d]
      const jumpAB = Math.abs(da - db) > jump
      const jumpAC = Math.abs(da - dc) > jump
      const jumpBD = Math.abs(db - dd) > jump
      const jumpCD = Math.abs(dc - dd) > jump
      if (!jumpAB && !jumpAC && Math.abs(db - dc) <= jump * 1.2) {
        indices.push(a, c, b)
      }
      if (!jumpBD && !jumpCD && Math.abs(db - dc) <= jump * 1.2) {
        indices.push(b, c, d)
      }
    }
  }
  return indices
}

function exaggerateBorderVertex(positions, cols, rows, x, y, aspect, tanHalfFovY) {
  const i = y * cols + x
  const u = x / (cols - 1)
  const v = y / (rows - 1)
  let px = positions[i * 3]
  let py = positions[i * 3 + 1]
  let pz = positions[i * 3 + 2]
  pz -= 0.55
  px *= 1.1
  py *= 1.08
  if (Math.abs(pz) > 1e-4) {
    const targetX = easeLateral(u) * (-pz) * tanHalfFovY * aspect * 2
    const targetY = (0.5 - v) * 2 * (-pz) * tanHalfFovY
    px = THREE.MathUtils.lerp(px, targetX, 0.7)
    py = THREE.MathUtils.lerp(py, targetY, 0.7)
  }
  positions[i * 3] = px
  positions[i * 3 + 1] = py
  positions[i * 3 + 2] = pz
}

function estimateFloorY(positions, cols, rows) {
  const band = Math.max(1, Math.floor(rows * 0.2))
  const samples = []
  for (let y = rows - band; y < rows; y++) {
    for (let x = 0; x < cols; x += 2) {
      samples.push(positions[(y * cols + x) * 3 + 1])
    }
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length * 0.4)] ?? -1.2
}

function createEnclosure(box) {
  const group = new THREE.Group()
  group.name = 'spaceEnclosure'

  const width = Math.max(6, (box.max.x - box.min.x) * 1.4)
  const height = Math.max(3.8, (box.max.y - box.min.y) * 1.5)
  const depth = Math.max(9, (box.max.z - box.min.z) * 1.35 + 2.5)

  const room = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: 0x0c1218,
      side: THREE.BackSide,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.96
    })
  )
  room.position.set(
    (box.min.x + box.max.x) * 0.5,
    height * 0.42,
    (box.min.z + box.max.z) * 0.5 - 0.4
  )
  group.add(room)
  return group
}
