'use client'

import { useEffect, useRef, useState } from 'react'
import { AmbientLight, Box3, Color, DirectionalLight, GridHelper, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { geometryFrom } from '../core/export'
import type { ConversionResult } from '../shared/types'

export default function Preview3D({ result }: { result: ConversionResult }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const element = host.current
    if (!element) return
    let renderer: WebGLRenderer
    try { renderer = new WebGLRenderer({ antialias: true, alpha: false }) }
    catch { setError(true); return }
    setError(false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(new Color('#151a1e'))
    element.appendChild(renderer.domElement)
    const scene = new Scene()
    const camera = new PerspectiveCamera(35, 1, 0.01, 100000)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.94
    const geometry = geometryFrom(result)
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox as Box3
    const center = bounds.getCenter(new Vector3())
    geometry.translate(-center.x, -center.y, 0)
    const material = new MeshStandardMaterial({ color: '#dbc5a1', metalness: 0.22, roughness: 0.43, flatShading: true })
    scene.add(new Mesh(geometry, material))
    scene.add(new AmbientLight('#ffffff', 1.7))
    const key = new DirectionalLight('#fff0d7', 3.8)
    key.position.set(-80, -100, 180)
    scene.add(key)
    const fill = new DirectionalLight('#adcaff', 1.5)
    fill.position.set(100, 80, 120)
    scene.add(fill)
    const size = bounds.getSize(new Vector3())
    const span = Math.max(size.x, size.y, size.z)
    const grid = new GridHelper(span * 4, 40, '#3b4248', '#252c31')
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.08
    scene.add(grid)
    const fitCamera = () => {
      const distance = span * 1.8 / Math.min(1, camera.aspect)
      camera.position.set(distance * 0.36, -distance * 0.65, distance * 0.85)
      controls.target.set(0, 0, result.totalHeight / 2)
      controls.minDistance = span * 0.2
      controls.maxDistance = span * 12
      controls.update()
    }
    const resize = () => {
      renderer.setSize(element.clientWidth, element.clientHeight)
      camera.aspect = element.clientWidth / Math.max(1, element.clientHeight)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    fitCamera()
    const reset = () => { fitCamera() }
    element.addEventListener('dblclick', reset)
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })
    return () => {
      observer.disconnect()
      element.removeEventListener('dblclick', reset)
      renderer.setAnimationLoop(null)
      controls.dispose()
      geometry.dispose()
      material.dispose()
      grid.geometry.dispose()
      if (Array.isArray(grid.material)) grid.material.forEach((item) => item.dispose())
      else grid.material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [result])
  return <div className="preview-three" ref={host} role="img" aria-label="Modelo 3D. Arraste para girar, use a roda do mouse para aproximar e clique duas vezes para centralizar.">
    {error ? <div className="preview-fallback">A prévia 3D precisa de aceleração gráfica. Você pode visualizar o contorno e salvar os arquivos normalmente.</div> : null}
  </div>
}
