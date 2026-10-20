import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'

const site = process.env.TEST_URL || 'http://127.0.0.1:3010'
const output = resolve('test-results/web')
await mkdir(output, { recursive: true })
let server
let serverLog = ''
let browser
try {
  if (!process.env.TEST_URL) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3010'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', (chunk) => { serverLog += chunk })
    server.stderr.on('data', (chunk) => { serverLog += chunk })
    let ready = false
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(site)).ok) { ready = true; break } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    assert.ok(ready, `Servidor não iniciou: ${serverLog}`)
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  const uploads = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser:', message.text()) })
  page.on('request', (request) => { if (['POST', 'PUT', 'PATCH'].includes(request.method())) uploads.push({ url: request.url(), method: request.method() }) })
  await page.goto(site)
  await page.getByRole('heading', { name: 'Da imagem à matéria.' }).waitFor()
  await page.screenshot({ path: join(output, '01-inicio.png'), fullPage: true })
  assert.equal(await page.getByRole('button', { name: 'Salvar STL' }).isEnabled(), false)
  await page.getByRole('button', { name: /explore com uma imagem/ }).click()
  await page.getByText('Prévia atualizada', { exact: true }).waitFor({ timeout: 30000 })
  await page.locator('.preview-three canvas').waitFor()
  assert.match(await page.locator('.preview-bottom').textContent(), /2 partes.*2 furos/)
  await page.screenshot({ path: join(output, '02-exemplo-3d.png'), fullPage: true })

  const fixture = join(output, 'logo transparente.png')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3200; canvas.height = 1200
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#252525'; ctx.fillRect(400, 200, 1200, 800)
    ctx.clearRect(800, 400, 400, 400); ctx.fillRect(2200, 300, 300, 600)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await writeFile(fixture, Buffer.from(png, 'base64'))
  await page.getByLabel('Selecionar imagem').setInputFiles(fixture)
  await page.getByText('logo transparente.png', { exact: true }).waitFor()
  await page.getByText('Prévia atualizada', { exact: true }).waitFor()
  await page.getByText('Prévia reduzida para', { exact: false }).waitFor()
  assert.match(await page.locator('.preview-bottom').textContent(), /2 partes.*1 furo/)
  await page.getByLabel('Largura', { exact: true }).fill('75')
  await page.locator('.stage-scale').filter({ hasText: /^75 ×/ }).waitFor()
  await page.getByLabel(/Adicionar base/).check()
  await page.locator('.stage-scale').filter({ hasText: /× 5 mm/ }).waitFor()
  await page.getByText('Prévia atualizada', { exact: true }).waitFor()
  await page.screenshot({ path: join(output, '03-base.png'), fullPage: true })

  const stlDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Salvar STL', exact: true }).click()
  const stlFile = await stlDownload
  assert.ok(stlFile.suggestedFilename().endsWith('.stl'))
  const stlPath = join(output, 'objeto.stl')
  await stlFile.saveAs(stlPath)
  const stl = await readFile(stlPath)
  assert.equal(stl.length, 84 + stl.readUInt32LE(80) * 50)
  const geometry = new STLLoader().parse(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength))
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  assert.ok(Math.abs(bounds.max.x - bounds.min.x - 81) < 0.01)
  assert.ok(Math.abs(bounds.min.x + 3) < 0.01, 'A prévia não deve deslocar as coordenadas do STL')
  assert.equal(bounds.min.z, 0); assert.equal(bounds.max.z, 5)
  geometry.dispose()
  await page.getByRole('button', { name: /SVG Vetor 2D/ }).click()
  const svgDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Salvar SVG', exact: true }).click()
  const svgPath = join(output, 'desenho.svg')
  await (await svgDownload).saveAs(svgPath)
  const svg = await readFile(svgPath, 'utf8')
  assert.match(svg, /width="75mm"/); assert.match(svg, /fill-rule="evenodd"/)
  assert.equal((svg.match(/Z/g) || []).length, 3)
  await page.getByRole('tab', { name: 'Contorno', exact: true }).click()
  await page.getByAltText('Contornos vetoriais com furos preservados').waitFor()
  await page.getByLabel('Largura', { exact: true }).fill('0')
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Salvar SVG' }).isEnabled(), false)
  await page.getByLabel('Largura', { exact: true }).fill('100')
  await page.getByText('Prévia atualizada', { exact: true }).waitFor()
  await page.getByLabel('Selecionar imagem').setInputFiles({ name: 'invalida.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') })
  await page.getByRole('alert').filter({ hasText: 'Não foi possível ler a imagem' }).waitFor()
  await page.getByRole('button', { name: 'Fechar mensagem' }).click()
  const drop = await page.evaluateHandle((data) => {
    const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'arrastada.png', { type: 'image/png' }))
    return transfer
  }, png)
  await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: drop })
  await drop.dispose()
  await page.getByText('arrastada.png', { exact: true }).waitFor()
  await page.getByText('Prévia atualizada', { exact: true }).waitFor()
  await page.getByRole('tab', { name: 'Modelo 3D' }).click()
  await page.locator('.preview-three canvas').waitFor()
  await page.mouse.move(850, 450); await page.mouse.down(); await page.mouse.move(920, 470, { steps: 8 }); await page.mouse.up()
  await page.mouse.wheel(0, -100)
  await page.screenshot({ path: join(output, '04-final.png'), fullPage: true })
  for (const [extension, mimeType] of [['jpg', 'image/jpeg'], ['webp', 'image/webp']]) {
    const bytes = await page.evaluate((mime) => {
      const canvas = document.createElement('canvas')
      canvas.width = 240; canvas.height = 160
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 240, 160)
      ctx.fillStyle = '#111'; ctx.fillRect(40, 30, 160, 100)
      ctx.fillStyle = '#fff'; ctx.fillRect(90, 60, 60, 40)
      return canvas.toDataURL(mime).split(',')[1]
    }, mimeType)
    await page.getByLabel('Selecionar imagem').setInputFiles({ name: `desenho.${extension}`, mimeType, buffer: Buffer.from(bytes, 'base64') })
    await page.getByText(`desenho.${extension}`, { exact: true }).waitFor()
    await page.getByText('Prévia atualizada', { exact: true }).waitFor()
    assert.match(await page.locator('.preview-bottom').textContent(), /1 parte.*1 furo/)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByLabel('Largura', { exact: true }).fill('50')
  await page.getByText('Prévia atualizada', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'A interface móvel não deve ter rolagem horizontal')
  await page.screenshot({ path: join(output, '05-mobile.png'), fullPage: true })

  // An unavailable WASM asset must show a useful error and allow a retry.
  const recoveryContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  await recoveryContext.route('**/wasm/manifold.wasm', (route) => route.fulfill({ status: 503, body: 'Temporarily unavailable' }))
  const recoveryPage = await recoveryContext.newPage()
  recoveryPage.on('pageerror', (error) => errors.push(error.message))
  await recoveryPage.goto(site)
  await recoveryPage.getByRole('button', { name: /explore com uma imagem/ }).click()
  await recoveryPage.getByRole('alert').filter({ hasText: 'Não foi possível carregar o motor de conversão' }).waitFor({ timeout: 30000 })
  assert.equal(await recoveryPage.getByRole('button', { name: 'Salvar STL' }).isEnabled(), false)
  await recoveryContext.unroute('**/wasm/manifold.wasm')
  await recoveryPage.getByRole('button', { name: 'Restaurar ajustes' }).click()
  await recoveryPage.getByText('Prévia atualizada', { exact: true }).waitFor({ timeout: 30000 })
  assert.equal(await recoveryPage.getByRole('button', { name: 'Salvar STL' }).isEnabled(), true)
  await recoveryContext.close()
  assert.deepEqual(errors, [])
  assert.deepEqual(uploads, [], 'Imagens e modelos devem permanecer no navegador')
  const report = { site, framework: 'Next.js', errors, uploads, stlBytes: stl.length, svgBytes: svg.length,
    checks: ['example', 'png-jpg-webp-upload', 'downsample', 'alpha-and-holes', 'dimensions', 'base', 'download-stl-roundtrip', 'stable-export-coordinates', 'download-svg', 'tabs', 'invalid-dimensions', 'corrupt-image', 'drag-drop', 'rotate-zoom', 'mobile', 'wasm-failure-recovery', 'no-image-network-uploads'] }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (browser) await browser.close()
  if (server) server.kill()
  await writeFile(join(output, 'server.log'), serverLog)
}
