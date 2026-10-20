import type { ManifoldToplevel } from 'manifold-3d'
import { convert } from '../core/convert'
import type { WorkerRequest, WorkerResponse } from '../shared/types'

// Load the engine from our own origin without bundling its optional Node branch.
const moduleUrl = new URL('/wasm/manifold.js', self.location.origin).href
const wasmUrl = new URL('/wasm/manifold.wasm', self.location.origin).href
let engine: Promise<ManifoldToplevel> | null = null

function getEngine(): Promise<ManifoldToplevel> {
  // Initialize inside the request's try/catch. A failed download can be retried
  // by adjusting the image settings, without leaving an unhandled rejection.
  engine ??= import(/* webpackIgnore: true */ moduleUrl)
    .then(({ default: Module }) => Module({ locateFile: () => wasmUrl }))
    .then((module: ManifoldToplevel) => { module.setup(); return module })
    .catch(() => {
      engine = null
      throw new Error('Não foi possível carregar o motor de conversão. Verifique sua conexão e ajuste uma opção para tentar novamente.')
    })
  return engine
}
let latest = 0
self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  latest = data.id
  try {
    const module = await getEngine()
    if (data.id !== latest) return
    const result = convert(data.image, data.options, module)
    const response: WorkerResponse = { id: data.id, result }
    self.postMessage(response, { transfer: [result.positions.buffer, result.indices.buffer] })
  } catch (error) {
    const response: WorkerResponse = { id: data.id, error: error instanceof Error ? error.message : 'Falha na conversão. Tente outra imagem.' }
    self.postMessage(response)
  }
}
