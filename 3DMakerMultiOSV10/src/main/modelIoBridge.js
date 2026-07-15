import { app, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BLENDER_START_TIMEOUT_MS = 15000
const BLENDER_CONVERT_TIMEOUT_MS = 180000
const MODEL_IO_CONFIG_FILE = 'model-io.json'

function toSafeStem(name) {
  return String(name || 'converted-space')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function configPath() {
  return join(app.getPath('userData'), MODEL_IO_CONFIG_FILE)
}

async function readModelIoConfig() {
  const path = configPath()
  if (!existsSync(path)) {
    return { blenderPath: '' }
  }

  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      blenderPath: typeof parsed?.blenderPath === 'string' ? parsed.blenderPath.trim() : ''
    }
  } catch {
    return { blenderPath: '' }
  }
}

async function writeModelIoConfig(nextConfig) {
  const safe = {
    blenderPath: typeof nextConfig?.blenderPath === 'string' ? nextConfig.blenderPath.trim() : ''
  }
  await writeFile(configPath(), JSON.stringify(safe, null, 2), 'utf8')
  return safe
}

function collectProcessResult(proc, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
      resolve({ code: -1, stdout, stderr: `${stderr}\nTimeout` })
    }, timeoutMs)

    if (proc.stdout) {
      proc.stdout.on('data', (buf) => {
        stdout += buf.toString()
      })
    }

    if (proc.stderr) {
      proc.stderr.on('data', (buf) => {
        stderr += buf.toString()
      })
    }

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` })
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: Number(code ?? -1), stdout, stderr })
    })
  })
}

async function detectBlenderCommand(preferredPath = '') {
  const tried = []
  const candidates = []

  if (preferredPath) candidates.push(preferredPath)
  if (process.env.BLENDER_PATH) candidates.push(process.env.BLENDER_PATH)
  if (process.platform === 'win32') candidates.push('blender.exe')
  candidates.push('blender')

  for (const cmd of candidates) {
    if (!cmd || tried.includes(cmd)) continue
    tried.push(cmd)

    try {
      const proc = spawn(cmd, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      const result = await collectProcessResult(proc, BLENDER_START_TIMEOUT_MS)
      if (result.code === 0) {
        return cmd
      }
    } catch {
      /* try next */
    }
  }

  return null
}

function blenderConvertScript() {
  return [
    'import sys',
    'import bpy',
    '',
    'args = sys.argv',
    "sep = '--'",
    'if sep not in args:',
    "    raise RuntimeError('Missing -- separator')",
    'idx = args.index(sep)',
    'payload = args[idx + 1:]',
    'if len(payload) < 2:',
    "    raise RuntimeError('Usage: blender --background --python script.py -- <input.glb> <output.fbx>')",
    '',
    'src = payload[0]',
    'dst = payload[1]',
    '',
    'bpy.ops.wm.read_factory_settings(use_empty=True)',
    "bpy.ops.import_scene.gltf(filepath=src)",
    'bpy.ops.export_scene.fbx(',
    '    filepath=dst,',
    '    check_existing=False,',
    '    use_selection=False,',
    '    bake_space_transform=False,',
    '    path_mode="COPY",',
    '    embed_textures=True',
    ')',
    ''
  ].join('\n')
}

async function convertGlbToFbx(glbBuffer, baseName) {
  const cfg = await readModelIoConfig()
  const blenderCmd = await detectBlenderCommand(cfg.blenderPath)
  if (!blenderCmd) {
    return {
      ok: false,
      message:
        'Blender를 찾을 수 없습니다. Blender 설치 후 PATH에 blender를 추가하거나 BLENDER_PATH 환경변수를 설정해 주세요.'
    }
  }

  const tmpRoot = await mkdtemp(join(tmpdir(), 'space-maker-fbx-'))
  const stem = toSafeStem(baseName)
  const inputPath = join(tmpRoot, `${stem}.glb`)
  const outputPath = join(tmpRoot, `${stem}.fbx`)
  const scriptPath = join(tmpRoot, 'convert_glb_to_fbx.py')

  try {
    await writeFile(inputPath, Buffer.from(glbBuffer))
    await writeFile(scriptPath, blenderConvertScript(), 'utf8')

    const proc = spawn(
      blenderCmd,
      ['--background', '--factory-startup', '--python', scriptPath, '--', inputPath, outputPath],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    )

    const result = await collectProcessResult(proc, BLENDER_CONVERT_TIMEOUT_MS)
    if (result.code !== 0) {
      return {
        ok: false,
        message: `FBX 변환 실패 (exit=${result.code})\n${(result.stderr || result.stdout || '').trim()}`
      }
    }

    const fbxBuffer = await readFile(outputPath)
    return {
      ok: true,
      filename: `${stem}.fbx`,
      data: new Uint8Array(fbxBuffer)
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

export function registerModelIoBridge() {
  ipcMain.handle('model-io:get-config', async () => {
    const cfg = await readModelIoConfig()
    const detectedPath = await detectBlenderCommand(cfg.blenderPath)
    return {
      ...cfg,
      detectedPath,
      available: Boolean(detectedPath)
    }
  })

  ipcMain.handle('model-io:set-config', async (_event, payload) => {
    const cfg = await writeModelIoConfig({
      blenderPath: payload?.blenderPath || ''
    })
    const detectedPath = await detectBlenderCommand(cfg.blenderPath)
    return {
      ...cfg,
      detectedPath,
      available: Boolean(detectedPath)
    }
  })

  ipcMain.handle('model-io:detect-blender', async (_event, payload) => {
    const preferredPath = String(payload?.preferredPath || '').trim()
    const detectedPath = await detectBlenderCommand(preferredPath)
    return {
      detectedPath,
      available: Boolean(detectedPath)
    }
  })

  ipcMain.handle('model-io:convert-glb-to-fbx', async (_event, payload) => {
    if (!payload?.glb) {
      return { ok: false, message: 'GLB 데이터가 없습니다.' }
    }
    return convertGlbToFbx(payload.glb, payload.baseName || 'converted-space')
  })
}
