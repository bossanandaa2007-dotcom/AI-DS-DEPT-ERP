import { useEffect, useRef } from 'react'

/**
 * Ambient node-graph texture for the login scene — a quiet nod to the department's field, held at
 * grain-level opacity so it never competes with the campus photo behind it. It is mounted once for
 * the whole intro → welcome → choice sequence and never restarted per phase.
 *
 * The loop pauses while the tab is backgrounded. Under `prefers-reduced-motion` it paints a single
 * static frame and starts no animation loop at all.
 */
const NODE_COUNT = 30
const LINK_DISTANCE = 168
const MAX_SPEED = 0.18
const WANDER = 0.008
const LINK_ALPHA = 0.14
const NODE_ALPHA = 0.16

interface Node { x: number; y: number; vx: number; vy: number }

export function NeuralField({ reduced }: { reduced: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    // Single source of truth for the accent — see --scene-accent in globals.css.
    const raw = getComputedStyle(canvas).getPropertyValue('--scene-accent').trim()
    const accent = raw ? raw.split(/\s+/).join(',') : '127,211,223'

    let width = 0
    let height = 0
    const nodes: Node[] = []

    const seed = () => {
      nodes.length = 0
      for (let i = 0; i < NODE_COUNT; i += 1) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * MAX_SPEED,
          vy: (Math.random() - 0.5) * MAX_SPEED,
        })
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (width > 0 && height > 0 && nodes.length === 0) seed()
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j]
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist > LINK_DISTANCE) continue
          ctx.strokeStyle = `rgba(${accent},${(1 - dist / LINK_DISTANCE) * LINK_ALPHA})`
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
      ctx.fillStyle = `rgba(${accent},${NODE_ALPHA})`
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const advance = () => {
      for (const n of nodes) {
        n.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, n.vx + (Math.random() - 0.5) * WANDER))
        n.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, n.vy + (Math.random() - 0.5) * WANDER))
        n.x += n.vx
        n.y += n.vy
        if (n.x <= 0 || n.x >= width) n.vx *= -1
        if (n.y <= 0 || n.y >= height) n.vy *= -1
        n.x = Math.max(0, Math.min(width, n.x))
        n.y = Math.max(0, Math.min(height, n.y))
      }
    }

    resize()

    if (reduced) {
      draw()
      const observer = new ResizeObserver(() => { resize(); draw() })
      observer.observe(canvas)
      return () => observer.disconnect()
    }

    let frame = 0
    let running = false
    const tick = () => { advance(); draw(); frame = requestAnimationFrame(tick) }
    const start = () => { if (!running) { running = true; frame = requestAnimationFrame(tick) } }
    const stop = () => { running = false; cancelAnimationFrame(frame) }
    const onVisibility = () => { if (document.hidden) stop(); else start() }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduced])

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
}
