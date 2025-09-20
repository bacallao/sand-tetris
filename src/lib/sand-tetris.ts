// Sand Tetris - Cellular Automata Game
// Optimized grid system for 100x2000 cells with values 0-6

export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
  private grid: CellValue[][];
  public readonly width: number;
  public readonly height: number;
  private connectedComponents = new Map<number, ConnectedComponent>();
  private nextComponentId = 1;
  private hasActiveEliminations = false;
  private tetrominoSpawnState: TetrominoSpawnState | null = null;
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

  private createEmptyGrid(): CellValue[][] {
    return Array.from({ length: this.height }, () => 
      new Array(this.width).fill(0) as CellValue[]
    );
  }

  getCell(x: number, y: number): CellValue {
    return this.isValidPosition(x, y) ? this.grid[y][x] : 0;
  }

  setCell(x: number, y: number, value: CellValue): boolean {
    if (!this.isValidPosition(x, y) || !this.isValidCellValue(value)) {
      return false;
    }
    this.grid[y][x] = value;
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
    this.tetrominoSpawnState = null;
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
        const cellValue = this.grid[y][x];
        if (cellValue === 0) continue;
        
        const currentKey = this.positionToKey(x, y);
        const currentColor = this.getOriginalColor(x, y, cellValue);
        colorMap.set(currentKey, currentColor);
        
        // Check only right and up neighbors to avoid redundancy
        for (const [dx, dy] of DIRECTIONS.slice(0, 4)) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (this.isValidPosition(nx, ny)) {
            const neighborValue = this.grid[ny][nx];
            if (neighborValue !== 0) {
              const neighborColor = this.getOriginalColor(nx, ny, neighborValue);
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
            const neighborValue = this.grid[ny][nx];
            if (neighborValue !== 0) {
              const neighborColor = this.getOriginalColor(nx, ny, neighborValue);
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
        if (this.isValidPosition(x, y)) {
          this.grid[y][x] = displayColor;
        }
      }
      
      component.eliminationCountdown--;
      
      if (component.eliminationCountdown < 0) {
        // Eliminate component
        for (const cellKey of component.cells) {
          const { x, y } = this.keyToPosition(cellKey);
          if (this.isValidPosition(x, y)) {
            this.grid[y][x] = 0;
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
        this.grid[y][x] = value;
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
    
    this.tetrominoSpawnState = {
      type,
      startX,
      currentRow: 0,
      totalRows: tetrominoHeight,
      isActive: true,
      shape,
      color
    };
    
    this.fallingPieceCells.clear();
    this.canSpawnNewPiece = false;
    
    return true;
  }

  isSpawningTetromino(): boolean {
    return this.tetrominoSpawnState?.isActive ?? false;
  }

  getTetrominoSpawnProgress(): number {
    if (!this.tetrominoSpawnState?.isActive) {
      return 1;
    }
    return this.tetrominoSpawnState.currentRow / this.tetrominoSpawnState.totalRows;
  }

  private checkCollisionWithPlacedPieces(x: number, y: number, direction: 'left' | 'right' | 'bottom'): boolean {
    const [checkX, checkY] = direction === 'left' ? [x - 1, y] :
                             direction === 'right' ? [x + 1, y] :
                             [x, y - 1];
    
    if (direction === 'bottom' && checkY < 0) {
      return true; // Hit floor
    }
    
    if (this.isValidPosition(checkX, checkY)) {
      const cellValue = this.grid[checkY][checkX];
      if (cellValue >= 1 && cellValue <= 6) {
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

  private updateTetrominoSpawning(targetGrid: CellValue[][]): boolean {
    if (!this.tetrominoSpawnState?.isActive) {
      return false;
    }

    const { shape, startX, currentRow, totalRows, color } = this.tetrominoSpawnState;
    
    if (currentRow >= totalRows) {
      this.tetrominoSpawnState = null;
      return false;
    }

    const spawnY = this.height - 1;
    const shapeRowIndex = Math.floor(currentRow / TETROMINO_BLOCK_SIZE);
    
    if (shapeRowIndex < shape.length) {
      const shapeRow = shape[shapeRowIndex];
      
      for (let col = 0; col < shapeRow.length; col++) {
        if (shapeRow[col] === 1) {
          const baseX = startX + col * TETROMINO_BLOCK_SIZE;
          for (let blockX = 0; blockX < TETROMINO_BLOCK_SIZE; blockX++) {
            const x = baseX + blockX;
            if (this.isValidPosition(x, spawnY)) {
              targetGrid[spawnY][x] = color;
              this.fallingPieceCells.add(this.positionToKey(x, spawnY));
            }
          }
        }
      }
    }

    this.tetrominoSpawnState.currentRow++;
    return true;
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
    const nextGrid = this.createEmptyGrid();
    const newFallingPieceCells = new Set<string>();
    let anyMovement = false;

    // Process cells bottom-up for proper physics
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.grid[y][x];
        if (cell === 0) continue;

        const cellKey = this.positionToKey(x, y);
        const isFalling = this.fallingPieceCells.has(cellKey);
        
        let placed = false;
        let newX = x, newY = y;

        // Try falling positions
        const positions = [
          [x, y - 1],           // straight down
          [x - 1, y - 1],       // down-left
          [x + 1, y - 1]        // down-right
        ];

        for (const [px, py] of positions) {
          if (py >= 0 && px >= 0 && px < this.width && nextGrid[py][px] === 0) {
            nextGrid[py][px] = cell;
            newX = px;
            newY = py;
            placed = true;
            anyMovement = true;
            break;
          }
        }

        if (!placed) {
          nextGrid[y][x] = cell;
        }

        if (isFalling) {
          newFallingPieceCells.add(this.positionToKey(newX, newY));
        }
      }
    }

    this.fallingPieceCells = newFallingPieceCells;
    this.grid = nextGrid;

    if (anyMovement) anyChange = true;

    // Check collision for falling pieces
    if (!this.canSpawnNewPiece && this.fallingPieceCells.size > 0) {
      if (this.checkFallingPieceCollisions()) {
        this.canSpawnNewPiece = true;
        this.fallingPieceCells.clear();
      }
    }

    // Check game over
    for (let x = 0; x < this.width; x++) {
      if (this.grid[this.height - 1][x] !== 0) {
        this.isGameOver = true;
        return true;
      }
    }

    // Spawn tetromino
    const stillSpawning = this.updateTetrominoSpawning(this.grid);
    if (stillSpawning) anyChange = true;

    return anyChange;
  }

  nextState(): void {
    this.step();
  }

  countCells(value: CellValue): number {
    let count = 0;
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell === value) count++;
      }
    }
    return count;
  }

  clone(): SandTetrisGrid {
    const copy = new SandTetrisGrid(this.width, this.height);
    
    // Deep copy grid
    for (let y = 0; y < this.height; y++) {
      copy.grid[y] = [...this.grid[y]];
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
    
    // Copy tetromino state
    if (this.tetrominoSpawnState) {
      copy.tetrominoSpawnState = { ...this.tetrominoSpawnState };
    }
    
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

    // Handle spawning tetromino
    if (this.tetrominoSpawnState?.isActive) {
      const { type, color, startX, shape, currentRow, totalRows } = this.tetrominoSpawnState;
      
      // Clear any partial spawning
      for (const cellKey of this.fallingPieceCells) {
        const { x, y } = this.keyToPosition(cellKey);
        this.grid[y][x] = 0;
      }
      this.fallingPieceCells.clear();
      this.tetrominoSpawnState = null;

      // Calculate tetromino dimensions
      const tetrominoWidth = shape[0].length * TETROMINO_BLOCK_SIZE;

      // Find highest obstacle in tetromino's X range
      let highestObstacleY = -1;
      for (let x = startX; x < startX + tetrominoWidth && x < this.width; x++) {
        for (let y = 0; y < this.height; y++) {
          if (this.grid[y][x] !== 0) {
            highestObstacleY = Math.max(highestObstacleY, y);
          }
        }
      }

      // Place tetromino on top of highest obstacle
      const targetBottomY = highestObstacleY + 1;
      
      // Check if tetromino fits - the complete tetromino should fit from the target position
      const tetrominoHeight = shape.length * TETROMINO_BLOCK_SIZE;
      const targetTopY = targetBottomY + tetrominoHeight - 1;
      
      // Game over only if the tetromino would extend beyond the top of the grid
      // Note: grid Y coordinates are 0 to (height-1), so targetTopY must be < height
      if (targetTopY >= this.height) {
        this.isGameOver = true;
        return true;
      }

      // Place the complete tetromino shape as a solid structure
      // Bottom to top, left to right placement
      for (let shapeRow = 0; shapeRow < shape.length; shapeRow++) {
        for (let shapeCol = 0; shapeCol < shape[shapeRow].length; shapeCol++) {
          if (shape[shapeRow][shapeCol] === 1) {
            const baseX = startX + (shapeCol * TETROMINO_BLOCK_SIZE);
            const baseY = targetBottomY + (shapeRow * TETROMINO_BLOCK_SIZE);
            
            // Fill 5x5 block for this shape cell
            for (let blockY = 0; blockY < TETROMINO_BLOCK_SIZE; blockY++) {
              for (let blockX = 0; blockX < TETROMINO_BLOCK_SIZE; blockX++) {
                const x = baseX + blockX;
                const y = baseY + blockY;
                
                if (this.isValidPosition(x, y)) {
                  if (this.grid[y][x] === 0) {
                    this.grid[y][x] = color;
                  } else {
                    // Overlap detected - game over
                    this.isGameOver = true;
                    return true;
                  }
                }
              }
            }
          }
        }
      }

      // The tetromino is now placed as a solid structure
      // Clear falling pieces and allow new spawning
      this.fallingPieceCells.clear();
      this.canSpawnNewPiece = true;
      return true;
    }

    // Handle falling pieces (individual sand grains)
    if (this.fallingPieceCells.size > 0) {
      // Store falling piece data and clear current positions
      const fallingPieces: Array<{ x: number; y: number; value: CellValue }> = [];
      let minX = this.width, maxX = -1;
      
      for (const cellKey of this.fallingPieceCells) {
        const { x, y } = this.keyToPosition(cellKey);
        fallingPieces.push({ x, y, value: this.grid[y][x] });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        this.grid[y][x] = 0; // Clear old position
      }

      // Find highest obstacle in the X range of falling pieces
      let highestObstacleY = -1;
      for (let x = minX; x <= maxX; x++) {
        for (let y = 0; y < this.height; y++) {
          if (this.grid[y][x] !== 0) {
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
          if (this.grid[y][x] !== 0) {
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
          this.grid[targetY][piece.x] = piece.value;
          columnHeights.set(piece.x, targetY); // Update column height
        }
      }

      this.fallingPieceCells.clear();
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

    // Handle spawning tetromino - just advance the spawn by one row
    if (this.tetrominoSpawnState?.isActive) {
      // Simply advance the spawning by one row if possible
      if (this.tetrominoSpawnState.currentRow < this.tetrominoSpawnState.totalRows) {
        this.tetrominoSpawnState.currentRow++;
        return true;
      }
      return false;
    }

    // Handle falling pieces - move them down by 1 cell
    if (this.fallingPieceCells.size > 0) {
      const newFallingPieceCells = new Set<string>();
      const piecesToMove: Array<{ x: number; y: number; value: CellValue }> = [];
      
      // Collect current falling pieces
      for (const cellKey of this.fallingPieceCells) {
        const { x, y } = this.keyToPosition(cellKey);
        piecesToMove.push({ x, y, value: this.grid[y][x] });
      }

      // Check if we can move all pieces down by 1
      let canMoveDown = true;
      for (const piece of piecesToMove) {
        const newY = piece.y - 1;
        if (newY < 0 || (this.grid[newY][piece.x] !== 0 && !this.fallingPieceCells.has(this.positionToKey(piece.x, newY)))) {
          canMoveDown = false;
          break;
        }
      }

      if (canMoveDown) {
        // Clear old positions
        for (const cellKey of this.fallingPieceCells) {
          const { x, y } = this.keyToPosition(cellKey);
          this.grid[y][x] = 0;
        }

        // Move pieces down
        for (const piece of piecesToMove) {
          const newY = piece.y - 1;
          this.grid[newY][piece.x] = piece.value;
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