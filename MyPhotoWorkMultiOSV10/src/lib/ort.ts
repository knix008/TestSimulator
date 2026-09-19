import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import gpuWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { modelStore } from './models'
import type { Runner, Tensor } from './neural'

/**
 * ONNX Runtime, loaded on first use. The models run on WebAssembly across
 * every core (the Electron shell makes the page cross-origin isolated, which
 * is what threads need); WebGPU is opt-in, because the JSEP backend still
 * fails on some models and machines, and when it does the session is rebuilt
 * on the CPU. Sessions are kept once created, since building one from 200MB
 * of weights is the slow part.
 *
 * This module is the only one that touches the runtime, and it is reached by
 * dynamic import, so the editor's own bundle never carries it.
 */

type Ort = typeof import('onnxruntime-web/wasm')

const ortPromises: Partial<Record<'cpu' | 'gpu', Promise<Ort>>> = {}

/**
 * The runtime in one of two builds, each with the WebAssembly binary it was
 * built against (the pairs must match, or the glue fails deep inside): the
 * plain CPU build, or the one with the WebGPU execution provider. They are
 * separate downloads and the GPU build touches the GPU as soon as it starts,
 * so it is only loaded when asked.
 */
function loadOrt(webgpu: boolean): Promise<Ort> {
  const key = webgpu ? 'gpu' : 'cpu'
  let pending = ortPromises[key]
  if (!pending) {
    pending = (webgpu ? import('onnxruntime-web/webgpu') : import('onnxruntime-web/wasm')).then((ort) => {
      ort.env.wasm.wasmPaths = { wasm: webgpu ? gpuWasmUrl : wasmUrl }
      ort.env.wasm.numThreads = cpuThreads()
      // The session lives in a worker, so a long inference never freezes the editor.
      ort.env.wasm.proxy = !webgpu
      return ort as Ort
    })
    ortPromises[key] = pending
  }
  return pending
}

const sessions = new Map<string, Promise<Runner>>()

/** How many threads the CPU backend gets: all but one core, once isolated. */
export function cpuThreads() {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  if (!isolated) return 1
  return Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1))
}

/** Which execution provider the last session landed on, for the status line. */
export let lastProvider: 'webgpu' | 'wasm' | null = null

type Session = import('onnxruntime-web').InferenceSession

async function createSession(bytes: Uint8Array, webgpu: boolean): Promise<{ ort: Ort; session: Session }> {
  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  if (webgpu && hasWebGpu) {
    try {
      const ort = await loadOrt(true)
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu', 'wasm'] })
      lastProvider = 'webgpu'
      return { ort, session }
    } catch {
      // Fall through to the CPU.
    }
  }
  const ort = await loadOrt(false)
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
  lastProvider = 'wasm'
  return { ort, session }
}

async function createRunner(id: string, webgpu: boolean): Promise<Runner> {
  const bytes = new Uint8Array(await modelStore().read(id))
  let { ort, session } = await createSession(bytes, webgpu)
  const runOnce = async (feeds: Record<string, Tensor>) => {
    const input: Record<string, import('onnxruntime-web').Tensor> = {}
    for (const [name, tensor] of Object.entries(feeds)) input[name] = new ort.Tensor('float32', tensor.data, tensor.dims)
    const output = await session.run(input)
    const out: Record<string, Tensor> = {}
    for (const [name, tensor] of Object.entries(output)) {
      out[name] = { data: tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data as ArrayLike<number>), dims: [...tensor.dims] }
    }
    return out
  }
  return {
    inputNames: [...session.inputNames],
    outputNames: [...session.outputNames],
    async run(feeds: Record<string, Tensor>) {
      try {
        return await runOnce(feeds)
      } catch (error) {
        // A GPU session that fails mid-run is rebuilt on the CPU and tried once more.
        if (lastProvider !== 'webgpu') throw error
        ;({ ort, session } = await createSession(bytes, false))
        return runOnce(feeds)
      }
    },
  }
}

/** A runner for a downloaded model, created once and shared (per provider choice). */
export function runnerFor(id: string, webgpu = false): Promise<Runner> {
  const key = `${id}:${webgpu ? 'gpu' : 'cpu'}`
  let pending = sessions.get(key)
  if (!pending) {
    pending = createRunner(id, webgpu)
    pending.catch(() => sessions.delete(key))
    sessions.set(key, pending)
  }
  return pending
}

/** Drops a model's sessions (after its weights are deleted). */
export function forgetRunner(id: string) {
  sessions.delete(`${id}:gpu`)
  sessions.delete(`${id}:cpu`)
}
