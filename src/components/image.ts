import type { ImageFile, RasterImage } from '../shared/types'

export interface LoadedImage { name: string; url: string; raster: RasterImage; originalWidth: number; originalHeight: number; reduced: boolean }

export async function loadImage(file: ImageFile): Promise<LoadedImage> {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error('Escolha uma imagem PNG, JPG ou WebP.')
  if (file.bytes.byteLength > 50 * 1024 * 1024) throw new Error('A imagem deve ter até 50 MB.')
  const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)]))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const ratio = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível preparar a imagem.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const raster = context.getImageData(0, 0, canvas.width, canvas.height)
    return { name: file.name, url, raster: { width: raster.width, height: raster.height, data: raster.data },
      originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, reduced: ratio < 1 }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('Não foi possível ler a imagem. Verifique se o arquivo é um PNG, JPG ou WebP válido.')
  }
}
