"use client"

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { SandTetrisGrid, CellValue, GRID_CONFIG, CELL_COLORS, TetrominoType, TETROMINO_SHAPES } from '@/lib/sand-tetris'

interface SandTetrisDebugProps {
  width?: number
  height?: number
  cellSize?: number
  className?: string
}

// Colors are now imported from sand-tetris.ts

export default function SandTetrisDebug({
  width = 50,
  height = 90,
  cellSize = 12,
  className = ""
}: SandTetrisDebugProps) {
  const [grid, setGrid] = useState(() => new SandTetrisGrid(width, height))
  const [stepCount, setStepCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRectangleMode, setIsRectangleMode] = useState(false)
  const [rectWidth, setRectWidth] = useState(3)
  const [rectHeight, setRectHeight] = useState(3)
  const [isGameOver, setIsGameOver] = useState(false)
  const rafIdRef = useRef<number | null>(null)
  const gridRef = useRef(grid)
  const isPlayingRef = useRef(isPlaying)
  const isPlacingRef = useRef(false)
  const lastPlaceRef = useRef<{ x: number; y: number } | null>(null)

  // Cleanup any running animation on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [])

  // Keep ref in sync with latest grid
  useEffect(() => {
    gridRef.current = grid
  }, [grid])

  // No need for separate spawner initialization

  // Keep ref in sync with playing state
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGameOver) return;

      if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scrolling
        
        // Perform instant drop
        const dropOccurred = gridRef.current.instantDrop();
        
        if (dropOccurred) {
          // Update the UI to show the dropped piece
          setGrid(gridRef.current.clone());
          setStepCount(prev => prev + 1);
          
          // Check for game over after dropping
          if (gridRef.current.getIsGameOver()) {
            setIsGameOver(true);
            if (isPlayingRef.current) {
              setIsPlaying(false);
              isPlayingRef.current = false;
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
            }
          }
        }
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const moved = gridRef.current.shiftActiveTetromino(e.code === 'ArrowLeft' ? 'left' : 'right')
        if (moved) {
          setGrid(gridRef.current.clone())
          setStepCount(prev => prev + 1)
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGameOver])

  // End placing on global pointer up
  useEffect(() => {
    const stopPlacing = () => {
      isPlacingRef.current = false
      lastPlaceRef.current = null
    }
    window.addEventListener('pointerup', stopPlacing)
    window.addEventListener('pointercancel', stopPlacing)
    window.addEventListener('blur', stopPlacing)
    return () => {
      window.removeEventListener('pointerup', stopPlacing)
      window.removeEventListener('pointercancel', stopPlacing)
      window.removeEventListener('blur', stopPlacing)
    }
  }, [])

  const placeSandAt = useCallback((x: number, y: number) => {
    gridRef.current.setCell(x, y, 1)
    setGrid(gridRef.current.clone())
  }, [])

  const placeRectangleAt = useCallback((startX: number, startY: number) => {
    // Calculate safe rectangle dimensions that fit within grid boundaries
    const safeWidth = Math.min(rectWidth, width - startX)
    const safeHeight = Math.min(rectHeight, height - startY)
    
    // Only place if there's at least 1x1 space available
    if (safeWidth > 0 && safeHeight > 0) {
      gridRef.current.fillRect(startX, startY, safeWidth, safeHeight, 1)
      setGrid(gridRef.current.clone())
    }
  }, [rectWidth, rectHeight, width, height])

  const spawnTetromino = useCallback((type: TetrominoType) => {
    const success = gridRef.current.startTetrominoSpawn(type)
    if (success) {
      setGrid(gridRef.current.clone())
    }
  }, [])

  // Handle cell click to place sand or rectangle
  const handleCellClick = useCallback((x: number, y: number) => {
    if (isGameOver) return // Don't allow placement if game is over
    
    if (isRectangleMode) {
      placeRectangleAt(x, y)
    } else {
      placeSandAt(x, y)
    }
  }, [isGameOver, isRectangleMode, placeSandAt, placeRectangleAt])

  // Advance to next state
  const handleNextStep = useCallback(() => {
    if (isGameOver) return // Don't step if game is over
    
    gridRef.current.step()
    
    // Check for game over after stepping
    if (gridRef.current.getIsGameOver()) {
      setIsGameOver(true)
    }
    
    setGrid(gridRef.current.clone())
    setStepCount(prev => prev + 1)
  }, [isGameOver])

  const stopPlaying = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    setIsPlaying(false)
    // Force update the grid to show current state when stopped
    setGrid(gridRef.current.clone())
  }, [])

  // Play loop using requestAnimationFrame
  const handlePlay = useCallback(() => {
    if (isPlaying) {
      stopPlaying()
      return
    }
    setIsPlaying(true)

    const tick = () => {
      // Double-check if we should still be playing
      if (!isPlayingRef.current) {
        rafIdRef.current = null
        return
      }
      
      // If user is holding, place sand at last position continuously
      if (isPlacingRef.current && lastPlaceRef.current) {
        const { x, y } = lastPlaceRef.current
        if (!isRectangleMode) {
          gridRef.current.setCell(x, y, 1)
        }
      }
      
      // Tetromino spawning is now handled within the step() method
      
      // Always step the simulation - it handles both physics and elimination
      gridRef.current.step()
      
      // Check for game over after stepping
      if (gridRef.current.getIsGameOver()) {
        setIsGameOver(true)
        setIsPlaying(false)
        isPlayingRef.current = false
        rafIdRef.current = null
        // Update UI one final time to show game over state
        setGrid(gridRef.current.clone())
        setStepCount(prev => prev + 1)
        return
      }
      
      // Always update the UI to show current state
      setGrid(gridRef.current.clone())
      setStepCount(prev => prev + 1)
      
      // Continue animation loop only if still playing
      if (isPlayingRef.current) {
        rafIdRef.current = requestAnimationFrame(tick)
      } else {
        rafIdRef.current = null
      }
    }

    rafIdRef.current = requestAnimationFrame(tick)
  }, [isPlaying, stopPlaying, isRectangleMode])

  // Clear the grid
  const handleClear = useCallback(() => {
    // Stop playback if running
    if (isPlaying) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setIsPlaying(false)
    }
    const newGrid = new SandTetrisGrid(width, height)
    gridRef.current = newGrid
    setGrid(newGrid)
    setStepCount(0)
    setIsGameOver(false) // Reset game over state
  }, [width, height, isPlaying])

  // Restart the game (same as clear but more explicit)
  const handleRestart = useCallback(() => {
    handleClear()
  }, [handleClear])

  // Count cells with value 1 (sand)
  const sandCount = grid.countCells(1)
  
  // Get connected components info
  const connectedComponents = grid.getConnectedComponents()
  const eliminatingComponents = grid.getComponentsScheduledForElimination()
  const isTimeStopped = grid.isTimeStopped()
  const eliminationStatus = grid.getEliminationStatus()

  return (
    <div className={`sand-tetris-debug ${className}`}>
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePlay}
              disabled={isGameOver}
              className={`px-4 py-2 ${isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>
            <button
              onClick={handleNextStep}
              disabled={isPlaying || isGameOver}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next Step
            </button>
            <button
              onClick={handleClear}
              disabled={isPlaying}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium transition-colors disabled:opacity-50"
            >
              Clear
            </button>
            {isGameOver && (
              <button
                onClick={handleRestart}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-medium transition-colors"
              >
                🔄 Restart
              </button>
            )}
            <button
              onClick={() => setIsRectangleMode(!isRectangleMode)}
              disabled={isGameOver}
              className={`px-4 py-2 ${isRectangleMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'} text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isRectangleMode ? '📦 Rectangle' : '⚫ Single'}
            </button>
          </div>
        </div>

        {/* Game Over Banner */}
        {isGameOver && (
          <div className="mb-4 p-4 bg-red-900 border-2 border-red-600 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-red-200 text-xl font-bold">🎮 GAME OVER!</h2>
                <p className="text-red-300 text-sm mt-1">Sand reached the top row after {stepCount} steps</p>
              </div>
              <button
                onClick={handleRestart}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* Rectangle Controls */}
        {isRectangleMode && !isGameOver && (
          <div className="mb-4 p-3 bg-gray-900 rounded">
            <p className="text-purple-400 font-medium mb-2">Rectangle Mode Settings</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="rect-width" className="text-gray-300 text-sm">Width:</label>
                <input
                  id="rect-width"
                  type="number"
                  min="1"
                  max={width}
                  value={rectWidth}
                  onChange={(e) => setRectWidth(Math.max(1, Math.min(width, parseInt(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="rect-height" className="text-gray-300 text-sm">Height:</label>
                <input
                  id="rect-height"
                  type="number"
                  min="1"
                  max={height}
                  value={rectHeight}
                  onChange={(e) => setRectHeight(Math.max(1, Math.min(height, parseInt(e.target.value) || 1)))}
                  className="w-16 px-2 py-1 bg-gray-700 text-white rounded text-sm"
                />
              </div>
              <span className="text-gray-400 text-xs">
                Current: {rectWidth} × {rectHeight}
              </span>
            </div>
          </div>
        )}

        {/* Tetromino Spawn Buttons */}
        <div className="mb-4 p-3 bg-gray-900 rounded">
          <p className="text-cyan-400 font-medium mb-3">Spawn Tetrominoes</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TETROMINO_SHAPES) as TetrominoType[]).map((type) => (
              <button
                key={type}
                onClick={() => spawnTetromino(type)}
                disabled={isGameOver || (isPlaying && grid.isSpawningTetromino())}
                className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors text-sm"
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 text-sm text-gray-400">
          <p><strong>Instructions:</strong></p>
          <p>• Click cells to place sand, or use Rectangle mode for bulk placement</p>
          <p>• Use Tetromino buttons to spawn classic Tetris pieces (each cell = 5×5 sand blocks)</p>
          <p>• <strong className="text-yellow-400">Press SPACE</strong> to instantly drop falling/spawning tetrominoes to the lowest possible position</p>
          <p>• Use <strong className="text-blue-400">LEFT/RIGHT ARROWS</strong> to shift the active tetromino horizontally</p>
          <p>• Tetrominoes spawn row-by-row from top at random X positions within boundaries</p>
          <p>• Components touching both walls will blink and be eliminated after 20 ticks</p>
          <p>• Time stops during elimination (physics paused, only blinking continues)</p>
          <p>• <strong className="text-red-400">GAME OVER:</strong> When sand reaches the top row (y = {height-1})</p>
        </div>

        {/* Grid Display */}
        <div className="inline-block border-2 border-gray-600 rounded">
          <div 
            className="grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${height}, ${cellSize}px)`
            }}
          >
            {/* Render grid from top to bottom for display, but map to correct coordinates */}
            {Array.from({ length: height }, (_, displayRow) => {
              // Convert display row to grid row (flip Y coordinate)
              const gridY = height - 1 - displayRow
              
              return Array.from({ length: width }, (_, gridX) => {
                const cellValue = grid.getCell(gridX, gridY)
                
                return (
                  <div
                    key={`${gridX}-${gridY}`}
                    onClick={() => handleCellClick(gridX, gridY)}
                    onPointerDown={(e) => { 
                      if (isGameOver) return; // Don't allow interaction if game is over
                      e.preventDefault(); 
                      isPlacingRef.current = true; 
                      lastPlaceRef.current = { x: gridX, y: gridY }; 
                      if (isRectangleMode) {
                        placeRectangleAt(gridX, gridY)
                      } else {
                        placeSandAt(gridX, gridY)
                      }
                    }}
                    onPointerEnter={() => { 
                      if (isGameOver || !isPlacingRef.current) return; // Don't allow interaction if game is over
                      lastPlaceRef.current = { x: gridX, y: gridY }; 
                      if (!isRectangleMode) {
                        placeSandAt(gridX, gridY)
                      }
                    }}
                    style={{
                      width: `${cellSize}px`,
                      height: `${cellSize}px`,
                      backgroundColor: CELL_COLORS[cellValue] ?? '#000000',
                      transition: 'none',
                      contain: 'paint',
                      userSelect: 'none',
                      outline: 'none',
                      display: 'block',
                    }}
                    aria-label={`(${gridX}, ${gridY}) = ${cellValue}`}
                  />
                )
              })
            })}
          </div>
        </div>

        {/* Coordinate Reference */}
        <div className="mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>Bottom-left: (0, 0)</span>
            <span>Bottom-right: ({width-1}, 0)</span>
            <span>Top-left: (0, {height-1})</span>
            <span>Top-right: ({width-1}, {height-1})</span>
          </div>
        </div>

        {/* Physics Rules Reminder */}
        <div className="mt-4 text-xs text-gray-400 bg-gray-900 rounded p-3">
          <p><strong>Physics Rules:</strong></p>
          <p>1. Try to move down (x, y-1)</p>
          <p>2. Try to move diagonal down-left (x-1, y-1)</p>
          <p>3. Try to move diagonal down-right (x+1, y-1)</p>
          <p>4. If no movement possible, stay in place</p>
        </div>
      </div>
    </div>
  )
}
