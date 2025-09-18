// Sand Tetris - Cellular Automata Game
// Grid system for 100x2000 cells with values 0-6 (0=empty, 1-5=sand colors, 6=white for blinking)

export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 6 = white (for blinking animation)

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
  MAX_CELL_VALUE: 6, // Including white (6) for blinking animation
  ELIMINATION_TICKS: 20, // Number of ticks before wall-touching components are eliminated
  WHITE_COLOR: 6, // White color for blinking animation
} as const;

// Tetromino shapes - each 1 represents a 5x5 block of sand
export const TETROMINO_SHAPES = {
  I: [
    [1, 1, 1, 1]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  T: [
    [0, 1, 1],
    [1, 1, 1]
  ],
  L: [
    [1, 0],
    [1, 0],
    [1, 1]
  ],
  J: [
    [0, 1],
    [0, 1],
    [1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1]
  ]
} as const;

export type TetrominoType = keyof typeof TETROMINO_SHAPES;

// Available sand colors (excluding 0=empty and 6=white for blinking)
export const SAND_COLORS: CellValue[] = [1, 2, 3, 4, 5] as const;

export const TETROMINO_BLOCK_SIZE = 5; // Each tetromino cell is 5x5 sand blocks

// Color mapping for cell values
export const CELL_COLORS: Record<CellValue, string> = {
  0: '#000000', // Empty - Black
  1: '#FFD700', // Sand - Gold
  2: '#4169E1', // Water - Royal Blue
  3: '#8B4513', // Earth - Saddle Brown
  4: '#DC143C', // Fire - Crimson
  5: '#32CD32', // Plant - Lime Green
  6: '#FFFFFF', // White - White (for blinking animation)
} as const;

export interface ConnectedComponent {
  id: number;
  cells: Set<string>; // Set of "x,y" position strings
  originalColor: CellValue; // The original sand color (1-5)
  touchesLeftWall: boolean;
  touchesRightWall: boolean;
  eliminationCountdown: number; // -1 means not scheduled for elimination, 0+ means countdown active
}

/**
 * Disjoint Set Union (DSU) data structure for connected components analysis
 */
class DisjointSetUnion {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  /**
   * Find the root parent of a position with path compression
   */
  find(pos: string): string {
    if (!this.parent.has(pos)) {
      this.parent.set(pos, pos);
      this.rank.set(pos, 0);
      return pos;
    }

    const parentPos = this.parent.get(pos)!;
    if (parentPos !== pos) {
      // Path compression
      this.parent.set(pos, this.find(parentPos));
    }
    return this.parent.get(pos)!;
  }

  /**
   * Union two positions by rank
   */
  union(pos1: string, pos2: string): void {
    const root1 = this.find(pos1);
    const root2 = this.find(pos2);

    if (root1 === root2) return;

    const rank1 = this.rank.get(root1) || 0;
    const rank2 = this.rank.get(root2) || 0;

    if (rank1 < rank2) {
      this.parent.set(root1, root2);
    } else if (rank1 > rank2) {
      this.parent.set(root2, root1);
    } else {
      this.parent.set(root2, root1);
      this.rank.set(root1, rank1 + 1);
    }
  }

  /**
   * Get all unique components (root parents)
   */
  getComponents(): Set<string> {
    const components = new Set<string>();
    for (const pos of this.parent.keys()) {
      components.add(this.find(pos));
    }
    return components;
  }

  /**
   * Get all positions belonging to a component
   */
  getComponentCells(root: string): Set<string> {
    const cells = new Set<string>();
    for (const pos of this.parent.keys()) {
      if (this.find(pos) === root) {
        cells.add(pos);
      }
    }
    return cells;
  }
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

export class TetrominoSpawner {
  private grid: SandTetrisGrid;
  private spawnState: TetrominoSpawnState | null = null;

  constructor(grid: SandTetrisGrid) {
    this.grid = grid;
  }

  /**
   * Start spawning a Tetromino of the given type
   */
  spawnTetromino(type: TetrominoType): boolean {
    if (this.spawnState?.isActive) {
      return false; // Already spawning
    }

    const shape = TETROMINO_SHAPES[type];
    // Pick a random color from available sand colors
    const color = SAND_COLORS[Math.floor(Math.random() * SAND_COLORS.length)];
    
    // Calculate the width and height in sand blocks
    const tetrominoWidth = shape[0].length * TETROMINO_BLOCK_SIZE;
    const tetrominoHeight = shape.length * TETROMINO_BLOCK_SIZE;
    
    // Ensure the tetromino fits within the grid boundaries
    const maxStartX = this.grid.width - tetrominoWidth;
    if (maxStartX < 0) {
      console.log(`Tetromino ${type} too wide: width=${tetrominoWidth}, gridWidth=${this.grid.width}`);
      return false; // Tetromino too wide for grid
    }
    
    // Random X position, always left-aligned and fits within boundaries
    const startX = Math.floor(Math.random() * (maxStartX + 1));
    
    // Start from the top of the grid
    const startY = this.grid.height - 1;
    
    console.log(`Spawning ${type} at (${startX}, ${startY}), color=${color}, size=${tetrominoWidth}x${tetrominoHeight}`);
    
    this.spawnState = {
      type,
      startX,
      currentRow: 0,
      totalRows: tetrominoHeight,
      isActive: true,
      shape,
      color
    };
    
    return true;
  }

  /**
   * Update the spawning animation (call this each tick)
   * Returns true if spawning is still in progress
   */
  updateSpawn(nextGrid: CellValue[][]): boolean {
    if (!this.spawnState?.isActive) {
      return false;
    }

    const { shape, startX, currentRow, totalRows, color, type } = this.spawnState;
    
    // Stop spawning if we've finished drawing all rows
    if (currentRow >= totalRows) {
      console.log(`Finished spawning ${type}`);
      this.spawnState.isActive = false;
      this.spawnState = null;
      return false;
    }

    // Always spawn at the top of the grid - physics will move previous rows down
    const spawnY = this.grid.height - 1;

    // Determine which shape row we're working on
    const shapeRowIndex = Math.floor(currentRow / TETROMINO_BLOCK_SIZE);
    
    // Only spawn if we're within a valid shape row
    if (shapeRowIndex < shape.length) {
      const shapeRow = shape[shapeRowIndex];
      
      // Create the row pattern: [0]*5 + [1*color]*5 + [0]*5 for T-piece top row
      const rowPattern: CellValue[] = [];
      for (let col = 0; col < shapeRow.length; col++) {
        const cellValue = shapeRow[col];
        // Add 5 blocks for this tetromino cell
        for (let blockX = 0; blockX < TETROMINO_BLOCK_SIZE; blockX++) {
          rowPattern.push(cellValue === 1 ? color : 0);
        }
      }
      
      // Spawn this row into the next generation grid instead of current grid
      for (let i = 0; i < rowPattern.length; i++) {
        const x = startX + i;
        if (this.grid.isValidPosition(x, spawnY) && rowPattern[i] !== 0) {
          nextGrid[spawnY][x] = rowPattern[i];
        }
      }
    }

    this.spawnState.currentRow++;
    return true;
  }

  /**
   * Check if currently spawning
   */
  isSpawning(): boolean {
    return this.spawnState?.isActive ?? false;
  }

  /**
   * Get current spawn progress (0-1)
   */
  getSpawnProgress(): number {
    if (!this.spawnState?.isActive) {
      return 1;
    }
    
    return this.spawnState.currentRow / this.spawnState.totalRows;
  }
}

export class SandTetrisGrid {
  private grid: CellValue[][];
  public readonly width: number;
  public readonly height: number;
  private connectedComponents: Map<number, ConnectedComponent>;
  private nextComponentId: number;
  private hasActiveEliminations: boolean; // Track if eliminations are happening
  private tetrominoSpawnState: TetrominoSpawnState | null = null;

  constructor(
    width: number = GRID_CONFIG.WIDTH,
    height: number = GRID_CONFIG.HEIGHT
  ) {
    this.width = width;
    this.height = height;
    this.grid = this.initializeGrid();
    this.connectedComponents = new Map();
    this.nextComponentId = 1;
    this.hasActiveEliminations = false; // Track if eliminations are happening
  }

  /**
   * Initialize the grid with all cells set to 0 (empty)
   */
  private initializeGrid(): CellValue[][] {
    const grid: CellValue[][] = [];
    for (let y = 0; y < this.height; y++) {
      grid[y] = [];
      for (let x = 0; x < this.width; x++) {
        grid[y][x] = 0;
      }
    }
    return grid;
  }

  /**
   * Get the value of a cell at the given position
   */
  getCell(x: number, y: number): CellValue {
    if (!this.isValidPosition(x, y)) {
      return 0; // Return empty cell for out-of-bounds positions
    }
    return this.grid[y][x];
  }

  /**
   * Set the value of a cell at the given position
   */
  setCell(x: number, y: number, value: CellValue): boolean {
    if (!this.isValidPosition(x, y) || !this.isValidCellValue(value)) {
      return false;
    }
    this.grid[y][x] = value;
    return true;
  }

  /**
   * Check if a position is within grid bounds
   */
  isValidPosition(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Check if a cell value is valid (0-5)
   */
  isValidCellValue(value: number): value is CellValue {
    return (
      Number.isInteger(value) &&
      value >= GRID_CONFIG.MIN_CELL_VALUE &&
      value <= GRID_CONFIG.MAX_CELL_VALUE
    );
  }

  /**
   * Clear the entire grid (set all cells to 0)
   */
  clear(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x] = 0;
      }
    }
    this.connectedComponents.clear();
    this.nextComponentId = 1;
    this.hasActiveEliminations = false;
    this.tetrominoSpawnState = null;
  }

  /**
   * Convert position to string key for DSU operations
   */
  private positionToKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  /**
   * Convert string key back to position
   */
  private keyToPosition(key: string): { x: number; y: number } {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }

  /**
   * Get the original color for a cell, considering blinking animation
   */
  private getOriginalColorForCell(x: number, y: number, currentValue: CellValue): CellValue {
    const cellKey = this.positionToKey(x, y);
    
    // Check if this cell is part of an existing component
    for (const component of this.connectedComponents.values()) {
      if (component.cells.has(cellKey)) {
        return component.originalColor;
      }
    }
    
    // If not part of existing component, the current value is the original color
    // (unless it's white, which shouldn't happen for new cells)
    return currentValue === GRID_CONFIG.WHITE_COLOR ? 1 : currentValue;
  }

  /**
   * Find all connected components of sand (same color, connected via up/down/left/right)
   */
  private findConnectedComponents(): Map<number, ConnectedComponent> {
    const dsu = new DisjointSetUnion();
    const components = new Map<number, ConnectedComponent>();
    
    // First pass: find all sand cells and union adjacent cells of same original color
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cellValue = this.grid[y][x];
        if (cellValue >= 1 && cellValue <= 6) { // Include white cells
          const currentKey = this.positionToKey(x, y);
          
          // Get original color (if this cell is part of an existing component)
          const currentOriginalColor = this.getOriginalColorForCell(x, y, cellValue);
          
          // Check 4-directional neighbors (up, down, left, right)
          const neighbors = [
            { x: x - 1, y: y }, // left
            { x: x + 1, y: y }, // right
            { x: x, y: y - 1 }, // down
            { x: x, y: y + 1 }  // up
          ];
          
          for (const neighbor of neighbors) {
            if (this.isValidPosition(neighbor.x, neighbor.y)) {
              const neighborValue = this.grid[neighbor.y][neighbor.x];
              if (neighborValue >= 1 && neighborValue <= 6) {
                const neighborOriginalColor = this.getOriginalColorForCell(neighbor.x, neighbor.y, neighborValue);
                
                // Only connect cells of the same original color
                if (neighborOriginalColor === currentOriginalColor) {
                  const neighborKey = this.positionToKey(neighbor.x, neighbor.y);
                  dsu.union(currentKey, neighborKey);
                }
              }
            }
          }
        }
      }
    }

    // Second pass: group cells by their root component and analyze wall touching
    const rootToComponent = new Map<string, ConnectedComponent>();
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cellValue = this.grid[y][x];
        if (cellValue >= 1 && cellValue <= 6) { // Include white cells
          const currentKey = this.positionToKey(x, y);
          const root = dsu.find(currentKey);
          const originalColor = this.getOriginalColorForCell(x, y, cellValue);
          
          if (!rootToComponent.has(root)) {
            rootToComponent.set(root, {
              id: this.nextComponentId++,
              cells: new Set(),
              originalColor: originalColor,
              touchesLeftWall: false,
              touchesRightWall: false,
              eliminationCountdown: -1
            });
          }
          
          const component = rootToComponent.get(root)!;
          component.cells.add(currentKey);
          
          // Check if this cell touches walls
          if (x === 0) {
            component.touchesLeftWall = true;
          }
          if (x === this.width - 1) {
            component.touchesRightWall = true;
          }
        }
      }
    }

    // Convert to numbered map
    let componentId = 1;
    for (const component of rootToComponent.values()) {
      components.set(componentId++, component);
    }

    return components;
  }

  /**
   * Process elimination countdown for wall-touching components with blinking animation
   */
  private processEliminationCountdowns(): { eliminated: boolean; blinking: boolean } {
    const componentsToDelete: number[] = [];
    let anyComponentsEliminated = false;
    let anyComponentsBlinking = false;
    
    for (const [id, component] of this.connectedComponents) {
      if (component.eliminationCountdown >= 0) {
        anyComponentsBlinking = true;
        component.eliminationCountdown--;
        
        // Apply blinking animation every 5 ticks
        const shouldShowWhite = Math.floor((GRID_CONFIG.ELIMINATION_TICKS - component.eliminationCountdown) / 5) % 2 === 1;
        const displayColor = shouldShowWhite ? GRID_CONFIG.WHITE_COLOR : component.originalColor;
        
        // Update all cells in the component with the current display color
        for (const cellKey of component.cells) {
          const { x, y } = this.keyToPosition(cellKey);
          if (this.isValidPosition(x, y)) {
            this.grid[y][x] = displayColor;
          }
        }
        
        if (component.eliminationCountdown < 0) {
          // Changed from <= 0 to < 0 to avoid off-by-one error
          // Time to eliminate this component
          for (const cellKey of component.cells) {
            const { x, y } = this.keyToPosition(cellKey);
            if (this.isValidPosition(x, y)) {
              this.grid[y][x] = 0; // Replace with air/empty space
            }
          }
          componentsToDelete.push(id);
          anyComponentsEliminated = true;
        }
      }
    }
    
    // Remove eliminated components
    for (const id of componentsToDelete) {
      this.connectedComponents.delete(id);
    }
    
    this.hasActiveEliminations = anyComponentsBlinking;
    
    return { eliminated: anyComponentsEliminated, blinking: anyComponentsBlinking };
  }

  /**
   * Update connected components analysis and start elimination timers for wall-touching components
   */
  private updateConnectedComponents(): { eliminated: boolean; blinking: boolean } {
    // Process existing elimination countdowns first (this modifies the grid and may eliminate components)
    const { eliminated, blinking } = this.processEliminationCountdowns();
    
    if (blinking && !eliminated) {
      // Still eliminating, don't rebuild components
      return { eliminated, blinking };
    }
    
    // Rebuild components when:
    // 1. No eliminations are in progress, OR
    // 2. Components were just eliminated (need to check for new patterns)
    const newComponents = this.findConnectedComponents();
    
    // Check for new wall-touching components and start elimination countdown
    for (const [newId, newComponent] of newComponents) {
      if (newComponent.touchesLeftWall && newComponent.touchesRightWall) {
        // Start new elimination countdown
        newComponent.eliminationCountdown = GRID_CONFIG.ELIMINATION_TICKS - 1;
        this.hasActiveEliminations = true;
      }
    }
    
    // Replace components with the updated ones
    this.connectedComponents = newComponents;
    return { eliminated, blinking: this.hasActiveEliminations };
  }

  /**
   * Get all current connected components (for debugging/visualization)
   */
  getConnectedComponents(): ReadonlyMap<number, ConnectedComponent> {
    return this.connectedComponents;
  }

  /**
   * Get components that are scheduled for elimination (countdown > 0)
   */
  getComponentsScheduledForElimination(): ConnectedComponent[] {
    return Array.from(this.connectedComponents.values()).filter(
      component => component.eliminationCountdown > 0
    );
  }

  /**
   * Get components that touch both walls (regardless of elimination status)
   */
  getWallTouchingComponents(): ConnectedComponent[] {
    return Array.from(this.connectedComponents.values()).filter(
      component => component.touchesLeftWall && component.touchesRightWall
    );
  }

  /**
   * Force update connected components analysis (useful for debugging)
   */
  forceUpdateConnectedComponents(): void {
    this.updateConnectedComponents();
  }

  /**
   * Get the current display color for a component (considering blinking animation)
   */
  getComponentDisplayColor(component: ConnectedComponent): CellValue {
    if (component.eliminationCountdown >= 0) {
      const shouldShowWhite = Math.floor((GRID_CONFIG.ELIMINATION_TICKS - component.eliminationCountdown) / 5) % 2 === 1;
      return shouldShowWhite ? GRID_CONFIG.WHITE_COLOR : component.originalColor;
    }
    return component.originalColor;
  }

  /**
   * Check if time should be stopped (any components are being eliminated)
   */
  private isTimeStoppedForElimination(): boolean {
    return this.hasActiveEliminations;
  }

  /**
   * Public method to check if time is currently stopped for elimination
   */
  isTimeStopped(): boolean {
    return this.hasActiveEliminations;
  }

  /**
   * Get detailed elimination status for debugging
   */
  getEliminationStatus(): {
    isTimeStopped: boolean;
    eliminatingComponents: number;
    componentCountdowns: number[];
    totalComponents: number;
  } {
    const eliminatingComponents = this.getComponentsScheduledForElimination();
    return {
      isTimeStopped: this.isTimeStopped(),
      eliminatingComponents: eliminatingComponents.length,
      componentCountdowns: eliminatingComponents.map(c => c.eliminationCountdown),
      totalComponents: this.connectedComponents.size,
    };
  }

  /**
   * Fill a rectangular area with a specific value
   */
  fillRect(
    startX: number,
    startY: number,
    width: number,
    height: number,
    value: CellValue
  ): void {
    if (!this.isValidCellValue(value)) return;

    const endX = Math.min(startX + width, this.width);
    const endY = Math.min(startY + height, this.height);

    for (let y = Math.max(0, startY); y < endY; y++) {
      for (let x = Math.max(0, startX); x < endX; x++) {
        this.grid[y][x] = value;
      }
    }
  }

  /**
   * Start spawning a Tetromino of the given type
   */
  startTetrominoSpawn(type: TetrominoType): boolean {
    console.log(`startTetrominoSpawn called with type: ${type}`);
    
    if (this.tetrominoSpawnState?.isActive) {
      console.log(`Already spawning ${this.tetrominoSpawnState.type}, ignoring new spawn request`);
      return false; // Already spawning
    }

    const shape = TETROMINO_SHAPES[type];
    // Pick a random color from available sand colors
    const color = SAND_COLORS[Math.floor(Math.random() * SAND_COLORS.length)];
    
    // Calculate the width and height in sand blocks
    const tetrominoWidth = shape[0].length * TETROMINO_BLOCK_SIZE;
    const tetrominoHeight = shape.length * TETROMINO_BLOCK_SIZE;
    
    // Ensure the tetromino fits within the grid boundaries
    const maxStartX = this.width - tetrominoWidth;
    if (maxStartX < 0) {
      console.log(`Tetromino ${type} too wide: width=${tetrominoWidth}, gridWidth=${this.width}`);
      return false; // Tetromino too wide for grid
    }
    
    // Random X position, always left-aligned and fits within boundaries
    const startX = Math.floor(Math.random() * (maxStartX + 1));
    
    console.log(`Setting up spawn for ${type} at (${startX}, ${this.height - 1}), color=${color}, size=${tetrominoWidth}x${tetrominoHeight}`);
    
    this.tetrominoSpawnState = {
      type,
      startX,
      currentRow: 0,
      totalRows: tetrominoHeight,
      isActive: true,
      shape,
      color
    };
    
    console.log(`Spawn state created:`, this.tetrominoSpawnState);
    
    return true;
  }

  /**
   * Check if currently spawning a tetromino
   */
  isSpawningTetromino(): boolean {
    return this.tetrominoSpawnState?.isActive ?? false;
  }

  /**
   * Get current tetromino spawn progress (0-1)
   */
  getTetrominoSpawnProgress(): number {
    if (!this.tetrominoSpawnState?.isActive) {
      return 1;
    }
    
    return this.tetrominoSpawnState.currentRow / this.tetrominoSpawnState.totalRows;
  }

  /**
   * Spawn a single row of tetromino blocks
   * @param rowPattern - Array of values (0 or color) representing the row to spawn
   * @param y - Y coordinate to spawn at
   * @param startX - Starting X coordinate
   */
  private spawnRow(rowPattern: CellValue[], y: number, startX: number): void {
    for (let i = 0; i < rowPattern.length; i++) {
      const x = startX + i;
      if (this.isValidPosition(x, y) && rowPattern[i] !== 0) {
        this.grid[y][x] = rowPattern[i];
      }
    }
  }

  /**
   * Spawn a single row of tetromino blocks into a specific grid
   * @param rowPattern - Array of values (0 or color) representing the row to spawn
   * @param y - Y coordinate to spawn at
   * @param startX - Starting X coordinate
   * @param targetGrid - The grid to spawn into
   */
  private spawnRowToGrid(rowPattern: CellValue[], y: number, startX: number, targetGrid: CellValue[][]): void {
    for (let i = 0; i < rowPattern.length; i++) {
      const x = startX + i;
      if (this.isValidPosition(x, y) && rowPattern[i] !== 0) {
        targetGrid[y][x] = rowPattern[i];
      }
    }
  }

  /**
   * Update tetromino spawning state (called during step)
   * Returns true if spawning is still active
   */
  private updateTetrominoSpawning(nextGrid: CellValue[][]): boolean {
    if (!this.tetrominoSpawnState?.isActive) {
      return false;
    }

    const { shape, startX, currentRow, totalRows, color, type } = this.tetrominoSpawnState;
    
    console.log(`updateTetrominoSpawning: ${type}, currentRow=${currentRow}, totalRows=${totalRows}`);
    
    // Stop spawning if we've finished all rows
    if (currentRow >= totalRows) {
      console.log(`Finished spawning ${type}`);
      this.tetrominoSpawnState.isActive = false;
      this.tetrominoSpawnState = null;
      return false;
    }

    // Always spawn at the top of the grid - physics will move previous rows down
    const spawnY = this.height - 1;

    // Determine which shape row we're working on and which tick within that row
    const shapeRowIndex = Math.floor(currentRow / TETROMINO_BLOCK_SIZE);
    const tickWithinShapeRow = currentRow % TETROMINO_BLOCK_SIZE;
    
    // Only spawn if we're within a valid shape row
    if (shapeRowIndex < shape.length) {
      const shapeRow = shape[shapeRowIndex];
      
      // Create the row pattern for this specific tick: [0]*5 + [1*color]*5 + [0]*5 for T-piece top row
      const rowPattern: CellValue[] = [];
      for (let col = 0; col < shapeRow.length; col++) {
        const cellValue = shapeRow[col];
        // Add 5 blocks for this tetromino cell
        for (let blockX = 0; blockX < TETROMINO_BLOCK_SIZE; blockX++) {
          rowPattern.push(cellValue === 1 ? color : 0);
        }
      }
      
      console.log(`Spawning tick ${currentRow} (shape row ${shapeRowIndex}, tick ${tickWithinShapeRow}) of ${type} at Y=${spawnY}, pattern:`, rowPattern);
      
      // Use spawnRow function to spawn into nextGrid
      this.spawnRowToGrid(rowPattern, spawnY, startX, nextGrid);
    }

    this.tetrominoSpawnState.currentRow++;
    return true;
  }

  /**
   * Perform one simulation step.
   * Returns true if any cell moved or if eliminations are occurring; false if the grid is stable.
   * Order: 1) Calculate next state, 2) Calculate connected components, 3) Erase components, 4) Spawn tetromino
   */
  step(): boolean {
    // Step 1: Update connected components and get elimination status FIRST
    const { eliminated, blinking } = this.updateConnectedComponents();
    
    // If actively blinking/eliminating, don't run physics or spawn - only elimination processing
    if (blinking) {
      // Return true to indicate the grid state has changed (for UI updates)
      return true;
    }

    let anyChange = eliminated;

    // Step 2: Calculate next state (physics simulation)
    const nextGrid = this.initializeGrid();
    let anyMovement = false;

    // Process from bottom (y=0) to top (y=height-1), left to right
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const currentCell = this.grid[y][x];
        
        // If cell is empty, skip it
        if (currentCell === 0) {
          continue;
        }

        // Sand grains (values 1-6, including white) follow falling physics
        if (currentCell >= 1 && currentCell <= 6) {
          // Check positions in order of preference (in nextGrid coordinates)
          const below = y - 1; // One cell down
          const belowLeft = { x: x - 1, y: y - 1 }; // Diagonal down-left
          const belowRight = { x: x + 1, y: y - 1 }; // Diagonal down-right

          let moved = false;

          // Rule 1: Try to move straight down (x, y-1)
          if (below >= 0 && nextGrid[below][x] === 0) {
            nextGrid[below][x] = currentCell;
            moved = true;
          }
          // Rule 2: Try to move diagonally down-left (x-1, y-1)
          else if (
            belowLeft.y >= 0 && 
            belowLeft.x >= 0 && 
            belowLeft.x < this.width &&
            nextGrid[belowLeft.y][belowLeft.x] === 0
          ) {
            nextGrid[belowLeft.y][belowLeft.x] = currentCell;
            moved = true;
          }
          // Rule 3: Try to move diagonally down-right (x+1, y-1)
          else if (
            belowRight.y >= 0 && 
            belowRight.x >= 0 && 
            belowRight.x < this.width &&
            nextGrid[belowRight.y][belowRight.x] === 0
          ) {
            nextGrid[belowRight.y][belowRight.x] = currentCell;
            moved = true;
          }

          // Rule 4: If no movement possible, stay in place
          if (!moved) {
            nextGrid[y][x] = currentCell;
          }

          if (moved) {
            anyMovement = true;
          }
        } else {
          // For any other values (should not happen with current rules), stay in place
          nextGrid[y][x] = currentCell;
        }
      }
    }

    if (anyMovement) anyChange = true;

    // Step 3: Spawn tetromino into nextGrid (if spawning state is active)
    const stillSpawning = this.updateTetrominoSpawning(nextGrid);
    if (stillSpawning) anyChange = true;

    // Step 4: Update grid state with the final nextGrid
    this.grid = nextGrid;

    return anyChange;
  }

  /**
   * Calculate the next state of the grid using sand physics rules
   * Grid coordinates: (0,0) is bottom-left, x increases right, y increases up
   * Sand grains (values 1-6, including white) fall down following simple physics rules
   * Time stops during elimination sequences - only blinking animation and countdown continue
   * Note: kept for backwards compatibility. Prefer using step() for a boolean result.
   */
  nextState(): void {
    this.step();
  }

  /**
   * Count cells with a specific value in the grid
   */
  countCells(value: CellValue): number {
    let count = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === value) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Create a deep copy of the grid instance.
   */
  clone(): SandTetrisGrid {
    const copy = new SandTetrisGrid(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Direct access is allowed within class scope
        copy.grid[y][x] = this.grid[y][x];
      }
    }
    
    // Deep copy connected components
    copy.nextComponentId = this.nextComponentId;
    copy.hasActiveEliminations = this.hasActiveEliminations;
    for (const [id, component] of this.connectedComponents) {
      copy.connectedComponents.set(id, {
        id: component.id,
        cells: new Set(component.cells),
        originalColor: component.originalColor,
        touchesLeftWall: component.touchesLeftWall,
        touchesRightWall: component.touchesRightWall,
        eliminationCountdown: component.eliminationCountdown
      });
    }
    
    // Deep copy tetromino spawn state
    if (this.tetrominoSpawnState) {
      copy.tetrominoSpawnState = {
        type: this.tetrominoSpawnState.type,
        startX: this.tetrominoSpawnState.startX,
        currentRow: this.tetrominoSpawnState.currentRow,
        totalRows: this.tetrominoSpawnState.totalRows,
        isActive: this.tetrominoSpawnState.isActive,
        shape: this.tetrominoSpawnState.shape,
        color: this.tetrominoSpawnState.color
      };
    }
    
    return copy;
  }
}
