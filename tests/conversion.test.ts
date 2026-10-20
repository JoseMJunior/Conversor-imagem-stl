import { beforeAll, describe, expect, it } from 'vitest'
import Module from 'manifold-3d'
import type { ManifoldToplevel } from 'manifold-3d'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { convert, detectMode } from '../src/core/convert'
import { exportSTL, geometryFrom } from '../src/core/export'
import { DEFAULT_OPTIONS } from '../src/shared/types'
import type { ConversionOptions, ConversionResult, RasterImage } from '../src/shared/types'

let engine: ManifoldToplevel
beforeAll(async () => { engine = await Module(); engine.setup() })

function raster(width: number, height: number, pixel: (x: number, y: number) => number[]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4)
  return { width, height, data }
}
const black = [0, 0, 0, 255], white = [255, 255, 255, 255]
const ring = () => raster(24, 24, (x, y) => x >= 3 && x < 21 && y >= 3 && y < 21 && !(x >= 9 && x < 15 && y >= 9 && y < 15) ? black : white)
const run = (image: RasterImage, options: Partial<ConversionOptions> = {}) => convert(image, { ...DEFAULT_OPTIONS, simplify: 0, ...options }, engine)

function meshStats(result: ConversionResult) {
  const points = result.positions
  const edges = new Map<string, number>()
  const adjacency = new Map<string, Set<string>>()
  const key = (i: number) => `${points[i * 3].toFixed(4)},${points[i * 3 + 1].toFixed(4)},${points[i * 3 + 2].toFixed(4)}`
  let signedVolume = 0
  for (let i = 0; i < result.indices.length; i += 3) {
    const ids = [result.indices[i], result.indices[i + 1], result.indices[i + 2]]
    const [a, b, c] = ids.map((id) => Array.from(points.slice(id * 3, id * 3 + 3)))
    signedVolume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    for (let j = 0; j < 3; j++) {
      const x = key(ids[j]), y = key(ids[(j + 1) % 3])
      const edge = [x, y].sort().join('|')
      edges.set(edge, (edges.get(edge) || 0) + 1)
      if (!adjacency.has(x)) adjacency.set(x, new Set())
      if (!adjacency.has(y)) adjacency.set(y, new Set())
      adjacency.get(x)!.add(y); adjacency.get(y)!.add(x)
    }
  }
  let components = 0
  const visited = new Set<string>()
  for (const point of adjacency.keys()) {
    if (visited.has(point)) continue
    components++
    const queue = [point]
    while (queue.length) {
      const current = queue.pop()!
      if (visited.has(current)) continue
      visited.add(current)
      for (const neighbor of adjacency.get(current)!) if (!visited.has(neighbor)) queue.push(neighbor)
    }
  }
  return { signedVolume, components, watertight: [...edges.values()].every((count) => count === 2) }
}

function svgArea(svg: string): number {
  const d = svg.match(/ d="([^"]+)"/)![1]
  const areas = d.split('Z').filter((s) => s.trim()).map((path) => {
    const coords = [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])])
    return coords.reduce((area, [x, y], i) => {
      const next = coords[(i + 1) % coords.length]
      return area + x * next[1] - next[0] * y
    }, 0) / 2
  })
  return Math.abs(areas.reduce((sum, area) => sum + area, 0))
}

describe('Conversão de contornos e geometria', () => {
  it('preserva um furo, escala em mm e gera malha fechada orientada para fora', () => {
    const result = run(ring())
    const stats = meshStats(result)
    expect(result.parts).toBe(1); expect(result.holes).toBe(1)
    expect(result.width).toBe(100); expect(result.height).toBeCloseTo(100)
    expect(result.totalHeight).toBe(3)
    expect(stats.watertight).toBe(true); expect(stats.signedVolume).toBeGreaterThan(0)
    expect(stats.signedVolume).toBeCloseTo(result.volume, 1)
    expect(svgArea(result.svg) * 3).toBeCloseTo(result.volume, 1)
    expect(result.svg).toContain('width="100mm"'); expect(result.svg).toContain('fill-rule="evenodd"')
  })
  it('mantém partes separadas e as une com a base, sem faces internas', () => {
    const image = raster(30, 20, (x, y) => y >= 3 && y < 17 && ((x >= 2 && x < 10) || (x >= 20 && x < 28)) ? black : white)
    const loose = run(image)
    const withBase = run(image, { base: true })
    expect(loose.parts).toBe(2); expect(meshStats(loose).components).toBe(2)
    const stats = meshStats(withBase)
    expect(stats.components).toBe(1); expect(stats.watertight).toBe(true)
    expect(withBase.totalHeight).toBe(5); expect(withBase.svg).toBe(loose.svg)
    const expected = loose.volume + (loose.width + 6) * (loose.height + 6) * 2
    expect(stats.signedVolume).toBeCloseTo(expected, 0)
  })
  it('preserva ilhas dentro de furos', () => {
    const image = ring()
    for (let y = 11; y < 13; y++) for (let x = 11; x < 13; x++) image.data.set(black, (y * 24 + x) * 4)
    const result = run(image)
    expect(result.parts).toBe(2); expect(result.holes).toBe(1)
    expect(meshStats(result).watertight).toBe(true)
  })
  it('detecta transparência e ignora cores RGB invisíveis', () => {
    const image = raster(20, 20, (x, y) => x >= 3 && x < 17 && y >= 4 && y < 16 ? [255, 10, 10, 255] : [0, 0, 0, 0])
    expect(detectMode(image)).toBe('alpha')
    const result = run(image)
    expect(result.detectedMode).toBe('alpha'); expect(result.parts).toBe(1)
    expect(result.height).toBeLessThan(result.width)
    expect(meshStats(result).watertight).toBe(true)
  })
  it('detecta formas claras sobre fundo escuro', () => {
    const darkImage = ring()
    for (let i = 0; i < darkImage.data.length; i += 4) for (let c = 0; c < 3; c++) darkImage.data[i + c] = 255 - darkImage.data[i + c]
    expect(detectMode(darkImage)).toBe('light')
    expect(run(darkImage).holes).toBe(1)
    expect(run(ring()).detectedMode).toBe('dark')
  })
  it('inverte a seleção e respeita o limiar', () => {
    const image = raster(20, 20, (x, y) => x > 5 && x < 14 && y > 5 && y < 14 ? [150, 150, 150, 255] : white)
    expect(() => run(image, { threshold: 100 })).toThrow('Nenhum contorno')
    const regular = run(image, { threshold: 200 })
    const inverted = run(image, { threshold: 200, invert: true })
    expect(regular.parts).toBe(1); expect(inverted.holes).toBe(1)
  })
  it('remove pontos pequenos e simplifica preservando o furo', () => {
    const image = ring()
    image.data.set(black, (1 * 24 + 1) * 4)
    expect(run(image).parts).toBe(2)
    const result = run(image, { minArea: 2, simplify: 0.5 })
    expect(result.parts).toBe(1); expect(result.holes).toBe(1)
    expect(meshStats(result).watertight).toBe(true)
  })
  it('fecha contornos que encostam nas bordas', () => {
    const result = run(raster(10, 10, () => black), { mode: 'dark' })
    expect(result.parts).toBe(1); expect(meshStats(result).watertight).toBe(true)
  })
  it('exporta STL binário que pode ser importado novamente com dimensões corretas', () => {
    const result = run(ring(), { width: 75, thickness: 4, base: true, baseMargin: 5, baseThickness: 2 })
    const bytes = exportSTL(result)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(80, true)).toBe(result.triangles)
    expect(bytes.byteLength).toBe(84 + result.triangles * 50)
    const geometry = new STLLoader().parse(bytes.buffer as ArrayBuffer)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    expect(box.max.x - box.min.x).toBeCloseTo(85)
    expect(box.max.y - box.min.y).toBeCloseTo(85)
    expect(box.min.z).toBe(0); expect(box.max.z).toBe(6)
    geometry.dispose()
  })
  it('mantém os dados e o STL intactos ao transformar a geometria da prévia', () => {
    const result = run(ring(), { base: true })
    const positions = result.positions.slice()
    const indices = result.indices.slice()
    const originalSTL = exportSTL(result)
    const geometry = geometryFrom(result)
    try {
      geometry.translate(-50, -50, 0)
      geometry.rotateZ(Math.PI / 3)
      expect(result.positions).toEqual(positions)
      expect(result.indices).toEqual(indices)
      expect(exportSTL(result)).toEqual(originalSTL)
    } finally {
      geometry.dispose()
    }
  })
  it('rejeita imagem vazia e dimensões inválidas com mensagem útil', () => {
    expect(() => run(raster(10, 10, () => white))).toThrow('Nenhum contorno')
    expect(() => run(ring(), { width: 0 })).toThrow('dimensões')
    expect(() => run(ring(), { thickness: NaN })).toThrow('dimensões')
    expect(() => run(ring(), { baseMargin: -1 })).toThrow('margem')
    expect(() => run(ring(), { minArea: 1e8 })).toThrow('Nenhum contorno restante')
  })
  it('libera recursos WASM entre conversões repetidas', () => {
    for (let i = 0; i < 30; i++) expect(run(ring(), { base: i % 2 === 0 }).volume).toBeGreaterThan(0)
  })
})
