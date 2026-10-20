import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Contorno Studio — Imagem para SVG e STL',
  description: 'Transforme logos e desenhos em vetores SVG e objetos STL com espessura. Prévia 3D e processamento privado no seu navegador.'
}
export const viewport: Viewport = { themeColor: '#101316' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="antialiased">{children}</body></html>
}
