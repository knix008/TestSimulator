import * as THREE from 'three'

/**
 * World axes (X/Y/Z) with colored lines and end labels.
 * Three.js convention: X=red, Y=green, Z=blue.
 *
 * @param {number} [size=2.5]
 * @returns {THREE.Group}
 */
export function createWorldAxes(size = 2.5) {
  const group = new THREE.Group()
  group.name = 'worldAxes'

  const axes = new THREE.AxesHelper(size)
  axes.renderOrder = 2
  group.add(axes)

  // Slightly thicker overlay lines for clearer visibility in dark scenes.
  const thick = createThickAxes(size)
  group.add(thick)

  group.add(makeAxisLabel('X', new THREE.Vector3(size + 0.12, 0, 0), '#ff5a5a'))
  group.add(makeAxisLabel('Y', new THREE.Vector3(0, size + 0.12, 0), '#5dff7a'))
  group.add(makeAxisLabel('Z', new THREE.Vector3(0, 0, size + 0.12), '#5aa8ff'))

  const grid = new THREE.GridHelper(size * 2, 10, 0x3d556c, 0x243041)
  grid.position.y = 0
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const mat of gridMaterials) {
    mat.transparent = true
    mat.opacity = 0.55
  }
  group.add(grid)

  return group
}

/**
 * @param {number} size
 */
function createThickAxes(size) {
  const group = new THREE.Group()
  const pairs = [
    { from: [0, 0, 0], to: [size, 0, 0], color: 0xff3b3b },
    { from: [0, 0, 0], to: [0, size, 0], color: 0x3bff5a },
    { from: [0, 0, 0], to: [0, 0, size], color: 0x3b8cff }
  ]

  for (const axis of pairs) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...axis.from),
      new THREE.Vector3(...axis.to)
    ])
    const material = new THREE.LineBasicMaterial({
      color: axis.color,
      linewidth: 2,
      depthTest: true,
      transparent: true,
      opacity: 0.95
    })
    group.add(new THREE.Line(geometry, material))
  }

  return group
}

/**
 * @param {string} text
 * @param {THREE.Vector3} position
 * @param {string} color
 */
function makeAxisLabel(text, position, color) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Object3D()

  ctx.clearRect(0, 0, 128, 128)
  ctx.font = 'bold 84px Segoe UI, Malgun Gothic, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 10
  ctx.strokeStyle = 'rgba(0,0,0,0.65)'
  ctx.strokeText(text, 64, 70)
  ctx.fillStyle = color
  ctx.fillText(text, 64, 70)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  })
  const sprite = new THREE.Sprite(material)
  sprite.position.copy(position)
  sprite.scale.set(0.35, 0.35, 0.35)
  sprite.renderOrder = 3
  return sprite
}
