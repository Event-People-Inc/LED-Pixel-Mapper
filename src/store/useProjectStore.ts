import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Project,
  Wall,
  TileProfile,
  TileInstance,
  LabelVisibility,
  DEFAULT_LABEL_VISIBILITY,
  ProcessorPort,
  Processor,
  Circuit,
  SocaSplay,
  PORT_COLORS,
} from '../types';
import { ProcessorLibraryEntry } from '../processorLibrary';

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const makeWall = (name: string, wallWidth?: number, wallHeight?: number): Wall => ({
  id: genId(),
  name,
  tiles: [],
  labelVisibility: { ...DEFAULT_LABEL_VISIBILITY },
  ...(wallWidth  ? { wallWidth }  : {}),
  ...(wallHeight ? { wallHeight } : {}),
});

export interface BulkUpdate {
  id: string;
  changes: Partial<TileInstance>;
}

export interface PortDisplay {
  showPaths: boolean;
  showArrows: boolean;
  showMarkers: boolean;
  showChainNumbers: boolean;
}

const PORT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Return next unused uppercase letter for a new port across ALL existing ports (flat processors). */
function nextPortLetter(ports: ProcessorPort[]): string {
  const used = new Set(ports.map((p) => p.name));
  for (const ch of PORT_LETTERS) {
    if (!used.has(ch)) return ch;
  }
  for (let i = 0; i < PORT_LETTERS.length; i++) {
    const name = `A${PORT_LETTERS[i]}`;
    if (!used.has(name)) return name;
  }
  return `P${ports.length + 1}`;
}

/**
 * Excel-style column letter for a box index (0-based).
 * 0→A, 1→B, …, 25→Z, 26→AA, 27→AB, …
 */
function xdBoxLetter(boxIdx: number): string {
  let result = '';
  let n = boxIdx + 1;
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/** Port name for an XD-style box port: e.g. box 0 port 2 → "A3", box 1 port 9 → "B10" */
function xdPortName(boxIdx: number, portInBox: number): string {
  return `${xdBoxLetter(boxIdx)}${portInBox + 1}`;
}

/**
 * Find the nearest tile in a cardinal direction from a source tile.
 * Scores candidates by primary-axis gap + 0.5× perpendicular centre misalignment
 * so tiles that are directly in line are always preferred.
 */
function findAdjacentTile(
  current: TileInstance,
  currentW: number, currentH: number,
  tiles: TileInstance[],
  profileMap: Map<string, TileProfile>,
  direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
): TileInstance | null {
  const cx = current.x, cy = current.y;
  const cCx = cx + currentW / 2, cCy = cy + currentH / 2;
  const cRight = cx + currentW, cBottom = cy + currentH;

  let best: TileInstance | null = null;
  let bestScore = Infinity;

  for (const tile of tiles) {
    if (tile.id === current.id) continue;
    const prof = profileMap.get(tile.profileId);
    if (!prof) continue;
    const tx = tile.x, ty = tile.y, tw = prof.pixelWidth, th = prof.pixelHeight;
    const tCx = tx + tw / 2, tCy = ty + th / 2;

    let primary: number;
    let perp: number;
    switch (direction) {
      case 'ArrowRight': if (tx < cRight - 1) continue; primary = tx - cRight;          perp = Math.abs(tCy - cCy); break;
      case 'ArrowLeft':  if (tx + tw > cx + 1) continue; primary = cx - (tx + tw);      perp = Math.abs(tCy - cCy); break;
      case 'ArrowDown':  if (ty < cBottom - 1) continue; primary = ty - cBottom;         perp = Math.abs(tCx - cCx); break;
      case 'ArrowUp':    if (ty + th > cy + 1) continue; primary = cy - (ty + th);       perp = Math.abs(tCx - cCx); break;
    }
    const score = primary + perp * 0.5;
    if (score < bestScore) { bestScore = score; best = tile; }
  }
  return best;
}

/**
 * Re-index chainOrder and portName for all tiles across all walls,
 * based on all processor port assignments.
 */
function syncAllPortTiles(project: Project): Wall[] {
  const tileInfo = new Map<string, { portId: string; portName: string; chainOrder: number }>();
  for (const proc of project.processors ?? []) {
    for (const port of proc.ports) {
      port.tileIds.forEach((tid, idx) => {
        tileInfo.set(tid, { portId: port.id, portName: port.name, chainOrder: idx + 1 });
      });
    }
  }
  return project.walls.map((w) => ({
    ...w,
    tiles: w.tiles.map((t) => {
      const info = tileInfo.get(t.id);
      if (info) return { ...t, portId: info.portId, portName: info.portName, chainOrder: info.chainOrder };
      if (t.portId) return { ...t, portId: undefined, portName: undefined, chainOrder: undefined };
      return t;
    }),
  }));
}

function omitId(t: TileInstance): Omit<TileInstance, 'id'> {
  return {
    profileId: t.profileId,
    name: t.name,
    x: t.x,
    y: t.y,
    tileNumber: t.tileNumber,
    portNumber: t.portNumber,
    chainOrder: t.chainOrder,
    powerPosition: t.powerPosition,
    powerUse: t.powerUse,
    portId: t.portId,
    portName: t.portName,
  };
}

const MAX_HISTORY = 50;
const MAX_FUTURE  = 2;

interface ProjectStore {
  project: Project | null;
  savedCanvases: Project[];
  currentScreen: 'setup' | 'builder';
  selectedTileIds: string[];
  snapToGrid: boolean;
  snapToTile: boolean;
  snapGrid: number;
  clipboardTiles: Omit<TileInstance, 'id'>[];
  _history: Project[];       // undo stack — not persisted
  _future:  Project[];       // redo stack — max 2 entries
  isSaved:  boolean;         // true = no unsaved changes

  // ── Undo / Redo ──
  snapshot:   () => void;    // call before any undoable mutation
  undo:       () => void;
  redo:       () => void;
  markSaved:  () => void;    // call after a successful save

  /** 'select' = normal mode, 'port-routing' = assign tiles to data port, 'circuit-routing' = assign tiles to power circuit */
  appMode: 'select' | 'port-routing' | 'circuit-routing';
  activePortId: string | null;
  activeCircuitId: string | null;
  portDisplay: PortDisplay;

  // ── Navigation ──
  createProject: (name: string, canvasWidth: number, canvasHeight: number, profiles: TileProfile[], processors?: Processor[], bitDepth?: '8bit' | '10bit') => void;
  updateProject: (name: string, canvasWidth: number, canvasHeight: number, newProfiles: TileProfile[], newProcessors: Processor[], bitDepth: '8bit' | '10bit') => void;
  setBitDepth: (bitDepth: '8bit' | '10bit') => void;
  loadProject: (project: Project) => void;
  newProject: () => void;
  goToSetup: () => void;

  // ── Canvas actions ──
  addCanvas: (name: string, canvasWidth: number, canvasHeight: number) => void;
  switchCanvas: (id: string) => void;
  removeCanvas: (id: string) => void;
  renameCanvas: (id: string, name: string) => void;

  // ── Tile profile actions ──
  addTileProfile: (profile: Omit<TileProfile, 'id'>) => void;
  updateTileProfile: (id: string, updates: Partial<TileProfile>) => void;
  removeTileProfile: (id: string) => void;

  // ── Wall actions ──
  addWall: (name: string, wallWidth?: number, wallHeight?: number) => void;
  renameWall: (id: string, name: string) => void;
  removeWall: (id: string) => void;
  setActiveWall: (id: string) => void;

  // ── Tile instance actions ──
  addTile: (profileId: string, x?: number, y?: number) => void;
  addTileBlock: (profileId: string, rows: number, cols: number, startX?: number, startY?: number, hSpacing?: number, vSpacing?: number) => void;
  moveTile: (tileId: string, x: number, y: number) => void;
  updateTile: (tileId: string, updates: Partial<TileInstance>) => void;
  removeTile: (tileId: string) => void;

  // ── Selection ──
  selectTile: (tileId: string | null) => void;
  toggleTileInSelection: (tileId: string) => void;
  clearSelection: () => void;
  selectTileIds: (ids: string[]) => void;

  // ── Routing keyboard navigation ──
  navigateRoutingCursor: (direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') => void;

  // ── Bulk operations ──
  bulkUpdateTiles: (updates: BulkUpdate[]) => void;

  // ── Label visibility ──
  updateLabelVisibility: (updates: Partial<LabelVisibility>) => void;

  // ── Snap settings ──
  setSnapToGrid: (v: boolean) => void;
  setSnapToTile: (v: boolean) => void;
  setSnapGrid: (v: number) => void;

  // ── Lock actions ──
  lockTile: (id: string, locked: boolean) => void;
  lockSelectedTiles: (locked: boolean) => void;

  // ── Rotation actions ──
  rotateTile: (id: string, by: 90 | -90) => void;
  rotateSelectedTiles: (by: 90 | -90) => void;

  // ── Clipboard ──
  copySelectedTiles: () => void;
  pasteTiles: () => void;

  // ── Multi-select operations ──
  deleteSelectedTiles: () => void;
  moveSelectedTiles: (dx: number, dy: number) => void;

  // ── App mode ──
  setAppMode: (mode: 'select' | 'port-routing' | 'circuit-routing') => void;
  setActivePortId: (id: string | null) => void;
  setActiveCircuitId: (id: string | null) => void;
  setPortDisplay: (updates: Partial<PortDisplay>) => void;

  // ── Processor actions ──
  addProcessor: (name: string) => void;
  addProcessorFromLibrary: (model: ProcessorLibraryEntry, xdBoxCount?: number) => void;
  addXDBoxToProcessor: (processorId: string) => void;
  removeXDBoxFromProcessor: (processorId: string, boxIdx: number) => void;
  renameProcessor: (id: string, name: string) => void;
  renameProcessorBox: (processorId: string, boxIdx: number, name: string) => void;
  deleteProcessor: (id: string) => void;

  // ── Processor port actions ──
  addPortToProcessor: (processorId: string) => void;
  removePortFromProcessor: (processorId: string, portId: string) => void;
  assignPortToWall: (portId: string, wallId: string | null) => void;
  batchAssignPortsToWall: (portIds: string[], wallId: string | null) => void;
  renamePort: (portId: string, name: string) => void;
  setPortColor: (portId: string, color: string) => void;
  clearPort: (portId: string) => void;
  reversePortChain: (portId: string) => void;
  assignTileToPort: (tileId: string, portId: string) => void;
  removeTileFromPort: (tileId: string) => void;

  // ── Selection (extended) ──
  selectAllWallTiles: () => void;

  // ── Soca Splay actions ──
  addSocaSplay: () => void;
  renameSoca: (id: string, name: string) => void;
  deleteSoca: (id: string) => void;
  setSocaPowerType: (id: string, powerType: SocaSplay['powerType']) => void;

  // ── Circuit actions ──
  addCircuit: (name: string) => void;
  renameCircuit: (id: string, name: string) => void;
  deleteCircuit: (id: string) => void;
  setCircuitColor: (id: string, color: string) => void;
  assignCircuitToWall: (circuitId: string, wallId: string | null) => void;
  batchAssignCircuitsToWall: (circuitIds: string[], wallId: string | null) => void;
  clearCircuit: (id: string) => void;
  reverseCircuitChain: (id: string) => void;
  assignTileToCircuit: (tileId: string, circuitId: string) => void;
  removeTileFromCircuit: (tileId: string) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      project: null,
      savedCanvases: [],
      currentScreen: 'setup',
      selectedTileIds: [],
      snapToGrid: true,
      snapToTile: true,
      snapGrid: 8,
      clipboardTiles: [],
      _history: [],
      _future:  [],
      isSaved:  true,
      appMode: 'select',
      activePortId: null,
      activeCircuitId: null,
      portDisplay: {
        showPaths: true,
        showArrows: true,
        showMarkers: true,
        showChainNumbers: false,
      },

      // ── Undo / Redo ─────────────────────────────────────
      snapshot: () => {
        const { project, _history } = get();
        if (!project) return;
        // Any new action clears the redo stack and marks project as unsaved
        set({ _history: [..._history.slice(-(MAX_HISTORY - 1)), project], _future: [], isSaved: false });
      },

      markSaved: () => set({ isSaved: true }),

      undo: () => {
        const { project, _history, _future } = get();
        if (_history.length === 0) return;
        const prev = _history[_history.length - 1];
        set({
          project:  prev,
          _history: _history.slice(0, -1),
          _future:  project ? [project, ..._future].slice(0, MAX_FUTURE) : _future,
        });
      },

      redo: () => {
        const { project, _history, _future } = get();
        if (_future.length === 0) return;
        const next = _future[0];
        set({
          project:  next,
          _future:  _future.slice(1),
          _history: project ? [..._history.slice(-(MAX_HISTORY - 1)), project] : _history,
        });
      },

      // ── Navigation ──────────────────────────────────────
      createProject: (name, canvasWidth, canvasHeight, profiles, processors, bitDepth = '8bit') => {
        const wall = makeWall('Wall 1');
        const project: Project = {
          id: genId(), name, canvasWidth, canvasHeight, bitDepth,
          tileProfiles: profiles, walls: [wall], activeWallId: wall.id,
          processors: processors ?? [], circuits: [],
        };
        set({ project, currentScreen: 'builder', selectedTileIds: [], appMode: 'select', activePortId: null, activeCircuitId: null, isSaved: true });
      },

      setBitDepth: (bitDepth) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, bitDepth } });
      },

      loadProject: (project) => set({
        project: migrateProject(project),
        savedCanvases: [],
        currentScreen: 'builder',
        selectedTileIds: [],
        clipboardTiles: [],
        appMode: 'select',
        activePortId: null,
        activeCircuitId: null,
        isSaved: true,
      }),

      newProject: () => set({
        project: null,
        savedCanvases: [],
        currentScreen: 'setup',
        selectedTileIds: [],
        clipboardTiles: [],
        appMode: 'select',
        activePortId: null,
        activeCircuitId: null,
        isSaved: true,
      }),

      goToSetup: () => set({ currentScreen: 'setup', selectedTileIds: [], appMode: 'select', activePortId: null, activeCircuitId: null }),

      updateProject: (name, canvasWidth, canvasHeight, newProfiles, newProcessors, bitDepth) => {
        const { project } = get();
        if (!project) return;
        // Merge profiles: keep existing, append any new ones (by id)
        const existingProfileIds = new Set(project.tileProfiles.map((p) => p.id));
        const addedProfiles = newProfiles.filter((p) => !existingProfileIds.has(p.id));
        // Merge processors: keep existing, append any new ones (by id)
        const existingProcIds = new Set((project.processors ?? []).map((p) => p.id));
        const addedProcessors = newProcessors.filter((p) => !existingProcIds.has(p.id));
        set({
          project: {
            ...project,
            name,
            canvasWidth,
            canvasHeight,
            bitDepth,
            tileProfiles: [...project.tileProfiles, ...addedProfiles],
            processors:   [...(project.processors ?? []), ...addedProcessors],
          },
          currentScreen: 'builder',
          selectedTileIds: [],
          appMode: 'select',
          activePortId: null,
          activeCircuitId: null,
          isSaved: false,
        });
      },

      // ── Canvas actions ───────────────────────────────────
      addCanvas: (name, canvasWidth, canvasHeight) => {
        const { project, savedCanvases } = get();
        const newWall = makeWall('Wall 1');
        const newProject: Project = {
          id: genId(), name, canvasWidth, canvasHeight,
          bitDepth: project?.bitDepth ?? '8bit',
          tileProfiles: project?.tileProfiles ?? [],
          walls: [newWall], activeWallId: newWall.id,
          processors: [], circuits: [],
        };
        // Save current canvas before switching
        const updatedSaved = project
          ? [...savedCanvases.filter((c) => c.id !== project.id), project]
          : savedCanvases;
        set({ project: newProject, savedCanvases: updatedSaved, selectedTileIds: [], appMode: 'select', activePortId: null, activeCircuitId: null, isSaved: false });
      },

      switchCanvas: (id) => {
        const { project, savedCanvases } = get();
        if (project?.id === id) return;
        const target = savedCanvases.find((c) => c.id === id);
        if (!target) return;
        const updatedSaved = project
          ? [...savedCanvases.filter((c) => c.id !== id), project]
          : savedCanvases.filter((c) => c.id !== id);
        set({ project: target, savedCanvases: updatedSaved, selectedTileIds: [], appMode: 'select', activePortId: null, activeCircuitId: null });
      },

      removeCanvas: (id) => {
        const { project, savedCanvases } = get();
        if (project?.id === id) {
          if (savedCanvases.length === 0) return;
          const [next, ...remaining] = savedCanvases;
          set({ project: next, savedCanvases: remaining, selectedTileIds: [], appMode: 'select', activePortId: null, activeCircuitId: null });
        } else {
          set({ savedCanvases: savedCanvases.filter((c) => c.id !== id) });
        }
      },

      renameCanvas: (id, name) => {
        const { project, savedCanvases } = get();
        if (project?.id === id) {
          set({ project: { ...project, name } });
        } else {
          set({ savedCanvases: savedCanvases.map((c) => c.id === id ? { ...c, name } : c) });
        }
      },

      // ── Tile profiles ────────────────────────────────────
      addTileProfile: (profile) => {
        const { project } = get();
        if (!project) return;
        const p: TileProfile = { ...profile, id: genId() };
        set({ project: { ...project, tileProfiles: [...project.tileProfiles, p] } });
      },

      updateTileProfile: (id, updates) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            tileProfiles: project.tileProfiles.map((p) => p.id === id ? { ...p, ...updates } : p),
          },
        });
      },

      removeTileProfile: (id) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, tileProfiles: project.tileProfiles.filter((p) => p.id !== id) } });
      },

      // ── Walls ────────────────────────────────────────────
      addWall: (name, wallWidth, wallHeight) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const wall = makeWall(name, wallWidth, wallHeight);
        set({ project: { ...project, walls: [...project.walls, wall], activeWallId: wall.id } });
      },

      renameWall: (id, name) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            walls: project.walls.map((w) => (w.id === id ? { ...w, name } : w)),
          },
        });
      },

      removeWall: (id) => {
        const { project } = get();
        if (!project || project.walls.length <= 1) return;
        get().snapshot();
        const walls = project.walls.filter((w) => w.id !== id);
        const activeWallId = project.activeWallId === id ? walls[0].id : project.activeWallId;
        // Clear wallId on any ports assigned to this wall
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) =>
            p.wallId === id ? { ...p, wallId: null, tileIds: [] } : p
          ),
        }));
        set({ project: { ...project, walls, activeWallId, processors }, selectedTileIds: [] });
      },

      setActiveWall: (id) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, activeWallId: id }, selectedTileIds: [] });
      },

      // ── Tile instances ───────────────────────────────────
      addTile: (profileId, x = 0, y = 0) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const profile = project.tileProfiles.find((p) => p.id === profileId);
        if (!profile) return;
        const tile: TileInstance = {
          id: genId(), profileId, name: profile.name, x, y, powerUse: profile.defaultPowerUse,
        };
        const walls = project.walls.map((w) =>
          w.id === project.activeWallId ? { ...w, tiles: [...w.tiles, tile] } : w
        );
        set({ project: { ...project, walls }, selectedTileIds: [tile.id] });
      },

      addTileBlock: (profileId, rows, cols, startX = 0, startY = 0, hSpacing = 0, vSpacing = 0) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const profile = project.tileProfiles.find((p) => p.id === profileId);
        if (!profile) return;
        const newTiles: TileInstance[] = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            newTiles.push({
              id: genId(), profileId, name: profile.name,
              x: startX + c * (profile.pixelWidth + hSpacing),
              y: startY + r * (profile.pixelHeight + vSpacing),
              powerUse: profile.defaultPowerUse,
            });
          }
        }
        const walls = project.walls.map((w) =>
          w.id === project.activeWallId ? { ...w, tiles: [...w.tiles, ...newTiles] } : w
        );
        set({ project: { ...project, walls }, selectedTileIds: newTiles.map((t) => t.id) });
      },

      moveTile: (tileId, x, y) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const walls = project.walls.map((w) =>
          w.id === project.activeWallId
            ? { ...w, tiles: w.tiles.map((t) => (t.id === tileId ? { ...t, x, y } : t)) }
            : w
        );
        set({ project: { ...project, walls } });
      },

      updateTile: (tileId, updates) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const walls = project.walls.map((w) => ({
          ...w,
          tiles: w.tiles.map((t) => (t.id === tileId ? { ...t, ...updates } : t)),
        }));
        set({ project: { ...project, walls } });
      },

      removeTile: (tileId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const walls = project.walls.map((w) => ({
          ...w,
          tiles: w.tiles.filter((t) => t.id !== tileId),
        }));
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => ({ ...p, tileIds: p.tileIds.filter((id) => id !== tileId) })),
        }));
        const circuits = (project.circuits ?? []).map((c) => ({ ...c, tileIds: c.tileIds.filter((id) => id !== tileId) }));
        const newProject = { ...project, walls, processors, circuits };
        set({
          project: { ...newProject, walls: syncAllPortTiles(newProject) },
          selectedTileIds: get().selectedTileIds.filter((id) => id !== tileId),
        });
      },

      // ── Selection ────────────────────────────────────────
      selectTile: (tileId) => set({ selectedTileIds: tileId === null ? [] : [tileId] }),
      toggleTileInSelection: (tileId) => {
        const { selectedTileIds } = get();
        set({
          selectedTileIds: selectedTileIds.includes(tileId)
            ? selectedTileIds.filter((id) => id !== tileId)
            : [...selectedTileIds, tileId],
        });
      },
      clearSelection: () => set({ selectedTileIds: [] }),
      selectTileIds: (ids) => set({ selectedTileIds: ids }),
      selectAllWallTiles: () => {
        const { project } = get();
        if (!project) return;
        const activeWall = project.walls.find((w) => w.id === project.activeWallId);
        if (!activeWall) return;
        set({ selectedTileIds: activeWall.tiles.map((t) => t.id) });
      },

      navigateRoutingCursor: (direction) => {
        const { project, appMode, activePortId, activeCircuitId, selectedTileIds } = get();
        if (!project) return;
        if (appMode !== 'port-routing' && appMode !== 'circuit-routing') return;
        if (!selectedTileIds.length) return;

        const activeWall = project.walls.find((w) => w.id === project.activeWallId);
        if (!activeWall) return;

        const cursorTile = activeWall.tiles.find((t) => t.id === selectedTileIds[0]);
        if (!cursorTile) return;

        const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
        const cursorProfile = profileMap.get(cursorTile.profileId);
        if (!cursorProfile) return;

        const next = findAdjacentTile(
          cursorTile, cursorProfile.pixelWidth, cursorProfile.pixelHeight,
          activeWall.tiles, profileMap, direction,
        );
        if (!next) return;

        // Only assign if not already in the chain (avoid accidental toggle-off)
        if (appMode === 'port-routing' && activePortId) {
          const port = (project.processors ?? []).flatMap((p) => p.ports).find((p) => p.id === activePortId);
          if (port && !port.tileIds.includes(next.id)) get().assignTileToPort(next.id, activePortId);
        } else if (appMode === 'circuit-routing' && activeCircuitId) {
          const circuit = (project.circuits ?? []).find((c) => c.id === activeCircuitId);
          if (circuit && !circuit.tileIds.includes(next.id)) get().assignTileToCircuit(next.id, activeCircuitId);
        }

        // Advance cursor
        set({ selectedTileIds: [next.id] });
      },

      // ── Bulk operations ──────────────────────────────────
      bulkUpdateTiles: (updates) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const changeMap = new Map(updates.map((u) => [u.id, u.changes]));
        const walls = project.walls.map((w) => ({
          ...w,
          tiles: w.tiles.map((t) => {
            const changes = changeMap.get(t.id);
            return changes ? { ...t, ...changes } : t;
          }),
        }));
        set({ project: { ...project, walls } });
      },

      updateLabelVisibility: (updates) => {
        const { project } = get();
        if (!project) return;
        const walls = project.walls.map((w) =>
          w.id === project.activeWallId
            ? { ...w, labelVisibility: { ...w.labelVisibility, ...updates } }
            : w
        );
        set({ project: { ...project, walls } });
      },

      // ── Snap ─────────────────────────────────────────────
      setSnapToGrid: (v) => set({ snapToGrid: v }),
      setSnapToTile: (v) => set({ snapToTile: v }),
      setSnapGrid: (v) => set({ snapGrid: v }),

      // ── Lock ─────────────────────────────────────────────
      lockTile: (id, locked) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        set({ project: { ...project, walls: project.walls.map((w) => ({
          ...w, tiles: w.tiles.map((t) => t.id === id ? { ...t, locked } : t),
        })) } });
      },
      lockSelectedTiles: (locked) => {
        const { project, selectedTileIds } = get();
        if (!project || selectedTileIds.length === 0) return;
        const idSet = new Set(selectedTileIds);
        get().snapshot();
        set({ project: { ...project, walls: project.walls.map((w) => ({
          ...w, tiles: w.tiles.map((t) => idSet.has(t.id) ? { ...t, locked } : t),
        })) } });
      },

      // ── Rotation ─────────────────────────────────────────
      rotateTile: (id, by) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const walls = project.walls.map((w) => ({
          ...w,
          tiles: w.tiles.map((t) => {
            if (t.id !== id) return t;
            const profile = project.tileProfiles.find((p) => p.id === t.profileId);
            if (!profile) return t;
            const curRot = t.rotation ?? 0;
            const newRot = (((curRot + by) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
            const curEffW = (curRot === 90 || curRot === 270) ? profile.pixelHeight : profile.pixelWidth;
            const curEffH = (curRot === 90 || curRot === 270) ? profile.pixelWidth : profile.pixelHeight;
            const cx = t.x + curEffW / 2;
            const cy = t.y + curEffH / 2;
            const newEffW = (newRot === 90 || newRot === 270) ? profile.pixelHeight : profile.pixelWidth;
            const newEffH = (newRot === 90 || newRot === 270) ? profile.pixelWidth : profile.pixelHeight;
            const nx = Math.max(0, Math.min(project.canvasWidth - newEffW, Math.round(cx - newEffW / 2)));
            const ny = Math.max(0, Math.min(project.canvasHeight - newEffH, Math.round(cy - newEffH / 2)));
            return { ...t, rotation: newRot, x: nx, y: ny };
          }),
        }));
        set({ project: { ...project, walls } });
      },
      rotateSelectedTiles: (by) => {
        const { project, selectedTileIds } = get();
        if (!project || selectedTileIds.length === 0) return;
        get().snapshot();
        const idSet = new Set(selectedTileIds);
        const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
        const walls = project.walls.map((w) => ({
          ...w,
          tiles: w.tiles.map((t) => {
            if (!idSet.has(t.id)) return t;
            const profile = profileMap.get(t.profileId);
            if (!profile) return t;
            const curRot = t.rotation ?? 0;
            const newRot = (((curRot + by) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
            const curEffW = (curRot === 90 || curRot === 270) ? profile.pixelHeight : profile.pixelWidth;
            const curEffH = (curRot === 90 || curRot === 270) ? profile.pixelWidth : profile.pixelHeight;
            const cx = t.x + curEffW / 2;
            const cy = t.y + curEffH / 2;
            const newEffW = (newRot === 90 || newRot === 270) ? profile.pixelHeight : profile.pixelWidth;
            const newEffH = (newRot === 90 || newRot === 270) ? profile.pixelWidth : profile.pixelHeight;
            const nx = Math.max(0, Math.min(project.canvasWidth - newEffW, Math.round(cx - newEffW / 2)));
            const ny = Math.max(0, Math.min(project.canvasHeight - newEffH, Math.round(cy - newEffH / 2)));
            return { ...t, rotation: newRot, x: nx, y: ny };
          }),
        }));
        set({ project: { ...project, walls } });
      },

      // ── Clipboard ────────────────────────────────────────
      copySelectedTiles: () => {
        const { project, selectedTileIds } = get();
        if (!project || selectedTileIds.length === 0) return;
        const activeWall = project.walls.find((w) => w.id === project.activeWallId);
        if (!activeWall) return;
        const clipboardTiles = activeWall.tiles.filter((t) => selectedTileIds.includes(t.id)).map(omitId);
        set({ clipboardTiles });
      },

      pasteTiles: () => {
        const { project, clipboardTiles } = get();
        if (!project || clipboardTiles.length === 0) return;
        get().snapshot();
        const OFFSET = 20;
        const newTiles: TileInstance[] = clipboardTiles.map((t) => ({
          ...t, id: genId(), x: t.x + OFFSET, y: t.y + OFFSET, portId: undefined,
        }));
        const walls = project.walls.map((w) =>
          w.id === project.activeWallId ? { ...w, tiles: [...w.tiles, ...newTiles] } : w
        );
        set({
          project: { ...project, walls },
          selectedTileIds: newTiles.map((t) => t.id),
          clipboardTiles: newTiles.map(omitId),
        });
      },

      deleteSelectedTiles: () => {
        const { project, selectedTileIds } = get();
        if (!project || selectedTileIds.length === 0) return;
        get().snapshot();
        const idSet = new Set(selectedTileIds);
        const walls = project.walls.map((w) => ({
          ...w,
          tiles: w.tiles.filter((t) => !idSet.has(t.id)),
        }));
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => ({ ...p, tileIds: p.tileIds.filter((id) => !idSet.has(id)) })),
        }));
        const circuits = (project.circuits ?? []).map((c) => ({ ...c, tileIds: c.tileIds.filter((id) => !idSet.has(id)) }));
        const newProject = { ...project, walls, processors, circuits };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) }, selectedTileIds: [] });
      },

      moveSelectedTiles: (dx, dy) => {
        const { project, selectedTileIds } = get();
        if (!project || selectedTileIds.length === 0) return;
        get().snapshot();
        const idSet = new Set(selectedTileIds);
        const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
        const walls = project.walls.map((w) => ({
          ...w,
          tiles: w.tiles.map((t) => {
            if (!idSet.has(t.id)) return t;
            return { ...t, x: t.x + dx, y: t.y + dy };
          }),
        }));
        set({ project: { ...project, walls } });
      },

      // ── App mode ─────────────────────────────────────────
      setAppMode: (mode) => set({ appMode: mode }),
      setActivePortId: (id) => set({ activePortId: id }),
      setActiveCircuitId: (id) => set({ activeCircuitId: id }),
      setPortDisplay: (updates) =>
        set((state) => ({ portDisplay: { ...state.portDisplay, ...updates } })),

      // ── Processor actions ─────────────────────────────────
      addProcessor: (name) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const processor: Processor = { id: genId(), name, ports: [], fromLibrary: false };
        set({ project: { ...project, processors: [...(project.processors ?? []), processor] } });
      },

      addProcessorFromLibrary: (model, xdBoxCount) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();

        let ports: ProcessorPort[];
        let xdBoxSize: number | undefined;
        let resolvedXdBoxCount: number | undefined;

        if (model.xdExpander) {
          // SX40-style: create xdBoxCount × portsPerBox ports
          const boxCount = Math.min(xdBoxCount ?? 1, model.xdExpander.maxBoxes);
          const totalPorts = boxCount * model.xdExpander.portsPerBox;
          xdBoxSize = model.xdExpander.portsPerBox;
          resolvedXdBoxCount = boxCount;
          ports = Array.from({ length: totalPorts }, (_, i) => {
            const boxIdx    = Math.floor(i / model.xdExpander!.portsPerBox);
            const portInBox = i % model.xdExpander!.portsPerBox;
            return {
              id: genId(),
              name: xdPortName(boxIdx, portInBox),
              color: PORT_COLORS[boxIdx % PORT_COLORS.length],
              wallId: null,
              tileIds: [],
              pixelCapacity: model.xdExpander!.portCapacity,
            };
          });
        } else {
          ports = Array.from({ length: model.rj45Ports }, (_, i) => ({
            id: genId(),
            name: PORT_LETTERS[i] ?? `P${i + 1}`,
            color: PORT_COLORS[i % PORT_COLORS.length],
            wallId: null,
            tileIds: [],
            pixelCapacity: model.perPortCapacity,
          }));
        }

        const processor: Processor = {
          id: genId(),
          name: model.name,
          ports,
          fromLibrary: true,
          ...(resolvedXdBoxCount !== undefined && {
            xdBoxCount: resolvedXdBoxCount,
            xdBoxSize,
            xdMaxBoxes: model.xdExpander!.maxBoxes,
            expanderLabel: model.xdExpander!.expanderLabel ?? 'XD Box',
          }),
        };
        set({ project: { ...project, processors: [...(project.processors ?? []), processor] } });
      },

      addXDBoxToProcessor: (processorId) => {
        const { project } = get();
        if (!project) return;
        const proc = (project.processors ?? []).find((p) => p.id === processorId);
        if (!proc?.xdBoxCount || !proc.xdBoxSize) return;
        get().snapshot();
        const maxBoxes = proc.xdMaxBoxes ?? 4;
        if (proc.xdBoxCount >= maxBoxes) return;
        // Derive port capacity from existing ports (avoids hardcoding per-model values)
        const existingPortCap = proc.ports[0]?.pixelCapacity ?? 525000;
        const newBoxIdx = proc.xdBoxCount; // 0-based index of the new box being added
        const newPorts: ProcessorPort[] = [];
        for (let i = 0; i < proc.xdBoxSize; i++) {
          newPorts.push({
            id: genId(),
            name: xdPortName(newBoxIdx, i),
            color: PORT_COLORS[newBoxIdx % PORT_COLORS.length],
            wallId: null,
            tileIds: [],
            pixelCapacity: existingPortCap,
          });
        }
        const newXdBoxCount = proc.xdBoxCount + 1;
        const updatedProcessors = (project.processors ?? []).map((p) =>
          p.id === processorId
            ? { ...p, ports: [...p.ports, ...newPorts], xdBoxCount: newXdBoxCount }
            : p
        );
        set({ project: { ...project, processors: updatedProcessors } });
      },

      removeXDBoxFromProcessor: (processorId, boxIdx) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const processors = (project.processors ?? []).map((proc) => {
          if (proc.id !== processorId) return proc;
          const size  = proc.xdBoxSize!;
          const start = boxIdx * size;
          const newPorts = [...proc.ports.slice(0, start), ...proc.ports.slice(start + size)];
          // Shift custom box names: drop the removed index
          const newBoxNames = proc.boxNames
            ? [...proc.boxNames.slice(0, boxIdx), ...proc.boxNames.slice(boxIdx + 1)]
            : undefined;
          return {
            ...proc,
            ports: newPorts,
            xdBoxCount: proc.xdBoxCount! - 1,
            ...(newBoxNames ? { boxNames: newBoxNames } : {}),
          };
        });
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      renameProcessor: (id, name) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            processors: (project.processors ?? []).map((p) => p.id === id ? { ...p, name } : p),
          },
        });
      },

      renameProcessorBox: (processorId, boxIdx, name) => {
        const { project } = get();
        if (!project) return;
        set({
          project: {
            ...project,
            processors: (project.processors ?? []).map((p) => {
              if (p.id !== processorId) return p;
              const boxNames = [...(p.boxNames ?? [])];
              boxNames[boxIdx] = name;
              return { ...p, boxNames };
            }),
          },
        });
      },

      deleteProcessor: (id) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const processors = (project.processors ?? []).filter((p) => p.id !== id);
        const newProject = { ...project, processors };
        set({
          project: { ...newProject, walls: syncAllPortTiles(newProject) },
          activePortId: null,
          appMode: 'select',
        });
      },

      // ── Processor port actions ────────────────────────────
      addPortToProcessor: (processorId) => {
        const { project } = get();
        if (!project) return;
        const processors = project.processors ?? [];
        const proc = processors.find((p) => p.id === processorId);
        if (!proc) return;
        get().snapshot();
        // Use letters across ALL ports in this processor for naming
        const newPort: ProcessorPort = {
          id: genId(),
          name: nextPortLetter(proc.ports),
          color: PORT_COLORS[proc.ports.length % PORT_COLORS.length],
          wallId: null,
          tileIds: [],
          pixelCapacity: 650000,
        };
        set({
          project: {
            ...project,
            processors: processors.map((p) =>
              p.id === processorId ? { ...p, ports: [...p.ports, newPort] } : p
            ),
          },
          activePortId: newPort.id,
        });
      },

      removePortFromProcessor: (processorId, portId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const processors = (project.processors ?? []).map((p) =>
          p.id === processorId
            ? { ...p, ports: p.ports.filter((port) => port.id !== portId) }
            : p
        );
        const newProject = { ...project, processors };
        const { activePortId } = get();
        set({
          project: { ...newProject, walls: syncAllPortTiles(newProject) },
          activePortId: activePortId === portId ? null : activePortId,
          appMode: activePortId === portId ? 'select' : get().appMode,
        });
      },

      assignPortToWall: (portId, wallId) => {
        const { project } = get();
        if (!project) return;
        // Clear tileIds when reassigning to a different wall
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) =>
            p.id === portId ? { ...p, wallId, tileIds: [] } : p
          ),
        }));
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      renamePort: (portId, name) => {
        const { project } = get();
        if (!project) return;
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => p.id === portId ? { ...p, name } : p),
        }));
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      setPortColor: (portId, color) => {
        const { project } = get();
        if (!project) return;
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => p.id === portId ? { ...p, color } : p),
        }));
        set({ project: { ...project, processors } });
      },

      clearPort: (portId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => p.id === portId ? { ...p, tileIds: [] } : p),
        }));
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      batchAssignPortsToWall: (portIds, wallId) => {
        const { project } = get();
        if (!project) return;
        const idSet = new Set(portIds);
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => idSet.has(p.id) ? { ...p, wallId, tileIds: [] } : p),
        }));
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      reversePortChain: (portId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) =>
            p.id === portId ? { ...p, tileIds: [...p.tileIds].reverse() } : p
          ),
        }));
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      assignTileToPort: (tileId, portId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        // Find the target port's wall assignment and capacity
        let targetWallId: string | null = null;
        let targetPort: ProcessorPort | null = null;
        for (const proc of project.processors ?? []) {
          const found = proc.ports.find((p) => p.id === portId);
          if (found) { targetPort = found; targetWallId = found.wallId; break; }
        }

        // Capacity check: only when adding (not removing) a tile
        if (targetPort?.pixelCapacity && !targetPort.tileIds.includes(tileId)) {
          const wall = project.walls.find((w) => w.id === targetWallId);
          const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
          const usedPixels = targetPort.tileIds.reduce((sum, tid) => {
            const tile = wall?.tiles.find((t) => t.id === tid);
            const profile = tile ? profileMap.get(tile.profileId) : null;
            return sum + (profile ? profile.pixelWidth * profile.pixelHeight : 0);
          }, 0);
          const newTile = wall?.tiles.find((t) => t.id === tileId);
          const newProfile = newTile ? profileMap.get(newTile.profileId) : null;
          const newPixels = newProfile ? newProfile.pixelWidth * newProfile.pixelHeight : 0;
          if (usedPixels + newPixels > targetPort.pixelCapacity) return; // over capacity — block
        }
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => {
            if (p.id === portId) {
              const already = p.tileIds.includes(tileId);
              return { ...p, tileIds: already ? p.tileIds.filter((id) => id !== tileId) : [...p.tileIds, tileId] };
            }
            // Remove this tile from any other port on the same wall
            if (targetWallId && p.wallId === targetWallId) {
              return { ...p, tileIds: p.tileIds.filter((id) => id !== tileId) };
            }
            return p;
          }),
        }));
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      removeTileFromPort: (tileId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const processors = (project.processors ?? []).map((proc) => ({
          ...proc,
          ports: proc.ports.map((p) => ({ ...p, tileIds: p.tileIds.filter((id) => id !== tileId) })),
        }));
        const newProject = { ...project, processors };
        set({ project: { ...newProject, walls: syncAllPortTiles(newProject) } });
      },

      // ── Soca Splay actions ───────────────────────────────
      addSocaSplay: () => {
        const { project } = get();
        if (!project) return;
        const socas = project.socas ?? [];
        const circuits = project.circuits ?? [];
        const socaLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const usedNames = new Set(socas.map((s) => s.name));
        let socaName = 'Soca A';
        for (const ch of socaLetters) {
          const candidate = `Soca ${ch}`;
          if (!usedNames.has(candidate)) { socaName = candidate; break; }
        }
        const soca: SocaSplay = { id: genId(), name: socaName };
        const newCircuits: Circuit[] = [1, 2, 3, 4, 5, 6].map((n, i) => ({
          id: genId(),
          name: `${socaName} - ${n}`,
          color: PORT_COLORS[(circuits.length + i) % PORT_COLORS.length],
          wallId: null,
          tileIds: [],
          socaId: soca.id,
        }));
        set({
          project: { ...project, socas: [...socas, soca], circuits: [...circuits, ...newCircuits] },
          activeCircuitId: null,
        });
      },

      renameSoca: (id, name) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, socas: (project.socas ?? []).map((s) => s.id === id ? { ...s, name } : s) } });
      },

      setSocaPowerType: (id, powerType) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, socas: (project.socas ?? []).map((s) => s.id === id ? { ...s, powerType } : s) } });
      },

      deleteSoca: (id) => {
        const { project } = get();
        if (!project) return;
        const { activeCircuitId, appMode } = get();
        const removedIds = new Set((project.circuits ?? []).filter((c) => c.socaId === id).map((c) => c.id));
        set({
          project: {
            ...project,
            socas: (project.socas ?? []).filter((s) => s.id !== id),
            circuits: (project.circuits ?? []).filter((c) => c.socaId !== id),
          },
          activeCircuitId: removedIds.has(activeCircuitId ?? '') ? null : activeCircuitId,
          appMode: removedIds.has(activeCircuitId ?? '') ? 'select' : appMode,
        });
      },

      // ── Circuit actions ───────────────────────────────────
      addCircuit: (name) => {
        const { project } = get();
        if (!project) return;
        const circuits = project.circuits ?? [];
        const circuit: Circuit = {
          id: genId(),
          name,
          color: PORT_COLORS[circuits.length % PORT_COLORS.length],
          wallId: null,
          tileIds: [],
        };
        set({ project: { ...project, circuits: [...circuits, circuit] }, activeCircuitId: circuit.id });
      },

      renameCircuit: (id, name) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, circuits: (project.circuits ?? []).map((c) => c.id === id ? { ...c, name } : c) } });
      },

      deleteCircuit: (id) => {
        const { project } = get();
        if (!project) return;
        set({
          project: { ...project, circuits: (project.circuits ?? []).filter((c) => c.id !== id) },
          activeCircuitId: get().activeCircuitId === id ? null : get().activeCircuitId,
          appMode: get().activeCircuitId === id ? 'select' : get().appMode,
        });
      },

      setCircuitColor: (id, color) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, circuits: (project.circuits ?? []).map((c) => c.id === id ? { ...c, color } : c) } });
      },

      assignCircuitToWall: (circuitId, wallId) => {
        const { project } = get();
        if (!project) return;
        set({ project: { ...project, circuits: (project.circuits ?? []).map((c) => c.id === circuitId ? { ...c, wallId, tileIds: [] } : c) } });
      },

      batchAssignCircuitsToWall: (circuitIds, wallId) => {
        const { project } = get();
        if (!project) return;
        const idSet = new Set(circuitIds);
        set({ project: { ...project, circuits: (project.circuits ?? []).map((c) => idSet.has(c.id) ? { ...c, wallId, tileIds: [] } : c) } });
      },

      clearCircuit: (id) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        set({ project: { ...project, circuits: (project.circuits ?? []).map((c) => c.id === id ? { ...c, tileIds: [] } : c) } });
      },

      reverseCircuitChain: (id) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        set({ project: { ...project, circuits: (project.circuits ?? []).map((c) => c.id === id ? { ...c, tileIds: [...c.tileIds].reverse() } : c) } });
      },

      assignTileToCircuit: (tileId, circuitId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        const targetWallId = (project.circuits ?? []).find((c) => c.id === circuitId)?.wallId ?? null;
        set({
          project: {
            ...project,
            circuits: (project.circuits ?? []).map((c) => {
              if (c.id === circuitId) {
                const already = c.tileIds.includes(tileId);
                return { ...c, tileIds: already ? c.tileIds.filter((id) => id !== tileId) : [...c.tileIds, tileId] };
              }
              // Remove from other circuits on the same wall
              if (targetWallId && c.wallId === targetWallId) {
                return { ...c, tileIds: c.tileIds.filter((id) => id !== tileId) };
              }
              return c;
            }),
          },
        });
      },

      removeTileFromCircuit: (tileId) => {
        const { project } = get();
        if (!project) return;
        get().snapshot();
        set({ project: { ...project, circuits: (project.circuits ?? []).map((c) => ({ ...c, tileIds: c.tileIds.filter((id) => id !== tileId) })) } });
      },
    }),
    {
      name: 'led-pixel-mapper-prefs-v1',
      partialize: (state) => ({
        snapToGrid: state.snapToGrid,
        snapToTile: state.snapToTile,
        snapGrid: state.snapGrid,
        portDisplay: state.portDisplay,
      }),
    }
  )
);

/**
 * Migrate old projects that stored ports on Wall objects.
 * Wraps all wall ports into a "Migrated" processor.
 */
function migrateProject(project: Project): Project {
  const migrated = { ...project, processors: project.processors ?? [], circuits: project.circuits ?? [], bitDepth: project.bitDepth ?? '8bit' } as Project;

  // Collect any old-style wall ports
  const oldPorts: ProcessorPort[] = [];
  for (const wall of migrated.walls) {
    if (wall.ports && wall.ports.length > 0) {
      for (const p of wall.ports) {
        oldPorts.push({ ...p, wallId: wall.id });
      }
    }
  }

  if (oldPorts.length > 0 && migrated.processors.length === 0) {
    const migratedProcessor: Processor = {
      id: genId(),
      name: 'Controller 1',
      ports: oldPorts,
    };
    migrated.processors = [migratedProcessor];
  }

  // Strip ports from walls
  migrated.walls = migrated.walls.map((w) => {
    const { ports: _p, ...rest } = w as Wall & { ports?: unknown };
    return rest as Wall;
  });

  return migrated;
}
