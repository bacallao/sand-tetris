"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { SandTetrisGrid, CellValue, GRID_CONFIG, CELL_COLORS } from '@/lib/sand-tetris'

interface SandTetrisProps {
  cellSize?: number
  viewportWidth?: number
  viewportHeight?: number
  className?: string
}

const CELL_NAMES: Record<CellValue, string> = {
  0: 'Empty',
  1: 'Sand',
  2: 'Water',
  3: 'Earth',
  4: 'Fire',
  5: 'Plant',
  6: 'White',
}

export default function SandTetris({
  cellSize = 4,
  viewportWidth = 800,
  viewportHeight = 600,
  className = ""
}: SandTetrisProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<SandTetrisGrid>(new SandTetrisGrid())
  const animationFrameRef = useRef<number>(0)
  const lastPhysicsUpdateRef = useRef<number>(0)
  
  const [selectedCellType, setSelectedCellType] = useState<CellValue>(1)
  const [isDrawing, setIsDrawing] = useState(false)
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 })
  const [isSimulationRunning, setIsSimulationRunning] = useState(true)
  const [simulationSpeed, setSimulationSpeed] = useState(16) // milliseconds between physics updates (faster)
  const [gridStats, setGridStats] = useState<Record<CellValue, number>>({
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
  })

  // Calculate how many cells fit in the viewport
  const viewportCells = {
    width: Math.floor(viewportWidth / cellSize),
    height: Math.floor(viewportHeight / cellSize)
  }

  // Render the grid
  const renderGrid = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#222222'
    ctx.fillRect(0, 0, viewportWidth, viewportHeight)

    // Calculate visible grid bounds
    const startX = Math.max(0, Math.floor(viewOffset.x / cellSize))
    const startY = Math.max(0, Math.floor(viewOffset.y / cellSize))
    const endX = Math.min(GRID_CONFIG.WIDTH, startX + viewportCells.width + 1)
    const endY = Math.min(GRID_CONFIG.HEIGHT, startY + viewportCells.height + 1)

    // Draw cells (convert from grid coordinates to screen coordinates)
    // Grid: (0,0) = bottom-left, Screen: (0,0) = top-left
    for (let gridY = startY; gridY < endY; gridY++) {
      for (let gridX = startX; gridX < endX; gridX++) {
        const cellValue = gridRef.current.getCell(gridX, gridY)
        if (cellValue === 0) continue // Skip empty cells for performance

        const pixelX = gridX * cellSize - viewOffset.x
        // Flip Y coordinate: screen Y = viewport height - (grid Y * cell size) - cell size
        const pixelY = viewportHeight - ((gridY + 1) * cellSize) + viewOffset.y

        // Only draw if the cell is visible
        if (pixelX + cellSize >= 0 && pixelY + cellSize >= 0 && 
            pixelX < viewportWidth && pixelY < viewportHeight) {
          ctx.fillStyle = CELL_COLORS[cellValue]
          ctx.fillRect(pixelX, pixelY, cellSize, cellSize)
        }
      }
    }

    // Draw grid lines (optional, for small cell sizes)
    if (cellSize >= 8) {
      ctx.strokeStyle = '#333333'
      ctx.lineWidth = 1

      // Vertical lines
      for (let x = startX; x <= endX; x++) {
        const pixelX = x * cellSize - viewOffset.x
        if (pixelX >= 0 && pixelX <= viewportWidth) {
          ctx.beginPath()
          ctx.moveTo(pixelX, 0)
          ctx.lineTo(pixelX, viewportHeight)
          ctx.stroke()
        }
      }

      // Horizontal lines
      for (let y = startY; y <= endY; y++) {
        const pixelY = y * cellSize - viewOffset.y
        if (pixelY >= 0 && pixelY <= viewportHeight) {
          ctx.beginPath()
          ctx.moveTo(0, pixelY)
          ctx.lineTo(viewportWidth, pixelY)
          ctx.stroke()
        }
      }
    }
  }, [cellSize, viewOffset, viewportWidth, viewportHeight, viewportCells])

  // Update grid statistics
  const updateStats = useCallback(() => {
    const stats: Record<CellValue, number> = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
    }
    
    for (let value = 0; value <= GRID_CONFIG.MAX_CELL_VALUE; value++) {
      stats[value as CellValue] = gridRef.current.countCells(value as CellValue)
    }
    
    setGridStats(stats)
  }, [])

  // Animation loop with physics simulation
  const animate = useCallback((currentTime: number) => {
    // Update physics at the specified interval
    if (isSimulationRunning && currentTime - lastPhysicsUpdateRef.current >= simulationSpeed) {
      gridRef.current.nextState()
      lastPhysicsUpdateRef.current = currentTime
    }
    
    renderGrid()
    updateStats()
    animationFrameRef.current = requestAnimationFrame((time) => animate(time))
  }, [renderGrid, updateStats, isSimulationRunning, simulationSpeed])

  // Convert mouse position to grid coordinates
  const getGridPosition = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top

    const gridX = Math.floor((mouseX + viewOffset.x) / cellSize)
    // Convert screen Y to grid Y (flip coordinate system)
    const screenY = mouseY - viewOffset.y
    const gridY = Math.floor((viewportHeight - screenY) / cellSize) - 1

    return { x: gridX, y: gridY }
  }, [cellSize, viewOffset, viewportHeight])

  // Draw cells at mouse position
  const drawCell = useCallback((clientX: number, clientY: number) => {
    const pos = getGridPosition(clientX, clientY)
    if (!pos) return

    // Draw a 3x3 brush for better user experience
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        gridRef.current.setCell(pos.x + dx, pos.y + dy, selectedCellType)
      }
    }
  }, [getGridPosition, selectedCellType])

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsDrawing(true)
      drawCell(e.clientX, e.clientY)
    } else if (e.button === 2) { // Right click
      setIsPanning(true)
      setLastPanPosition({ x: e.clientX, y: e.clientY })
    }
  }, [drawCell])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDrawing) {
      drawCell(e.clientX, e.clientY)
    } else if (isPanning) {
      const deltaX = e.clientX - lastPanPosition.x
      const deltaY = e.clientY - lastPanPosition.y
      
      setViewOffset(prev => ({
        x: Math.max(0, Math.min(prev.x - deltaX, GRID_CONFIG.WIDTH * cellSize - viewportWidth)),
        y: Math.max(0, Math.min(prev.y - deltaY, GRID_CONFIG.HEIGHT * cellSize - viewportHeight))
      }))
      
      setLastPanPosition({ x: e.clientX, y: e.clientY })
    }
  }, [isDrawing, isPanning, drawCell, lastPanPosition, cellSize, viewportWidth, viewportHeight])

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false)
    setIsPanning(false)
  }, [])

  // Keyboard controls
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const panSpeed = 50
    
    switch (e.key) {
      case 'ArrowUp':
        setViewOffset(prev => ({ ...prev, y: Math.max(0, prev.y - panSpeed) }))
        break
      case 'ArrowDown':
        setViewOffset(prev => ({ ...prev, y: Math.min(GRID_CONFIG.HEIGHT * cellSize - viewportHeight, prev.y + panSpeed) }))
        break
      case 'ArrowLeft':
        setViewOffset(prev => ({ ...prev, x: Math.max(0, prev.x - panSpeed) }))
        break
      case 'ArrowRight':
        setViewOffset(prev => ({ ...prev, x: Math.min(GRID_CONFIG.WIDTH * cellSize - viewportWidth, prev.x + panSpeed) }))
        break
      case '1': case '2': case '3': case '4': case '5':
        setSelectedCellType(parseInt(e.key) as CellValue)
        break
      case '0':
        setSelectedCellType(0)
        break
      case 'c':
        gridRef.current.clear()
        break
      case ' ': // Spacebar
        e.preventDefault()
        setIsSimulationRunning(prev => !prev)
        break
    }
  }, [cellSize, viewportWidth, viewportHeight])

  // Initialize canvas and start animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = viewportWidth
    canvas.height = viewportHeight

    // Add some initial sand for demonstration (remember: y=0 is bottom)
    gridRef.current.fillRect(40, 50, 20, 10, 1) // Sand pile
    gridRef.current.fillRect(30, 30, 10, 15, 2) // Water
    gridRef.current.fillRect(60, 20, 15, 20, 3) // Earth wall
    
    // Add some falling sand from higher up
    gridRef.current.fillRect(45, 100, 10, 5, 1) // Falling sand
    gridRef.current.fillRect(25, 80, 5, 8, 2) // Falling water

    animate(0)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [animate, viewportWidth, viewportHeight])

  // Add keyboard event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent context menu on right click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  return (
    <div className={`sand-tetris-container ${className}`}>
      {/* Controls */}
      <div className="mb-4 p-4 bg-gray-800 rounded-lg">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <h3 className="text-white font-semibold">Sand Tetris</h3>
          <div className="flex items-center gap-2">
            <span className="text-gray-300">Selected:</span>
            <div 
              className="w-6 h-6 border-2 border-white rounded"
              style={{ backgroundColor: CELL_COLORS[selectedCellType] }}
            />
            <span className="text-white">{CELL_NAMES[selectedCellType]}</span>
          </div>
          
          {/* Simulation Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSimulationRunning(!isSimulationRunning)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                isSimulationRunning 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isSimulationRunning ? 'Pause' : 'Play'}
            </button>
            <div className="flex items-center gap-1">
              <span className="text-gray-300 text-sm">Speed:</span>
              <select
                value={simulationSpeed}
                onChange={(e) => setSimulationSpeed(parseInt(e.target.value))}
                className="bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600"
              >
                <option value={16}>Fast (60 FPS)</option>
                <option value={33}>Normal (30 FPS)</option>
                <option value={60}>Slow (16 FPS)</option>
                <option value={100}>Very Slow (10 FPS)</option>
                <option value={200}>Ultra Slow (5 FPS)</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Cell type selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(CELL_COLORS).map(([value, color]) => {
            const cellValue = parseInt(value) as CellValue
            return (
              <button
                key={value}
                onClick={() => setSelectedCellType(cellValue)}
                className={`px-3 py-2 rounded border-2 transition-colors ${
                  selectedCellType === cellValue 
                    ? 'border-white bg-gray-600' 
                    : 'border-gray-600 bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-white text-sm">{CELL_NAMES[cellValue]} ({value})</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm">
          {Object.entries(gridStats).map(([value, count]) => {
            const cellValue = parseInt(value) as CellValue
            return (
              <div key={value} className="text-center">
                <div 
                  className="w-4 h-4 mx-auto mb-1 rounded"
                  style={{ backgroundColor: CELL_COLORS[cellValue] }}
                />
                <div className="text-gray-300">{count}</div>
              </div>
            )
          })}
        </div>

        {/* Instructions */}
        <div className="mt-4 text-sm text-gray-400">
          <p><strong>Controls:</strong></p>
          <p>• Left click + drag: Draw selected cell type</p>
          <p>• Right click + drag: Pan view</p>
          <p>• Arrow keys: Pan view</p>
          <p>• Keys 0-5: Select cell type</p>
          <p>• Key C: Clear grid</p>
          <p>• Spacebar: Pause/Resume simulation</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="border-2 border-gray-600 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
          className="cursor-crosshair"
          style={{ width: viewportWidth, height: viewportHeight }}
        />
      </div>

      {/* Grid info */}
      <div className="mt-2 text-sm text-gray-400">
        Grid: {GRID_CONFIG.WIDTH} × {GRID_CONFIG.HEIGHT} cells | 
        Viewport: {Math.floor(viewOffset.x / cellSize)}, {Math.floor(viewOffset.y / cellSize)} | 
        Cell size: {cellSize}px
      </div>
    </div>
  )
}
