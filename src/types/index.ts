export interface TileProfile {
  id: string;
  name: string;
  pixelWidth: number;
  pixelHeight: number;
  defaultPowerUse?: number;
}

export interface TileInstance {
  id: string;
  profileId: string;
  name: string;
  x: number;
  y: number;
  tileNumber?: number;
  /** Manual port number (for legacy / bulk-assign use) */
  portNumber?: number;
  chainOrder?: number;
  powerPosition?: string;
  powerUse?: number;
  /** ID of the ProcessorPort this tile belongs to */
  portId?: string;
  /**
   * Port letter assigned by the routing system, e.g. "A", "B".
   * Combined with chainOrder produces the display label "A1", "B3", etc.
   */
  portName?: string;
  /** When true this tile cannot be dragged/moved on the canvas */
  locked?: boolean;
  /** Clockwise rotation in degrees — 0, 90, 180, or 270 */
  rotation?: 0 | 90 | 180 | 270;
}

export interface LabelVisibility {
  /** Show the tile name */
  showTileName: boolean;
  /** Show port routing label in "A1", "B3" format (port routing system) */
  showPortLabel: boolean;
  /** Show circuit name label */
  showCircuitLabel: boolean;
  /** Show manual portNumber field ("Port 2") */
  showPortNumber: boolean;
  showChainOrder: boolean;
  showTileNumber: boolean;
  showPowerPosition: boolean;
  showPowerUse: boolean;
  showTileResolution: boolean;
}

export const DEFAULT_LABEL_VISIBILITY: LabelVisibility = {
  showTileName: true,
  showPortLabel: true,
  showCircuitLabel: false,
  showPortNumber: false,
  showChainOrder: false,
  showTileNumber: true,
  showPowerPosition: false,
  showPowerUse: false,
  showTileResolution: true,
};

/** A data port on a processor, with an ordered tile chain assigned to one wall */
export interface ProcessorPort {
  id: string;
  name: string;
  color: string;
  /** Which wall this port's tile chain belongs to (null = unassigned) */
  wallId: string | null;
  tileIds: string[];
  /** Maximum pixel capacity for this port (from processor spec). Undefined = uncapped. */
  pixelCapacity?: number;
}

/** A hardware data processor (controller) that owns one or more data ports */
export interface Processor {
  id: string;
  name: string;
  ports: ProcessorPort[];
  /** Set when this processor drives expander units (e.g. Tessera SX40 → XD Box, HELIOS → RS12 Switch) */
  xdBoxCount?: number;
  /** Number of ports per expander unit */
  xdBoxSize?: number;
  /** Maximum allowed expander units for this processor model */
  xdMaxBoxes?: number;
  /** Display label for the expander unit (e.g. "XD Box", "RS12 Switch") */
  expanderLabel?: string;
  /** Custom names for each expander unit, indexed by box position */
  boxNames?: string[];
  /** True when created from the processor library — port count and XD structure are fixed */
  fromLibrary?: boolean;
}

export interface Wall {
  id: string;
  name: string;
  tiles: TileInstance[];
  labelVisibility: LabelVisibility;
  /** Optional LED pixel resolution for this wall (informational — shown on exports) */
  wallWidth?: number;
  wallHeight?: number;
  /** @deprecated ports are now on Processor. Kept for file-load compatibility. */
  ports?: ProcessorPort[];
}

/** A Soca Splay group — contains up to 6 power circuits */
export interface SocaSplay {
  id: string;
  name: string;
  /** Connector/power type label. Cycles: Powercon → True1 → Powercon True1 */
  powerType?: 'Powercon' | 'True1' | 'Powercon True1';
}

/** A power circuit that owns an ordered chain of tiles on one wall */
export interface Circuit {
  id: string;
  name: string;
  color: string;
  /** Which wall this circuit's tile chain belongs to (null = unassigned) */
  wallId: string | null;
  tileIds: string[];
  /** If part of a Soca Splay group, the SocaSplay id */
  socaId?: string;
}

export interface Project {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  /** Bit depth of the project — affects processor pixel capacity (10-bit halves capacity). Defaults to '8bit'. */
  bitDepth: '8bit' | '10bit';
  tileProfiles: TileProfile[];
  walls: Wall[];
  activeWallId: string;
  processors: Processor[];
  circuits: Circuit[];
  socas?: SocaSplay[];
}

export const CANVAS_PRESETS = [
  { label: '1280 × 720 (HD)', width: 1280, height: 720 },
  { label: '1920 × 1080 (Full HD)', width: 1920, height: 1080 },
  { label: '2560 × 1440 (QHD)', width: 2560, height: 1440 },
  { label: '3840 × 2160 (4K UHD)', width: 3840, height: 2160 },
  { label: '7680 × 4320 (8K UHD)', width: 7680, height: 4320 },
  { label: 'Custom', width: 0, height: 0 },
];

export const TILE_COLORS = [
  '#1d4ed8', // blue
  '#15803d', // green
  '#b45309', // amber
  '#7e22ce', // purple
  '#be123c', // rose
  '#0e7490', // cyan
  '#9a3412', // orange
  '#1e3a5f', // navy
  '#065f46', // emerald
  '#86198f', // fuchsia
];

export const PORT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#84cc16', // lime
];
