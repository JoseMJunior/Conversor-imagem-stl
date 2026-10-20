'use client'

import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, Box, Check, ChevronRight, CircleHelp, FileImage, Focus, ImagePlus, Layers3, LoaderCircle, MousePointer2, PenTool, RotateCcw, ShieldCheck, SlidersHorizontal, Upload, X } from 'lucide-react'
import { DEFAULT_OPTIONS } from '../shared/types'
import type { ConversionOptions, ConversionResult, ExportFormat, ImageFile, WorkerResponse } from '../shared/types'
import { loadImage } from './image'
import type { LoadedImage } from './image'

const Preview3D = lazy(() => import('./Preview3D'))
const fmt = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
type Tab = 'original' | 'contour' | '3d'
type Snapshot = { image: LoadedImage; options: ConversionOptions; result: ConversionResult }

function NumberField({ label, value, onChange, min = 0.1, suffix = 'mm', hint }: { label: string; value: number; onChange(value: number): void; min?: number; suffix?: string; hint?: string }) {
  return <label className="number-field"><span>{label}</span><div className="number-input"><input aria-label={label} type="number" min={min} step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{suffix}</span></div>{hint ? <small>{hint}</small> : null}</label>
}

function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange(value: number): void }) {
  return <label className="slider-field"><span>{label}<output>{fmt(value)}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange(value: boolean): void; description?: string }) {
  return <label className="toggle-label"><span>{label}{description ? <small>{description}</small> : null}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="toggle" aria-hidden="true" /></label>
}

async function exampleFile(): Promise<ImageFile> {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 640
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 900, 640)
  ctx.fillStyle = '#191919'
  ctx.beginPath()
  ctx.moveTo(100, 500); ctx.lineTo(280, 140); ctx.lineTo(460, 500)
  ctx.lineTo(360, 500); ctx.lineTo(330, 430); ctx.lineTo(230, 430); ctx.lineTo(200, 500); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.moveTo(255, 350); ctx.lineTo(305, 350); ctx.lineTo(280, 285); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#191919'
  ctx.beginPath(); ctx.arc(640, 330, 145, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(640, 330, 75, 0, Math.PI * 2); ctx.fill()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao abrir exemplo.')), 'image/png'))
  return { name: 'exemplo-contorno.png', bytes: new Uint8Array(await blob.arrayBuffer()) }
}

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_OPTIONS)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tab, setTab] = useState<Tab>('3d')
  const [format, setFormat] = useState<ExportFormat>('stl')
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const [help, setHelp] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [svgUrl, setSvgUrl] = useState('')
  const worker = useRef<Worker | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const request = useRef<{ id: number; image: LoadedImage; options: ConversionOptions } | null>(null)
  const sequence = useRef(0)
  const loadSequence = useRef(0)
  const fresh = !!snapshot && snapshot.image === image && snapshot.options === options
  const result = snapshot?.image === image ? snapshot.result : null
  const change = <K extends keyof ConversionOptions>(key: K, value: ConversionOptions[K]) => setOptions((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    const instance = new Worker(new URL('./conversion.worker.ts', import.meta.url), { type: 'module' })
    worker.current = instance
    instance.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const active = request.current
      if (!active || data.id !== active.id) return
      setProcessing(false)
      if ('error' in data) setError(data.error)
      else { setSnapshot({ image: active.image, options: active.options, result: data.result }); setError('') }
    }
    instance.onerror = () => { setProcessing(false); setError('O motor de conversão não pôde iniciar. Recarregue a página para tentar novamente.') }
    return () => { instance.terminate(); worker.current = null; loadSequence.current++ }
  }, [])

  useEffect(() => {
    if (!image) return
    setError('')
    setNotice('')
    setProcessing(true)
    const id = ++sequence.current
    request.current = { id, image, options }
    const timer = setTimeout(() => worker.current?.postMessage({ id, image: image.raster, options }), 220)
    return () => clearTimeout(timer)
  }, [image, options])

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])
  useEffect(() => {
    if (!result) { setSvgUrl(''); return }
    const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }))
    setSvgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result])

  async function importFile(file: ImageFile) {
    const id = ++loadSequence.current
    setLoading(true); setError(''); setNotice('')
    try {
      const next = await loadImage(file)
      if (id !== loadSequence.current) { URL.revokeObjectURL(next.url); return }
      setImage(next); setSnapshot(null)
    } catch (failure) {
      if (id === loadSequence.current) setError(failure instanceof Error ? failure.message : 'Não foi possível abrir a imagem.')
    } finally { if (id === loadSequence.current) setLoading(false) }
  }

  function openImage() { fileInput.current?.click() }

  async function save() {
    if (!snapshot || !fresh || loading || saving) return
    setSaving(true); setError(''); setNotice('')
    try {
      const bytes = format === 'svg' ? new TextEncoder().encode(snapshot.result.svg) : (await import('../core/export')).exportSTL(snapshot.result)
      const blob = new Blob([new Uint8Array(bytes)], { type: format === 'svg' ? 'image/svg+xml' : 'model/stl' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${image!.name.replace(/\.[^.]+$/, '')}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`Download do ${format.toUpperCase()} iniciado.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar o arquivo.') }
    finally { setSaving(false) }
  }

  return <div className="app-shell" onDragOver={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDragging(true) }} onDrop={async (event) => {
    event.preventDefault(); setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) {
      if (file.size > 50 * 1024 * 1024) { setError('A imagem deve ter até 50 MB.'); return }
      try { await importFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }) }
      catch { setError('Não foi possível ler o arquivo arrastado.') }
    }
  }}>
    <input className="hidden" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Selecionar imagem" onChange={async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      if (file.size > 50 * 1024 * 1024) { setError('A imagem deve ter até 50 MB.'); return }
      try { await importFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }) }
      catch { setError('Não foi possível ler a imagem.') }
    }} />
    <header className="app-header">
      <div className="brand"><div className="brand-symbol"><Layers3 size={23} strokeWidth={1.8} /></div><span>contorno<span className="brand-studio">STUDIO</span></span></div>
      <div className="header-path"><span>Área de criação</span><ChevronRight size={13} /><strong>Novo objeto</strong></div>
      <div className="header-actions"><button className="mobile-settings" onClick={() => setShowControls(!showControls)} aria-expanded={showControls} aria-controls="image-controls"><SlidersHorizontal size={15} />Ajustes</button><span className="local-badge"><span />100% local</span><button className="icon-button" onClick={() => setHelp(!help)} title="Ajuda" aria-label="Ajuda" aria-expanded={help}><CircleHelp size={19} /></button></div>
    </header>
    <div className="app-body">
      <aside id="image-controls" className={`sidebar ${showControls ? 'mobile-open' : ''}`}>
        <div className="sidebar-title"><SlidersHorizontal size={17} /><h2>Seu objeto, do seu jeito</h2></div>
        <section className="control-section">
          <div className="section-title"><span className="step">01</span><h3>Imagem de origem</h3></div>
          <button className={`upload-card ${image ? 'has-image' : ''}`} onClick={openImage} disabled={loading}>
            {image ? <><div className="thumbnail checker"><img src={image.url} alt="Imagem selecionada" /></div><div className="image-meta"><strong title={image.name}>{image.name}</strong><span>{image.originalWidth} × {image.originalHeight} px</span></div><RotateCcw size={15} /></> : <><div className="upload-icon"><ImagePlus size={23} /></div><strong>Escolha uma imagem</strong><span>ou arraste o arquivo até aqui</span><small>PNG, JPG ou WebP · até 50 MB</small></>}
          </button>
          {image?.reduced ? <p className="field-note">Prévia reduzida para {image.raster.width} × {image.raster.height} px para manter o processamento leve.</p> : null}
        </section>
        <section className="control-section">
          <div className="section-title"><span className="step">02</span><h3>Contorno</h3><PenTool size={14} /></div>
          <label className="select-field"><span>Detectar desenho por</span><select value={options.mode} onChange={(event) => change('mode', event.target.value as ConversionOptions['mode'])}><option value="auto">Automático</option><option value="alpha">Transparência</option><option value="dark">Tons escuros</option><option value="light">Tons claros</option></select></label>
          <Slider label="Limiar de detecção" min={1} max={254} value={options.threshold} onChange={(value) => change('threshold', value)} />
          <Toggle label="Inverter seleção" checked={options.invert} onChange={(value) => change('invert', value)} />
          <Slider label="Simplificar contorno" min={0} max={5} step={0.1} suffix=" px" value={options.simplify} onChange={(value) => change('simplify', value)} />
          <Slider label="Remover pontos menores que" min={0} max={500} suffix=" px²" value={options.minArea} onChange={(value) => change('minArea', value)} />
        </section>
        <section className="control-section">
          <div className="section-title"><span className="step">03</span><h3>Dimensões</h3><Box size={14} /></div>
          <div className="dimension-grid"><NumberField label="Largura" value={options.width} onChange={(value) => change('width', value)} /><div className="number-field"><span>Altura <span className="linked">↔</span></span><div className="number-input readonly"><span>{result ? fmt(result.height) : '—'}</span><span>mm</span></div></div></div>
          <p className="field-note">Proporções do desenho sempre preservadas.</p>
          <NumberField label="Espessura do desenho · STL" value={options.thickness} onChange={(value) => change('thickness', value)} />
        </section>
        <section className="control-section base-section">
          <Toggle label="Adicionar base" description="Una as partes em uma única peça STL" checked={options.base} onChange={(value) => change('base', value)} />
          {options.base ? <div className="dimension-grid base-fields"><NumberField label="Espessura" value={options.baseThickness} onChange={(value) => change('baseThickness', value)} /><NumberField label="Margem" min={0} value={options.baseMargin} onChange={(value) => change('baseMargin', value)} /></div> : null}
        </section>
        <button className="reset-button" onClick={() => setOptions({ ...DEFAULT_OPTIONS })}><RotateCcw size={13} />Restaurar ajustes</button>
        <div className="privacy-note"><ShieldCheck size={17} /><span>Sua imagem fica com você.<br />Tudo acontece neste computador.</span></div>
      </aside>
      <main className="workspace">
        <div className="workspace-heading"><div><div className="eyebrow"><span /> DO PIXEL AO OBJETO</div><h1>Da imagem à matéria<span>.</span></h1><p>Transforme suas ideias em formas que você pode criar.</p></div><button className="button secondary" onClick={openImage} disabled={loading}><Upload size={16} />Abrir imagem</button></div>
        {help ? <div className="help-card"><div><strong>Um contorno. Duas possibilidades.</strong><p>Use logos com fundo uniforme ou transparente. Ajuste a seleção na aba Contorno. SVG guarda o desenho em uma cor; STL adiciona espessura para impressão 3D. Letras separadas podem ser unidas pela base. Arraste o modelo para girar, role para aproximar e dê dois cliques para centralizar.</p><p>O tamanho é calculado a partir do desenho, sem as bordas vazias da imagem. No fatiador, use milímetros.</p></div><button className="icon-button" aria-label="Fechar ajuda" onClick={() => setHelp(false)}><X size={17} /></button></div> : null}
        {error ? <div role="alert" className="message error"><span>{error}</span><button className="icon-button" aria-label="Fechar mensagem" onClick={() => setError('')}><X size={15} /></button></div> : null}
        {notice ? <div role="status" className="message success"><Check size={16} /><span>{notice}</span></div> : null}
        <div className="preview-card">
          <div className="preview-toolbar"><div className="tabs" role="tablist" aria-label="Visualização">{([{ id: 'original', label: 'Original', icon: FileImage }, { id: 'contour', label: 'Contorno', icon: PenTool }, { id: '3d', label: 'Modelo 3D', icon: Box }] as const).map(({ id, label, icon: Icon }) => <button key={id} role="tab" id={`tab-${id}`} aria-controls="preview-panel" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={15} />{label}</button>)}</div><span className={`preview-status ${fresh ? 'ready' : ''}`} role="status">{loading || processing ? <LoaderCircle size={13} className="spin" /> : <span />}{loading ? 'Abrindo imagem' : processing ? 'Processando' : fresh ? 'Prévia atualizada' : 'Aguardando imagem'}</span></div>
          <div className={`preview-stage ${tab !== '3d' && image ? 'checker' : ''}`} id="preview-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} aria-busy={loading || processing}>
            {!image ? <div className="empty-state"><div className="empty-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-layer layer-bottom" /><div className="art-layer layer-middle" /><div className="art-layer layer-top"><Layers3 size={55} strokeWidth={1} /></div><span className="art-plus plus-one">+</span><span className="art-plus plus-two">+</span></div><span className="empty-label">UM NOVO PONTO DE PARTIDA</span><h2>Uma imagem.<br />Infinitas possibilidades.</h2><p>Traga seu logo, desenho ou ideia.<br />A gente dá forma ao próximo passo.</p><button className="button primary" onClick={openImage}><ImagePlus size={17} />Escolher imagem<ArrowRight size={16} /></button><button className="example-button" onClick={async () => { try { await importFile(await exampleFile()) } catch { setError('Não foi possível abrir o exemplo.') } }}>ou explore com uma imagem de exemplo <ChevronRight size={13} /></button></div>
              : tab === 'original' ? <img className="image-preview" src={image.url} alt="Imagem original" />
              : tab === 'contour' && result && svgUrl ? <img className="image-preview vector-preview" src={svgUrl} alt="Contornos vetoriais com furos preservados" />
              : tab === '3d' && result ? <Suspense fallback={<div className="stage-placeholder"><LoaderCircle className="spin" />Preparando visualização 3D…</div>}><Preview3D result={result} /></Suspense>
              : <div className="stage-placeholder">{processing ? <><LoaderCircle className="spin" />Extraindo o contorno da sua imagem…</> : 'Ajuste a seleção para encontrar o desenho.'}</div>}
            {image && result ? <><div className="stage-label"><span />{tab === '3d' ? 'PERSPECTIVA' : tab === 'contour' ? 'VETOR 2D' : 'IMAGEM ORIGINAL'}</div><div className="stage-scale">{fmt(result.width)} × {fmt(result.height)}{tab === '3d' ? ` × ${fmt(result.totalHeight)}` : ''} mm</div></> : null}
          </div>
          <div className="preview-bottom"><span><MousePointer2 size={13} />{tab === '3d' ? 'Arraste para girar · Role para aproximar' : 'Acompanhe o resultado dos ajustes'}</span><span>{result ? <>{result.parts} {result.parts === 1 ? 'parte' : 'partes'}<i />{result.holes} {result.holes === 1 ? 'furo' : 'furos'}<i />{fmt(result.triangles)} triângulos</> : <><Focus size={13} />Prévia interativa</>}</span></div>
        </div>
        <div className="export-card"><div className="export-intro"><div className="export-icon"><ArrowDownToLine size={21} /></div><div><h2>Pronto para sair da tela?</h2><p>Escolha o formato e leve sua criação com você.</p></div></div><div className="export-actions"><div className="format-picker" role="group" aria-label="Formato de exportação"><button className={format === 'svg' ? 'selected' : ''} onClick={() => setFormat('svg')}><PenTool size={16} /><span>SVG<small>Vetor 2D</small></span>{format === 'svg' ? <Check size={13} /> : null}</button><button className={format === 'stl' ? 'selected' : ''} onClick={() => setFormat('stl')}><Box size={16} /><span>STL<small>Objeto 3D</small></span>{format === 'stl' ? <Check size={13} /> : null}</button></div><button className="button primary export-button" disabled={!fresh || loading || saving} onClick={save}>{saving ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />}Salvar {format.toUpperCase()}</button></div></div>
        {image && result && result.parts > 1 && !options.base && format === 'stl' ? <p className="parts-note"><Layers3 size={14} />Este desenho tem {result.parts} partes soltas. Ative a base para imprimir tudo em uma peça.</p> : null}
        <footer className="workspace-footer"><span><ShieldCheck size={13} />Privado por natureza. Criativo por escolha.</span><span>CONTORNO STUDIO <i /> v1.1</span></footer>
      </main>
    </div>
    {dragging ? <div className="drop-overlay" onDragLeave={() => setDragging(false)}><div><Upload size={40} /><h2>Solte sua imagem aqui</h2><p>Vamos dar forma a essa ideia.</p></div></div> : null}
  </div>
}
