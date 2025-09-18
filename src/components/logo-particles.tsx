"use client"

import { useRef, useEffect, useState } from "react"

interface LogoParticlesProps {
  width?: number
  height?: number
  logoSrc?: string
  className?: string
  particleCount?: number
  scatterDistance?: number
  scatterColor?: string
}

export default function LogoParticles({
  width = 400,
  height = 300,
  logoSrc = "/logo.png",
  className = "",
  particleCount = 2000,
  scatterDistance = 120,
  scatterColor = "#10B981",
}: LogoParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mousePositionRef = useRef({ x: 0, y: 0 })
  const isTouchingRef = useRef(false)
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width, height })

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => setLogoImage(img)
    img.src = logoSrc
  }, [logoSrc])

  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setCanvasSize({ width: rect.width, height: rect.height })
      }
    }

    updateCanvasSize()
    window.addEventListener("resize", updateCanvasSize)
    return () => window.removeEventListener("resize", updateCanvasSize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !logoImage) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = canvasSize.width
    canvas.height = canvasSize.height

    const particles: {
      x: number
      y: number
      baseX: number
      baseY: number
      size: number
      color: string
      scatteredColor: string
      life: number
    }[] = []

    let textImageData: ImageData | null = null
    let logoScale: number = 1

    function createTextImage() {
      if (!ctx || !canvas || !logoImage) return 0

      ctx.fillStyle = "white"
      ctx.save()

      // Improved logo sizing - use more of the canvas space for smaller sizes
      const sizeRatio = Math.min(canvas.width, canvas.height) / 400
      const maxLogoSize = Math.min(canvas.width * 0.8, canvas.height * 0.8)
      const logoHeight = Math.min(maxLogoSize, Math.max(80, 120 * sizeRatio))
      const logoWidth = logoHeight * (logoImage.width / logoImage.height)

      // Center the logo
      ctx.translate(canvas.width / 2 - logoWidth / 2, canvas.height / 2 - logoHeight / 2)

      // Draw custom logo
      const imageScale = logoHeight / logoImage.height
      logoScale = imageScale
      ctx.scale(imageScale, imageScale)
      ctx.drawImage(logoImage, 0, 0)

      ctx.restore()

      textImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      return imageScale
    }

    function createParticle() {
      if (!ctx || !canvas || !textImageData) return null

      const data = textImageData.data

      // Increased attempts for better coverage
      for (let attempt = 0; attempt < 300; attempt++) {
        const x = Math.floor(Math.random() * canvas.width)
        const y = Math.floor(Math.random() * canvas.height)

        if (data[(y * canvas.width + x) * 4 + 3] > 128) {
          // Scale particle size based on canvas size and logo scale
          const baseSizeMultiplier = Math.min(canvas.width, canvas.height) / 400
          const particleSize = Math.max(0.3, Math.min(2, 
            (Math.random() * 0.8 + 0.4) * baseSizeMultiplier * logoScale
          ))
          
          return {
            x: x,
            y: y,
            baseX: x,
            baseY: y,
            size: particleSize,
            color: "white",
            scatteredColor: scatterColor,
            life: Math.random() * 100 + 50,
          }
        }
      }

      return null
    }

    function createInitialParticles() {
      if (!canvas) return
      
      // Better particle density calculation
      const canvasArea = canvas.width * canvas.height
      const referenceArea = 400 * 300
      const areaRatio = canvasArea / referenceArea
      
      // Use square root for more balanced scaling
      const scalingFactor = Math.sqrt(areaRatio)
      
      // Minimum particle count for small sizes
      const minParticles = Math.min(500, particleCount * 0.4)
      const scaledParticleCount = Math.max(minParticles, Math.floor(particleCount * scalingFactor))
      
      // Create particles with multiple passes for better coverage
      const maxAttempts = scaledParticleCount * 3
      let attempts = 0
      
      while (particles.length < scaledParticleCount && attempts < maxAttempts) {
        const particle = createParticle()
        if (particle) {
          particles.push(particle)
        }
        attempts++
      }
    }

    let animationFrameId: number

    function animate() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "black"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const { x: mouseX, y: mouseY } = mousePositionRef.current

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const dx = mouseX - p.x
        const dy = mouseY - p.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Scale scatter distance based on canvas size
        const scaledScatterDistance = scatterDistance * Math.min(canvas.width, canvas.height) / 400

        if (distance < scaledScatterDistance && (isTouchingRef.current || !("ontouchstart" in window))) {
          const force = (scaledScatterDistance - distance) / scaledScatterDistance
          const angle = Math.atan2(dy, dx)
          const moveX = Math.cos(angle) * force * 60
          const moveY = Math.sin(angle) * force * 60
          p.x = p.baseX - moveX
          p.y = p.baseY - moveY

          ctx.fillStyle = p.scatteredColor
        } else {
          p.x += (p.baseX - p.x) * 0.1
          p.y += (p.baseY - p.y) * 0.1
          ctx.fillStyle = "white"
        }

        ctx.fillRect(p.x, p.y, p.size, p.size)

        p.life--
        if (p.life <= 0) {
          const newParticle = createParticle()
          if (newParticle) {
            particles[i] = newParticle
          } else {
            particles.splice(i, 1)
            i--
          }
        }
      }

      // Maintain particle count
      const targetCount = particles.length
      while (particles.length < targetCount) {
        const newParticle = createParticle()
        if (newParticle) particles.push(newParticle)
        else break
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    createTextImage()
    createInitialParticles()
    animate()

    const handleMove = (x: number, y: number) => {
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        mousePositionRef.current = {
          x: x - rect.left,
          y: y - rect.top,
        }
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault()
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }

    const handleTouchStart = () => {
      isTouchingRef.current = true
    }

    const handleTouchEnd = () => {
      isTouchingRef.current = false
      mousePositionRef.current = { x: 0, y: 0 }
    }

    const handleMouseLeave = () => {
      if (!("ontouchstart" in window)) {
        mousePositionRef.current = { x: 0, y: 0 }
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvas.addEventListener("mouseleave", handleMouseLeave)
    canvas.addEventListener("touchstart", handleTouchStart)
    canvas.addEventListener("touchend", handleTouchEnd)

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("mouseleave", handleMouseLeave)
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("touchend", handleTouchEnd)
      cancelAnimationFrame(animationFrameId)
    }
  }, [logoImage, canvasSize, particleCount, scatterDistance, scatterColor])

  return (
    <div ref={containerRef} className={`relative bg-black ${className}`} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        aria-label="Interactive particle effect with custom logo"
      />
    </div>
  )
}
