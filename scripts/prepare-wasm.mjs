import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageRoot = dirname(fileURLToPath(import.meta.resolve('manifold-3d')))
const destination = join(root, 'public/wasm')
await mkdir(destination, { recursive: true })
for (const name of ['manifold.js', 'manifold.wasm']) await copyFile(join(packageRoot, name), join(destination, name))
console.log('Motor WebAssembly preparado em public/wasm.')
