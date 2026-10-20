import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { STLExporter } from 'three/addons/exporters/STLExporter.js'
import type { ConversionResult } from '../shared/types'

export function geometryFrom(result: ConversionResult): BufferGeometry {
  const geometry = new BufferGeometry()
  // Preview transforms must not mutate the canonical mesh used for exports.
  geometry.setAttribute('position', new BufferAttribute(result.positions.slice(), 3))
  geometry.setIndex(new BufferAttribute(result.indices.slice(), 1))
  geometry.computeVertexNormals()
  return geometry
}

export function exportSTL(result: ConversionResult): Uint8Array {
  const geometry = geometryFrom(result)
  const mesh = new Mesh(geometry)
  try {
    const buffer = new STLExporter().parse(mesh, { binary: true })
    // STL omits units; coordinates are in millimeters by convention.
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  } finally {
    geometry.dispose()
    if (!Array.isArray(mesh.material)) mesh.material.dispose()
  }
}
