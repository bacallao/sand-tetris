// Sand Tetris - Cellular Automata Game
// Optimized grid system for 100x2000 cells with values 0-6

export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SandGrain {
  color: CellValue;
  speed: number;  // Base speed - how many ticks between movements
  ticks: number;  // Current tick counter - decreases each step
}

export interface GridPosition {
  x: number;
  y: number;
}

export interface GridDimensions {
  width: number;
  height: number;
}

export const GRID_CONFIG = {
  WIDTH: 100,
  HEIGHT: 2000,
  MIN_CELL_VALUE: 0,
  MAX_CELL_VALUE: 6,
  ELIMINATION_TICKS: 20,
  WHITE_COLOR: 6 as CellValue,
  BLINK_INTERVAL: 5,
  // Grain timing configuration
  BASE_GRAIN_SPEED: 1,      // Standard speed for all grains
  SPAWNING_GRAIN_SPEED: 5,  // Slower speed for spawning tetromino blocks
} as const;

// Tetromino shapes - each 1 represents a 5x5 block of sand
export const TETROMINO_SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  L: [[1, 0], [1, 0], [1, 1]],
  J: [[0, 1], [0, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]]
} as const;

export type TetrominoType = keyof typeof TETROMINO_SHAPES;

export const SAND_COLORS: readonly CellValue[] = [1, 2, 3, 4, 5];
export const TETROMINO_BLOCK_SIZE = 5;

export const CELL_COLORS: Record<CellValue, string> = {
  0: '#000000', // Empty
  1: '#FFD700', // Gold
  2: '#4169E1', // Royal Blue
  3: '#8B4513', // Saddle Brown
  4: '#DC143C', // Crimson
  5: '#32CD32', // Lime Green
  6: '#FFFFFF', // White (blinking)
} as const;

export interface ConnectedComponent {
  id: number;
  cells: Set<string>;
  originalColor: CellValue;
  touchesLeftWall: boolean;
  touchesRightWall: boolean;
  eliminationCountdown: number;
}

export interface TetrominoSpawnState {
  type: TetrominoType;
  startX: number;
  currentRow: number;
  totalRows: number;
  isActive: boolean;
  shape: readonly (readonly number[])[];
  color: CellValue;
}

// Direction vectors for neighbor checking (8-directional)
const DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],  // orthogonal
  [-1, -1], [1, -1], [-1, 1], [1, 1]  // diagonal
] as const;

/**
 * Optimized Disjoint Set Union with path compression and union by rank
 */
class DisjointSetUnion {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  find(pos: string): string {
    let p = this.parent.get(pos);
    if (!p) {
      this.parent.set(pos, pos);
      this.rank.set(pos, 0);
      return pos;
    }
    
    // Path compression
    if (p !== pos) {
      p = this.find(p);
      this.parent.set(pos, p);
    }
    return p;
  }

  union(pos1: string, pos2: string): void {
    const root1 = this.find(pos1);
    const root2 = this.find(pos2);
    
    if (root1 === root2) return;
    
    const rank1 = this.rank.get(root1) || 0;
    const rank2 = this.rank.get(root2) || 0;
    
    // Union by rank
    if (rank1 < rank2) {
      this.parent.set(root1, root2);
    } else if (rank1 > rank2) {
      this.parent.set(root2, root1);
    } else {
      this.parent.set(root2, root1);
      this.rank.set(root1, rank1 + 1);
    }
  }

  getComponentCells(): Map<string, Set<string>> {
    const components = new Map<string, Set<string>>();
    
    for (const pos of this.parent.keys()) {
      const root = this.find(pos);
      if (!components.has(root)) {
        components.set(root, new Set());
      }
      components.get(root)!.add(pos);
    }
    
    return components;
  }
}

export class SandTetrisGrid {
  private grid: (SandGrain | null)[][];
  public readonly width: number;
  public readonly height: number;
  private connectedComponents = new Map<number, ConnectedComponent>();
  private nextComponentId = 1;
  private hasActiveEliminations = false;
  private isGameOver = false;
  private fallingPieceCells = new Set<string>();
  private canSpawnNewPiece = true;
  
  // Cache for position keys to reduce string operations
  private posKeyCache = new Map<number, string>();
  
  constructor(
    width: number = GRID_CONFIG.WIDTH,
    height: number = GRID_CONFIG.HEIGHT
  ) {
    this.width = width;
    this.height = height;
    this.grid = this.createEmptyGrid();
  }

  private createEmptyGrid(): (SandGrain | null)[][] {
    return Array.from({ length: this.height }, () => 
      new Array(this.width).fill(null) as (SandGrain | null)[]
    );
  }

  /**
   * Creates a new sand grain with specified speed (defaults to base speed)
   */
  private createGrain(color: CellValue, isSpawning: boolean = false): SandGrain {
    const speed = isSpawning ? GRID_CONFIG.SPAWNING_GRAIN_SPEED : GRID_CONFIG.BASE_GRAIN_SPEED;
    return {
      color,
      speed,
      ticks: speed // Start with full tick count
    };
  }

  getCell(x: number, y: number): CellValue {
    if (!this.isValidPosition(x, y)) return 0;
    const grain = this.grid[y][x];
    return grain ? grain.color : 0;
  }

  setCell(x: number, y: number, value: CellValue): boolean {
    if (!this.isValidPosition(x, y) || !this.isValidCellValue(value)) {
      return false;
    }
    this.grid[y][x] = value === 0 ? null : this.createGrain(value);
    return true;
  }

  /**
   * Gets the grain object at the specified position
   */
  getGrain(x: number, y: number): SandGrain | null {
    return this.isValidPosition(x, y) ? this.grid[y][x] : null;
  }

  /**
   * Sets a grain object at the specified position
   */
  setGrain(x: number, y: number, grain: SandGrain | null): boolean {
    if (!this.isValidPosition(x, y)) {
      return false;
    }
    this.grid[y][x] = grain;
    return true;
  }

  isValidPosition(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  private isValidCellValue(value: number): value is CellValue {
    return Number.isInteger(value) && 
           value >= GRID_CONFIG.MIN_CELL_VALUE && 
           value <= GRID_CONFIG.MAX_CELL_VALUE;
  }

  clear(): void {
    this.grid = this.createEmptyGrid();
    this.connectedComponents.clear();
    this.nextComponentId = 1;
    this.hasActiveEliminations = false;
    this.isGameOver = false;
    this.fallingPieceCells.clear();
    this.canSpawnNewPiece = true;
    this.posKeyCache.clear();
  }

  // Optimized position key generation with caching
  private positionToKey(x: number, y: number): string {
    const hash = y * this.width + x;
    let key = this.posKeyCache.get(hash);
    if (!key) {
      key = `${x},${y}`;
      // Limit cache size to prevent memory issues
      if (this.posKeyCache.size < 10000) {
        this.posKeyCache.set(hash, key);
      }
    }
    return key;
  }

  private keyToPosition(key: string): GridPosition {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }

  private getOriginalColor(x: number, y: number, currentValue: CellValue): CellValue {
    if (currentValue === 0) return 0;
    
    const cellKey = this.positionToKey(x, y);
    for (const component of this.connectedComponents.values()) {
      if (component.cells.has(cellKey)) {
        return component.originalColor;
      }
    }
    
    return currentValue === GRID_CONFIG.WHITE_COLOR ? 1 : currentValue;
  }

  private findConnectedComponents(): Map<number, ConnectedComponent> {
    const dsu = new DisjointSetUnion();
    const colorMap = new Map<string, CellValue>();
    
    // First pass: union adjacent cells of same color
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const grain = this.grid[y][x];
        if (!grain) continue;
        
        const currentKey = this.positionToKey(x, y);
        const currentColor = this.getOriginalColor(x, y, grain.color);
        colorMap.set(currentKey, currentColor);
        
        // Check only right and up neighbors to avoid redundancy
        for (const [dx, dy] of DIRECTIONS.slice(0, 4)) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (this.isValidPosition(nx, ny)) {
            const neighborGrain = this.grid[ny][nx];
            if (neighborGrain) {
              const neighborColor = this.getOriginalColor(nx, ny, neighborGrain.color);
              if (neighborColor === currentColor) {
                dsu.union(currentKey, this.positionToKey(nx, ny));
              }
            }
          }
        }
        
        // Check diagonal neighbors
        for (const [dx, dy] of DIRECTIONS.slice(4)) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (this.isValidPosition(nx, ny)) {
            const neighborGrain = this.grid[ny][nx];
            if (neighborGrain) {
              const neighborColor = this.getOriginalColor(nx, ny, neighborGrain.color);
              if (neighborColor === currentColor) {
                dsu.union(currentKey, this.positionToKey(nx, ny));
              }
            }
          }
        }
      }
    }

    // Second pass: build components
    const components = new Map<number, ConnectedComponent>();
    const rootComponents = dsu.getComponentCells();
    let componentId = 1;
    
    for (const [_, cells] of rootComponents) {
      const component: ConnectedComponent = {
        id: componentId++,
        cells,
        originalColor: 1,
        touchesLeftWall: false,
        touchesRightWall: false,
        eliminationCountdown: -1
      };
      
      // Analyze component properties
      for (const cellKey of cells) {
        const { x, y } = this.keyToPosition(cellKey);
        component.originalColor = colorMap.get(cellKey) || 1;
        
        if (x === 0) component.touchesLeftWall = true;
        if (x === this.width - 1) component.touchesRightWall = true;
      }
      
      components.set(component.id, component);
    }
    
    return components;
  }

  private processEliminationCountdowns(): { eliminated: boolean; blinking: boolean } {
    const toDelete: number[] = [];
    let eliminated = false;
    let blinking = false;
    
    for (const [id, component] of this.connectedComponents) {
      if (component.eliminationCountdown < 0) continue;
      
      blinking = true;
      
      // Calculate blink state
      const ticksPassed = GRID_CONFIG.ELIMINATION_TICKS - component.eliminationCountdown;
      const shouldBlink = Math.floor(ticksPassed / GRID_CONFIG.BLINK_INTERVAL) % 2 === 1;
      const displayColor = shouldBlink ? GRID_CONFIG.WHITE_COLOR : component.originalColor;
      
      // Update cell colors
      for (const cellKey of component.cells) {
        const { x, y } = this.keyToPosition(cellKey);
        if (this.isValidPosition(x, y) && this.grid[y][x]) {
          this.grid[y][x]!.color = displayColor;
        }
      }
      
      component.eliminationCountdown--;
      
      if (component.eliminationCountdown < 0) {
        // Eliminate component
        for (const cellKey of component.cells) {
          const { x, y } = this.keyToPosition(cellKey);
          if (this.isValidPosition(x, y)) {
            this.grid[y][x] = null;
          }
        }
        toDelete.push(id);
        eliminated = true;
      }
    }
    
    // Remove eliminated components
    for (const id of toDelete) {
      this.connectedComponents.delete(id);
    }
    
    this.hasActiveEliminations = blinking;
    return { eliminated, blinking };
  }

  private updateConnectedComponents(): { eliminated: boolean; blinking: boolean } {
    const result = this.processEliminationCountdowns();
    
    if (result.blinking && !result.eliminated) {
      return result;
    }
    
    // Rebuild components
    const newComponents = this.findConnectedComponents();
    
    // Check for new wall-touching components
    for (const component of newComponents.values()) {
      if (component.touchesLeftWall && component.touchesRightWall) {
        component.eliminationCountdown = GRID_CONFIG.ELIMINATION_TICKS - 1;
        this.hasActiveEliminations = true;
      }
    }
    
    this.connectedComponents = newComponents;
    return { eliminated: result.eliminated, blinking: this.hasActiveEliminations };
  }

  getConnectedComponents(): ReadonlyMap<number, ConnectedComponent> {
    return this.connectedComponents;
  }

  isTimeStopped(): boolean {
    return this.hasActiveEliminations;
  }

  getIsGameOver(): boolean {
    return this.isGameOver;
  }

  resetGameOver(): void {
    this.isGameOver = false;
  }

  fillRect(startX: number, startY: number, width: number, height: number, value: CellValue): void {
    if (!this.isValidCellValue(value)) return;
    
    const endX = Math.min(startX + width, this.width);
    const endY = Math.min(startY + height, this.height);
    const sx = Math.max(0, startX);
    const sy = Math.max(0, startY);
    
    for (let y = sy; y < endY; y++) {
      for (let x = sx; x < endX; x++) {
        this.grid[y][x] = value === 0 ? null : this.createGrain(value);
      }
    }
  }

  startTetrominoSpawn(type: TetrominoType): boolean {
    if (!this.canSpawnNewPiece) {
      return false;
    }

    const shape = TETROMINO_SHAPES[type];
    const color = SAND_COLORS[Math.floor(Math.random() * SAND_COLORS.length)];
    const tetrominoWidth = shape[0].length * TETROMINO_BLOCK_SIZE;
    const tetrominoHeight = shape.length * TETROMINO_BLOCK_SIZE;
    
    const maxStartX = this.width - tetrominoWidth;
    if (maxStartX < 0) {
      return false;
    }
    
    const startX = Math.floor(Math.random() * (maxStartX + 1));
    
    // Spawn the entire tetromino shape immediately above the grid
    const baseSpawnY = this.height; // Start above the grid
    
    this.fallingPieceCells.clear();
    
    // Place the complete tetromino shape
    for (let shapeRow = 0; shapeRow < shape.length; shapeRow++) {
      for (let shapeCol = 0; shapeCol < shape[shapeRow].length; shapeCol++) {
        if (shape[shapeRow][shapeCol] === 1) {
          const baseX = startX + (shapeCol * TETROMINO_BLOCK_SIZE);
          const baseY = baseSpawnY - tetrominoHeight + (shapeRow * TETROMINO_BLOCK_SIZE);
          
          // Fill 5x5 block for this shape cell
          for (let blockY = 0; blockY < TETROMINO_BLOCK_SIZE; blockY++) {
            for (let blockX = 0; blockX < TETROMINO_BLOCK_SIZE; blockX++) {
              const x = baseX + blockX;
              const y = baseY + blockY;
              
              // Only place blocks that are within the grid
              if (this.isValidPosition(x, y)) {
                this.grid[y][x] = this.createGrain(color, true); // true = isSpawning
                this.fallingPieceCells.add(this.positionToKey(x, y));
              }
            }
          }
        }
      }
    }
    
    this.canSpawnNewPiece = false;
    return true;
  }

  isSpawningTetromino(): boolean {
    return this.fallingPieceCells.size > 0 && !this.canSpawnNewPiece;
  }

  getTetrominoSpawnProgress(): number {
    // Since we spawn instantly now, always return 1 (complete)
    return 1;
  }

  private checkCollisionWithPlacedPieces(x: number, y: number, direction: 'left' | 'right' | 'bottom'): boolean {
    const [checkX, checkY] = direction === 'left' ? [x - 1, y] :
                             direction === 'right' ? [x + 1, y] :
                             [x, y - 1];
    
    if (direction === 'bottom' && checkY < 0) {
      return true; // Hit floor
    }
    
    if (this.isValidPosition(checkX, checkY)) {
      const grain = this.grid[checkY][checkX];
      if (grain && grain.color >= 1 && grain.color <= 6) {
        return !this.fallingPieceCells.has(this.positionToKey(checkX, checkY));
      }
    }
    
    return false;
  }

  private checkFallingPieceCollisions(): boolean {
    for (const cellKey of this.fallingPieceCells) {
      const { x, y } = this.keyToPosition(cellKey);
      
      if (this.checkCollisionWithPlacedPieces(x, y, 'left') ||
          this.checkCollisionWithPlacedPieces(x, y, 'right') ||
          this.checkCollisionWithPlacedPieces(x, y, 'bottom')) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Transitions all spawning speed grains to base speed
   * Called when falling pieces settle or tetromino spawning ends
   */
  private transitionSpawningGrainsToBaseSpeed(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const grain = this.grid[y][x];
        if (grain && grain.speed === GRID_CONFIG.SPAWNING_GRAIN_SPEED) {
          grain.speed = GRID_CONFIG.BASE_GRAIN_SPEED;
          // Reset ticks to new speed if grain was waiting
          if (grain.ticks > GRID_CONFIG.BASE_GRAIN_SPEED) {
            grain.ticks = GRID_CONFIG.BASE_GRAIN_SPEED;
          }
        }
      }
    }
  }


  /**
   * Simulates physics for sand particles falling down with timing system
   * Each grain has its own speed and tick counter
   * Returns information about the physics simulation results
   */
  private simulatePhysics(): { anyMovement: boolean; newGrid: (SandGrain | null)[][]; newFallingPieceCells: Set<string>; stuckBlocksAtTop: Set<string> } {
    const nextGrid = this.createEmptyGrid();
    const newFallingPieceCells = new Set<string>();
    const stuckBlocksAtTop = new Set<string>();
    let anyMovement = false;

    // Process cells bottom-up for proper physics
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const grain = this.grid[y][x];
        if (!grain) continue;

        const cellKey = this.positionToKey(x, y);
        const isFalling = this.fallingPieceCells.has(cellKey);
        
        // Check if spawning grain should transition to base speed
        let shouldTransitionSpeed = false;
        if (grain.speed === GRID_CONFIG.SPAWNING_GRAIN_SPEED && isFalling) {
          // Check if touching non-spawning grains
          const neighbors = [
            [x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1],  // orthogonal
            [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]  // diagonal
          ];
          
          for (const [nx, ny] of neighbors) {
            if (this.isValidPosition(nx, ny)) {
              const neighborGrain = this.grid[ny][nx];
              if (neighborGrain && 
                  neighborGrain.speed === GRID_CONFIG.BASE_GRAIN_SPEED && 
                  !this.fallingPieceCells.has(this.positionToKey(nx, ny))) {
                shouldTransitionSpeed = true;
                break;
              }
            }
          }
        }
        
        // Update grain timing
        grain.ticks--;
        
        let placed = false;
        let newX = x, newY = y;
        let newGrain = shouldTransitionSpeed ? 
          { ...grain, speed: GRID_CONFIG.BASE_GRAIN_SPEED, ticks: GRID_CONFIG.BASE_GRAIN_SPEED } : 
          grain;

        // Only try to move if ticks reached 0
        if (grain.ticks <= 0) {
          // Reset ticks to speed for next movement (use newGrain's speed in case it transitioned)
          newGrain = { ...newGrain, ticks: newGrain.speed };
          
          // Try falling positions
          const positions = [
            [x, y - 1],           // straight down
            [x - 1, y - 1],       // down-left
            [x + 1, y - 1]        // down-right
          ];

          for (const [px, py] of positions) {
            if (py >= 0 && px >= 0 && px < this.width && nextGrid[py][px] === null) {
              nextGrid[py][px] = newGrain;
              newX = px;
              newY = py;
              placed = true;
              anyMovement = true;
              break;
            }
          }
        }

        if (!placed) {
          nextGrid[y][x] = newGrain;
          
          // Check if block is stuck at the top row
          // A block is stuck if: ticks reached 0, tried to move but couldn't, and is at top row
          if (y === this.height - 1 && grain.ticks <= 0) {
            stuckBlocksAtTop.add(this.positionToKey(x, y));
          }
        }

        if (isFalling) {
          newFallingPieceCells.add(this.positionToKey(newX, newY));
        }
      }
    }

    return { anyMovement, newGrid: nextGrid, newFallingPieceCells, stuckBlocksAtTop };
  }

  step(): boolean {
    if (this.isGameOver) {
      return false;
    }

    // Update eliminations
    const { eliminated, blinking } = this.updateConnectedComponents();
    
    if (blinking) {
      return true;
    }

    let anyChange = eliminated;

    // Physics simulation
    const { anyMovement, newGrid, newFallingPieceCells, stuckBlocksAtTop } = this.simulatePhysics();
    
    this.fallingPieceCells = newFallingPieceCells;
    this.grid = newGrid;

    if (anyMovement) anyChange = true;

    // Check collision for falling pieces
    if (!this.canSpawnNewPiece && this.fallingPieceCells.size > 0) {
      if (this.checkFallingPieceCollisions()) {
        // Transition any remaining spawning speed grains to base speed when they settle
        this.transitionSpawningGrainsToBaseSpeed();
        this.canSpawnNewPiece = true;
        this.fallingPieceCells.clear();
      }
    }

    // Check game over - only if blocks are stuck at the top
    // A block is stuck if it has ticks = 0 and couldn't move from the top row
    if (stuckBlocksAtTop.size > 0) {
      this.isGameOver = true;
      return true;
    }

    // Tetromino spawning is now handled instantly in startTetrominoSpawn

    return anyChange;
  }

  nextState(): void {
    this.step();
  }

  countCells(value: CellValue): number {
    let count = 0;
    for (const row of this.grid) {
      for (const grain of row) {
        if (grain && grain.color === value) count++;
      }
    }
    return count;
  }

  clone(): SandTetrisGrid {
    const copy = new SandTetrisGrid(this.width, this.height);
    
    // Deep copy grid
    for (let y = 0; y < this.height; y++) {
      copy.grid[y] = this.grid[y].map(grain => 
        grain ? { ...grain } : null
      );
    }
    
    // Copy state
    copy.nextComponentId = this.nextComponentId;
    copy.hasActiveEliminations = this.hasActiveEliminations;
    copy.isGameOver = this.isGameOver;
    copy.fallingPieceCells = new Set(this.fallingPieceCells);
    copy.canSpawnNewPiece = this.canSpawnNewPiece;
    
    // Deep copy components
    for (const [id, comp] of this.connectedComponents) {
      copy.connectedComponents.set(id, {
        ...comp,
        cells: new Set(comp.cells)
      });
    }
    
    // No tetromino state to copy since we spawn instantly
    
    return copy;
  }

  // Additional helper methods for debugging and stats
  getEliminationStatus() {
    const eliminating = Array.from(this.connectedComponents.values())
      .filter(c => c.eliminationCountdown >= 0);
    
    return {
      isTimeStopped: this.isTimeStopped(),
      eliminatingComponents: eliminating.length,
      componentCountdowns: eliminating.map(c => c.eliminationCountdown),
      totalComponents: this.connectedComponents.size,
    };
  }

  getComponentsScheduledForElimination(): ConnectedComponent[] {
    return Array.from(this.connectedComponents.values())
      .filter(c => c.eliminationCountdown >= 0);
  }

  getWallTouchingComponents(): ConnectedComponent[] {
    return Array.from(this.connectedComponents.values())
      .filter(c => c.touchesLeftWall && c.touchesRightWall);
  }

  forceUpdateConnectedComponents(): void {
    this.updateConnectedComponents();
  }

  getComponentDisplayColor(component: ConnectedComponent): CellValue {
    if (component.eliminationCountdown >= 0) {
      const ticksPassed = GRID_CONFIG.ELIMINATION_TICKS - component.eliminationCountdown;
      const shouldBlink = Math.floor(ticksPassed / GRID_CONFIG.BLINK_INTERVAL) % 2 === 1;
      return shouldBlink ? GRID_CONFIG.WHITE_COLOR : component.originalColor;
    }
    return component.originalColor;
  }

  /**
   * Instantly drops the current tetromino to the lowest possible position
   * Returns true if a drop occurred, false if no tetromino to drop
   */
  instantDrop(): boolean {
    // First, process a generation to clear eliminations and prevent errors
    this.step();

    // Handle falling tetromino pieces
    if (this.fallingPieceCells.size > 0) {
      // Clear current falling pieces and get their info for instant drop
      const fallingPieces: Array<{ x: number; y: number; color: CellValue }> = [];
      for (const cellKey of this.fallingPieceCells) {
        const { x, y } = this.keyToPosition(cellKey);
        const grain = this.grid[y][x];
        if (grain) {
          fallingPieces.push({ x, y, color: grain.color });
        }
        this.grid[y][x] = null;
      }
      this.fallingPieceCells.clear();

      // Find the X range of falling pieces
      let minX = this.width, maxX = -1;
      for (const piece of fallingPieces) {
        minX = Math.min(minX, piece.x);
        maxX = Math.max(maxX, piece.x);
      }

      // Find highest obstacle in the X range of falling pieces
      let highestObstacleY = -1;
      for (let x = minX; x <= maxX; x++) {
        for (let y = 0; y < this.height; y++) {
          if (this.grid[y][x] !== null) {
            highestObstacleY = Math.max(highestObstacleY, y);
          }
        }
      }

      // Stack falling pieces on top of obstacles, column by column
      const columnHeights = new Map<number, number>();
      
      // Initialize column heights based on existing obstacles
      for (let x = minX; x <= maxX; x++) {
        let columnHeight = -1;
        for (let y = 0; y < this.height; y++) {
          if (this.grid[y][x] !== null) {
            columnHeight = Math.max(columnHeight, y);
          }
        }
        columnHeights.set(x, columnHeight);
      }

      // Place each falling piece on top of its column
      for (const piece of fallingPieces) {
        const currentHeight = columnHeights.get(piece.x) ?? -1;
        const targetY = currentHeight + 1;
        
        if (targetY < this.height) {
          this.grid[targetY][piece.x] = this.createGrain(piece.color);
          columnHeights.set(piece.x, targetY); // Update column height
        }
      }

      this.canSpawnNewPiece = true;
      return true;
    }


    return false;
  }

  /**
   * Moves the current tetromino down by one sand block (1 cell)
   * Returns true if movement occurred, false if no tetromino to move or blocked
   */
  softDrop(): boolean {
    // First, process a generation to clear eliminations and prevent errors
    this.step();

    // Since we spawn instantly now, no special spawning handling needed

    // Handle falling pieces - move them down by 1 cell
    if (this.fallingPieceCells.size > 0) {
      const newFallingPieceCells = new Set<string>();
      const piecesToMove: Array<{ x: number; y: number; value: CellValue }> = [];
      
      // Collect current falling pieces
      for (const cellKey of this.fallingPieceCells) {
        const { x, y } = this.keyToPosition(cellKey);
        const grain = this.grid[y][x];
        if (grain) {
          piecesToMove.push({ x, y, value: grain.color });
        }
      }

      // Check if we can move all pieces down by 1
      let canMoveDown = true;
      for (const piece of piecesToMove) {
        const newY = piece.y - 1;
        if (newY < 0 || (this.grid[newY][piece.x] !== null && !this.fallingPieceCells.has(this.positionToKey(piece.x, newY)))) {
          canMoveDown = false;
          break;
        }
      }

      if (canMoveDown) {
        // Clear old positions
        for (const cellKey of this.fallingPieceCells) {
          const { x, y } = this.keyToPosition(cellKey);
          this.grid[y][x] = null;
        }

        // Move pieces down
        for (const piece of piecesToMove) {
          const newY = piece.y - 1;
          this.grid[newY][piece.x] = this.createGrain(piece.value);
          newFallingPieceCells.add(this.positionToKey(piece.x, newY));
        }

        this.fallingPieceCells = newFallingPieceCells;
        return true;
      } else {
        // Can't move down - settle the pieces
        this.canSpawnNewPiece = true;
        this.fallingPieceCells.clear();
        return false;
      }
    }

    return false;
  }

}