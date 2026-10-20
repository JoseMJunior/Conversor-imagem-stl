import { contours } from 'd3-contour'
import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d'
import type { ConversionOptions, ConversionResult, RasterImage } from '../shared/types'

export function detectMode(image: RasterImage): 'alpha' | 'dark' | 'light' {
  let border = 0
  let samples = 0
  let transparent = false
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4
      if (image.data[i + 3] < 128) transparent = true
      if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) {
        border += luminance(image.data, i)
        samples++
      }
    }
  }
  return transparent ? 'alpha' : border / samples >= 128 ? 'dark' : 'light'
}

function luminance(data: Uint8ClampedArray, i: number): number {
  return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722
}

function validate(image: RasterImage, options: ConversionOptions): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 2048 || image.height > 2048 || image.data.length !== image.width * image.height * 4) throw new Error('Imagem inválida ou acima do limite de processamento.')
  if (!['auto', 'alpha', 'dark', 'light'].includes(options.mode)) throw new Error('Modo de detecção inválido.')
  for (const value of [options.width, options.thickness, options.baseThickness]) {
    if (!Number.isFinite(value) || value <= 0 || value > 10000) throw new Error('As dimensões devem ser maiores que zero e até 10.000 mm.')
  }
  if (!Number.isFinite(options.baseMargin) || options.baseMargin < 0 || options.baseMargin > 10000) throw new Error('A margem da base deve estar entre 0 e 10.000 mm.')
  if (!Number.isFinite(options.threshold) || options.threshold < 1 || options.threshold > 254 || !Number.isFinite(options.simplify) || options.simplify < 0 || options.simplify > 5 || !Number.isFinite(options.minArea) || options.minArea < 0) throw new Error('Ajustes de contorno inválidos.')
}

function number(value: number): string { return Number(value.toFixed(5)).toString() }

export function convert(image: RasterImage, options: ConversionOptions, engine: ManifoldToplevel): ConversionResult {
  validate(image, options)
  const mode = options.mode === 'auto' ? detectMode(image) : options.mode
  // A zero-valued frame closes contours that touch the edge of the image.
  const gridWidth = image.width + 2
  const gridHeight = image.height + 2
  const values = new Float32Array(gridWidth * gridHeight)
  const selectionThreshold = mode === 'dark' ? 1 - options.threshold / 255 : options.threshold / 255
  const threshold = options.invert ? 1 - selectionThreshold : selectionThreshold
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4
      const alpha = image.data[i + 3] / 255
      const light = luminance(image.data, i) / 255
      const value = mode === 'alpha' ? alpha : (mode === 'dark' ? 1 - light : light)
      const selected = options.invert ? 1 - value : value
      values[(y + 1) * gridWidth + x + 1] = mode === 'alpha' ? selected : selected * alpha
    }
  }
  const traced = contours().size([gridWidth, gridHeight]).smooth(true).contour(Array.from(values), threshold)
  const paths: Vec2[][] = traced.coordinates.flatMap((polygon) => polygon.map((ring) => ring.slice(0, -1).map(([x, y]): Vec2 => [x, -y])))
  if (!paths.length) throw new Error('Nenhum contorno encontrado. Ajuste a detecção, o limiar ou a inversão.')
  const handles: Array<CrossSection | Manifold> = []
  const keep = <T extends CrossSection | Manifold>(handle: T): T => { handles.push(handle); return handle }
  try {
    let cross = keep(new engine.CrossSection(paths, 'EvenOdd'))
    if (options.simplify > 0) cross = keep(cross.simplify(options.simplify))
    const components = cross.decompose().map(keep)
    const retained = components.filter((component) => component.area() >= options.minArea)
    if (!retained.length) throw new Error('Nenhum contorno restante. Diminua a remoção de pontos ou a simplificação.')
    cross = keep(engine.CrossSection.union(retained))
    const bounds = cross.bounds()
    const pixelWidth = bounds.max[0] - bounds.min[0]
    const pixelHeight = bounds.max[1] - bounds.min[1]
    if (pixelWidth <= 0 || pixelHeight <= 0) throw new Error('O contorno não tem uma área válida.')
    const scale = options.width / pixelWidth
    cross = keep(keep(cross.translate([-bounds.min[0], -bounds.min[1]])).scale(scale))
    const width = options.width
    const height = pixelHeight * scale
    const polygons = cross.toPolygons()
    const path = polygons.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${number(x)} ${number(height - y)}`).join(' ') + ' Z').join(' ')
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}mm" height="${number(height)}mm" viewBox="0 0 ${number(width)} ${number(height)}"><path fill="#000000" fill-rule="evenodd" d="${path}"/></svg>\n`
    const totalHeight = options.thickness + (options.base ? options.baseThickness : 0)
    let solid = keep(cross.extrude(totalHeight))
    if (options.base) {
      const block = keep(engine.Manifold.cube([width + 2 * options.baseMargin, height + 2 * options.baseMargin, options.baseThickness]))
      const base = keep(block.translate([-options.baseMargin, -options.baseMargin, 0]))
      solid = keep(solid.add(base))
    }
    if (solid.status() !== 'NoError' || solid.isEmpty()) throw new Error('Não foi possível gerar uma malha fechada. Ajuste o contorno e tente novamente.')
    const mesh = solid.getMesh()
    const positions = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3)
    for (let i = 0, j = 0; i < mesh.vertProperties.length; i += mesh.numProp, j += 3) {
      positions[j] = mesh.vertProperties[i]
      positions[j + 1] = mesh.vertProperties[i + 1]
      positions[j + 2] = mesh.vertProperties[i + 2]
    }
    const sections = cross.decompose().map(keep)
    const holes = sections.reduce((sum, part) => sum + part.numContour() - 1, 0)
    return { svg, positions, indices: new Uint32Array(mesh.triVerts), width, height, totalHeight,
      parts: sections.length, holes, triangles: mesh.triVerts.length / 3, volume: solid.volume(), detectedMode: mode }
  } finally {
    for (let i = handles.length - 1; i >= 0; i--) handles[i].delete()
  }
}
