export type DetectionMode = 'auto' | 'alpha' | 'dark' | 'light'
export type ExportFormat = 'svg' | 'stl'

export interface ConversionOptions {
  mode: DetectionMode
  threshold: number
  invert: boolean
  simplify: number
  minArea: number
  width: number
  thickness: number
  base: boolean
  baseThickness: number
  baseMargin: number
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  mode: 'auto', threshold: 128, invert: false, simplify: 0.5, minArea: 0,
  width: 100, thickness: 3, base: false, baseThickness: 2, baseMargin: 3
}

export interface RasterImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface ConversionResult {
  svg: string
  positions: Float32Array
  indices: Uint32Array
  width: number
  height: number
  totalHeight: number
  parts: number
  holes: number
  triangles: number
  volume: number
  detectedMode: Exclude<DetectionMode, 'auto'>
}

export interface ImageFile { name: string; bytes: Uint8Array }

export interface WorkerRequest { id: number; image: RasterImage; options: ConversionOptions }
export type WorkerResponse = { id: number; result: ConversionResult } | { id: number; error: string }
