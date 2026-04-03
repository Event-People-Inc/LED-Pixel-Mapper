import {
  forwardRef,
  memo,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useImperativeHandle,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Group, Rect, Text, Line, Arrow, Circle } from 'react-konva';
import Konva from 'konva';
import { useProjectStore } from '../store/useProjectStore';
import { LabelVisibility, TileInstance, TileProfile, TILE_COLORS } from '../types';
import { WALL_EXPORT_COLORS } from '../utils/exportRenderers';
import { evalMathExpr } from '../utils/mathInput';

export interface WallCanvasHandle {
  // Reserved for future imperative APIs
  _unused?: never;
}

/* ── Label builder ─────────────────────────────────────── */
function buildLabels(tile: TileInstance, profile: TileProfile, vis: LabelVisibility, circuitName?: string): string[] {
  const lines: string[] = [];
  if (vis.showTileName !== false) lines.push(tile.name || profile.name);
  if (vis.showPortLabel && tile.portName && tile.chainOrder !== undefined) {
    lines.push(`▸${tile.portName}${tile.chainOrder}`);
  }
  if (vis.showCircuitLabel && circuitName) lines.push(`⚡ ${circuitName}`);
  if (vis.showTileNumber && tile.tileNumber !== undefined) lines.push(`⊞${tile.tileNumber}`);
  if (!tile.portName) {
    if (vis.showPortNumber && tile.portNumber !== undefined) lines.push(`Port ${tile.portNumber}`);
    if (vis.showChainOrder && tile.chainOrder !== undefined) lines.push(`Chain ${tile.chainOrder}`);
  }
  if (vis.showPowerPosition && tile.powerPosition)              lines.push(`PSU: ${tile.powerPosition}`);
  if (vis.showPowerUse      && tile.powerUse     !== undefined) lines.push(`${tile.powerUse}W`);
  if (vis.showTileResolution)                                    lines.push(`${profile.pixelWidth}×${profile.pixelHeight}`);
  return lines;
}

function snapValue(v: number, grid: number) { return Math.round(v / grid) * grid; }

/* ── Individual tile node ──────────────────────────────── */
interface TileNodeProps {
  tile: TileInstance;
  tileId: string;
  profile: TileProfile;
  isSelected: boolean;
  isInMultiSelect: boolean;
  colorHex: string;
  labelVisibility: LabelVisibility;
  scale: number;
  snapToGrid: boolean;
  snapToTile: boolean;
  snapGrid: number;
  portHighlight: 'active' | 'other' | null;
  portColor: string | null;
  circuitName?: string;
  /** snap target edges (inactive walls + same-wall non-selected tiles) */
  allSnapXs: number[];
  allSnapYs: number[];
  hideLock: boolean;
}

function areTilePropsEqual(prev: TileNodeProps, next: TileNodeProps): boolean {
  // Deep comparison of tile data fields
  const pt = prev.tile;
  const nt = next.tile;
  if (
    pt.x !== nt.x ||
    pt.y !== nt.y ||
    pt.name !== nt.name ||
    pt.portName !== nt.portName ||
    pt.chainOrder !== nt.chainOrder ||
    pt.tileNumber !== nt.tileNumber ||
    pt.portNumber !== nt.portNumber ||
    pt.powerUse !== nt.powerUse ||
    pt.powerPosition !== nt.powerPosition ||
    pt.locked !== nt.locked ||
    pt.rotation !== nt.rotation
  ) return false;

  // Shallow comparison of all other props
  if (prev.tileId !== next.tileId) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isInMultiSelect !== next.isInMultiSelect) return false;
  if (prev.colorHex !== next.colorHex) return false;
  if (prev.scale !== next.scale) return false;
  if (prev.snapToGrid !== next.snapToGrid) return false;
  if (prev.snapToTile !== next.snapToTile) return false;
  if (prev.snapGrid !== next.snapGrid) return false;
  if (prev.portHighlight !== next.portHighlight) return false;
  if (prev.portColor !== next.portColor) return false;
  if (prev.circuitName !== next.circuitName) return false;
  if (prev.profile !== next.profile) return false;
  if (prev.labelVisibility !== next.labelVisibility) return false;
  // Reference equality for arrays — stable refs from useMemo in parent
  if (prev.allSnapXs !== next.allSnapXs) return false;
  if (prev.allSnapYs !== next.allSnapYs) return false;
  if (prev.hideLock !== next.hideLock) return false;

  return true;
}

const TileNode = memo(function TileNode({
  tile, tileId, profile, isSelected, isInMultiSelect, colorHex, labelVisibility,
  scale, snapToGrid, snapToTile, snapGrid,
  portHighlight, portColor, circuitName,
  allSnapXs, allSnapYs, hideLock,
}: TileNodeProps) {
  // ── Effective dimensions (swap W/H when rotated 90° or 270°) ──────────
  const rot  = tile.rotation ?? 0;
  const effW = (rot === 90 || rot === 270) ? profile.pixelHeight : profile.pixelWidth;
  const effH = (rot === 90 || rot === 270) ? profile.pixelWidth  : profile.pixelHeight;

  // ── Tiny tile fast path ────────────────────────────────────────────────
  const isTiny = Math.min(effW, effH) * scale < 22;

  const fontSize = Math.max(7, Math.round(11 / scale));
  const pad      = Math.max(3, Math.round(5 / scale));
  const cr       = Math.max(1, Math.round(3 / scale));

  const labels = useMemo(
    () => buildLabels(tile, profile, labelVisibility, circuitName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tile.name, tile.portName, tile.chainOrder, tile.tileNumber,
      tile.portNumber, tile.powerUse, tile.powerPosition,
      profile, labelVisibility, circuitName,
    ]
  );

  // ── Adaptive label layout ──────────────────────────────────────────────
  const availH   = profile.pixelHeight - pad * 2;
  const availW   = profile.pixelWidth  - pad * 2;
  const minFs    = Math.max(6, fontSize - 5);

  let dispFs  = fontSize;
  let lineH   = dispFs * 1.6;
  let col1    = labels;
  let col2: string[] = [];
  let colW    = availW;

  if (!isTiny && labels.length > 0 && labels.length * lineH > availH) {
    // Step 1: shrink font until single column fits
    let shrunk = false;
    for (let fs = fontSize - 1; fs >= minFs; fs--) {
      const lh = fs * 1.6;
      if (labels.length * lh <= availH) {
        dispFs = fs; lineH = lh; shrunk = true; break;
      }
    }
    // Step 2: if still doesn't fit, try two columns
    if (!shrunk || labels.length * lineH > availH) {
      const half   = Math.ceil(labels.length / 2);
      const halfCW = (availW - pad) / 2;
      // Restore font and split into two columns
      dispFs = fontSize; lineH = dispFs * 1.6;
      // Shrink font again for two-column fit
      for (let fs = fontSize; fs >= minFs; fs--) {
        const lh = fs * 1.6;
        if (half * lh <= availH && halfCW >= fs * 2) {
          dispFs = fs; lineH = lh; break;
        }
      }
      col1 = labels.slice(0, half);
      col2 = labels.slice(half);
      colW = halfCW;
    }
  }

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    dragStartRef.current = { x: e.target.x(), y: e.target.y() };
  }, []);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const { project, moveTile, moveSelectedTiles, selectedTileIds } = useProjectStore.getState();
      const node = e.target;
      // node.x()/y() are the center position (Group positioned at center with offset)
      let cx = Math.round(node.x());
      let cy = Math.round(node.y());

      // Convert center → AABB top-left
      let nx = cx - effW / 2;
      let ny = cy - effH / 2;

      // Grid snap (on AABB top-left)
      if (snapToGrid && snapGrid > 0) {
        nx = snapValue(nx, snapGrid);
        ny = snapValue(ny, snapGrid);
      }

      // Snap to tile edges (AABB edges)
      if (snapToTile) {
        const snapTol = Math.max(snapToGrid ? snapGrid * 2 : 10, 10);
        if (allSnapXs.length > 0) {
          let bestDist = snapTol, bestX = nx;
          for (const tx of allSnapXs) {
            const dl = Math.abs(tx - nx);
            const dr = Math.abs(tx - (nx + effW));
            if (dl < bestDist) { bestDist = dl; bestX = tx; }
            if (dr < bestDist) { bestDist = dr; bestX = tx - effW; }
          }
          nx = bestX;
        }
        if (allSnapYs.length > 0) {
          let bestDist = snapTol, bestY = ny;
          for (const ty of allSnapYs) {
            const dt = Math.abs(ty - ny);
            const db = Math.abs(ty - (ny + effH));
            if (dt < bestDist) { bestDist = dt; bestY = ty; }
            if (db < bestDist) { bestDist = db; bestY = ty - effH; }
          }
          ny = bestY;
        }
      }

      // Convert back to center for Konva node position
      cx = nx + effW / 2;
      cy = ny + effH / 2;
      node.position({ x: cx, y: cy });

      const isGroup = isInMultiSelect && dragStartRef.current;
      if (isGroup) {
        // dragStartRef holds center position; delta = center_new - center_start = AABB delta
        const dx = cx - dragStartRef.current!.x;
        const dy = cy - dragStartRef.current!.y;
        moveSelectedTiles(dx, dy);
      } else {
        moveTile(tileId, nx, ny);
      }
      void selectedTileIds; // referenced to satisfy linter; actual value read from store above
    },
    [tileId, isInMultiSelect, effW, effH, snapToGrid, snapToTile, snapGrid, allSnapXs, allSnapYs],
  );

  const handleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const { appMode, activePortId, activeCircuitId, selectTile, toggleTileInSelection, assignTileToPort, assignTileToCircuit } = useProjectStore.getState();
    if (appMode === 'port-routing' && activePortId) {
      assignTileToPort(tileId, activePortId);
      selectTile(tileId); // set keyboard navigation cursor
    } else if (appMode === 'circuit-routing' && activeCircuitId) {
      assignTileToCircuit(tileId, activeCircuitId);
      selectTile(tileId); // set keyboard navigation cursor
    } else {
      if (e.evt.ctrlKey || e.evt.metaKey) toggleTileInSelection(tileId);
      else selectTile(tileId);
    }
  }, [tileId]);

  const handleTap = useCallback((e: Konva.KonvaEventObject<Event>) => {
    e.cancelBubble = true;
    const { appMode, activePortId, activeCircuitId, selectTile, assignTileToPort, assignTileToCircuit } = useProjectStore.getState();
    if (appMode === 'port-routing' && activePortId) {
      assignTileToPort(tileId, activePortId);
      selectTile(tileId);
    } else if (appMode === 'circuit-routing' && activeCircuitId) {
      assignTileToCircuit(tileId, activeCircuitId);
      selectTile(tileId);
    } else {
      selectTile(tileId);
    }
  }, [tileId]);

  const ringColor = portHighlight === 'active'
    ? portColor ?? '#ef4444'
    : portHighlight === 'other'
      ? 'rgba(255,255,255,0.25)'
      : isSelected
        ? '#f59e0b'
        : null;

  const isLocked = !!tile.locked;

  // ── Tiny tile fast path — single rect, no text ─────────────────────────
  if (isTiny) {
    return (
      <Group
        x={tile.x + effW / 2} y={tile.y + effH / 2}
        offsetX={profile.pixelWidth / 2} offsetY={profile.pixelHeight / 2}
        rotation={rot}
        draggable={!isLocked}
        onClick={handleClick}
        onTap={handleTap}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Rect
          width={profile.pixelWidth}
          height={profile.pixelHeight}
          fill={colorHex}
          stroke={isLocked ? 'rgba(251,191,36,0.7)' : ringColor ?? 'rgba(255,255,255,0.12)'}
          strokeWidth={ringColor || isLocked ? 1.5 / scale : Math.max(0.5, 0.8 / scale)}
          cornerRadius={cr}
          opacity={portHighlight === 'other' ? 0.55 : 1}
          perfectDrawEnabled={false}
          shadowEnabled={false}
        />
      </Group>
    );
  }

  return (
    <Group
      x={tile.x + effW / 2} y={tile.y + effH / 2}
      offsetX={profile.pixelWidth / 2} offsetY={profile.pixelHeight / 2}
      rotation={rot}
      draggable={!isLocked}
      onClick={handleClick}
      onTap={handleTap}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {ringColor && (
        <Rect
          x={-3 / scale}       y={-3 / scale}
          width={profile.pixelWidth  + 6 / scale}
          height={profile.pixelHeight + 6 / scale}
          fill="transparent"
          stroke={ringColor}
          strokeWidth={portHighlight ? 3 / scale : 3.5 / scale}
          cornerRadius={cr + Math.round(2 / scale)}
          listening={false}
          perfectDrawEnabled={false}
          shadowEnabled={false}
        />
      )}

      <Rect
        width={profile.pixelWidth}
        height={profile.pixelHeight}
        fill={colorHex}
        stroke={ringColor ?? 'rgba(255,255,255,0.12)'}
        strokeWidth={ringColor ? 1.5 / scale : Math.max(0.5, 0.8 / scale)}
        cornerRadius={cr}
        opacity={portHighlight === 'other' ? 0.55 : 1}
        perfectDrawEnabled={false}
        shadowEnabled={false}
      />

      {(portHighlight === 'active' || isSelected) && (
        <Rect
          width={profile.pixelWidth}
          height={profile.pixelHeight}
          fill={portHighlight === 'active' ? `${portColor ?? '#ef4444'}22` : 'rgba(245,158,11,0.1)'}
          cornerRadius={cr}
          listening={false}
          perfectDrawEnabled={false}
          shadowEnabled={false}
        />
      )}

      <Group
        clipX={0}
        clipY={0}
        clipWidth={profile.pixelWidth}
        clipHeight={profile.pixelHeight}
        listening={false}
      >
        {/* Column 1 */}
        {col1.map((line, i) => (
          <Text
            key={`c1-${i}`}
            x={pad} y={pad + i * lineH}
            text={line}
            fontSize={dispFs}
            fontFamily="-apple-system,'Segoe UI',monospace"
            fill={i === 0 ? '#ffffff' : 'rgba(255,255,255,0.65)'}
            fontStyle={i === 0 ? 'bold' : 'normal'}
            width={colW}
            height={lineH}
            wrap="none"
            listening={false}
            ellipsis
            opacity={portHighlight === 'other' ? 0.5 : 1}
          />
        ))}
        {/* Column 2 (only when two-column layout) */}
        {col2.map((line, i) => (
          <Text
            key={`c2-${i}`}
            x={pad + colW + pad} y={pad + i * lineH}
            text={line}
            fontSize={dispFs}
            fontFamily="-apple-system,'Segoe UI',monospace"
            fill="rgba(255,255,255,0.65)"
            width={colW}
            height={lineH}
            wrap="none"
            listening={false}
            ellipsis
            opacity={portHighlight === 'other' ? 0.5 : 1}
          />
        ))}
      </Group>

      {/* Lock badge — top-right corner, hidden in routing modes */}
      {isLocked && !hideLock && (
        <Group x={profile.pixelWidth - (14 / scale)} y={2 / scale} listening={false}>
          <Rect
            width={12 / scale} height={12 / scale}
            fill="rgba(251,191,36,0.88)"
            cornerRadius={2 / scale}
          />
          <Text
            text="🔒"
            fontSize={8 / scale}
            width={12 / scale}
            height={12 / scale}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}, areTilePropsEqual);

/* ── Port routing overlay ──────────────────────────────── */
interface PortOverlayProps {
  activeWall: { tiles: TileInstance[] };
  ports: { id: string; name: string; color: string; tileIds: string[] }[];
  profileMap: Map<string, TileProfile>;
  activePortId: string | null;
  portDisplay: { showPaths: boolean; showArrows: boolean; showMarkers: boolean; showChainNumbers: boolean };
  scale: number;
}

function PortOverlay({ activeWall, ports, profileMap, activePortId, portDisplay, scale }: PortOverlayProps) {
  const tileMap = new Map(activeWall.tiles.map((t) => [t.id, t]));

  return (
    <>
      {ports.map((port) => {
        if (port.tileIds.length === 0) return null;
        const isActive = port.id === activePortId;
        const opacity  = isActive ? 1 : 0.45;
        const sw       = (isActive ? 2.5 : 1.5) / scale;

        const entries: { cx: number; cy: number; tile: TileInstance; profile: TileProfile; idx: number }[] = [];
        port.tileIds.forEach((tid, idx) => {
          const tile    = tileMap.get(tid);
          if (!tile) return;
          const profile = profileMap.get(tile.profileId);
          if (!profile) return;
          const tRot = tile.rotation ?? 0;
          const tEffW = (tRot === 90 || tRot === 270) ? profile.pixelHeight : profile.pixelWidth;
          const tEffH = (tRot === 90 || tRot === 270) ? profile.pixelWidth  : profile.pixelHeight;
          entries.push({
            cx: tile.x + tEffW / 2,
            cy: tile.y + tEffH / 2,
            tile, profile, idx,
          });
        });
        if (entries.length === 0) return null;

        const chainLabel = (i: number) => `${port.name}${i + 1}`;

        return (
          <Group key={port.id} listening={false} opacity={opacity}>
            {portDisplay.showPaths && entries.length > 1 && (
              portDisplay.showArrows
                ? entries.slice(0, -1).map((e, i) => (
                    <Arrow
                      key={`arr-${i}`}
                      points={[e.cx, e.cy, entries[i + 1].cx, entries[i + 1].cy]}
                      stroke={port.color}
                      strokeWidth={sw}
                      fill={port.color}
                      pointerLength={Math.max(4, 9 / scale)}
                      pointerWidth={Math.max(3, 6 / scale)}
                      dash={[10 / scale, 4 / scale]}
                    />
                  ))
                : (
                  <Line
                    points={entries.flatMap((e) => [e.cx, e.cy])}
                    stroke={port.color}
                    strokeWidth={sw}
                    dash={[10 / scale, 4 / scale]}
                  />
                )
            )}

            {portDisplay.showChainNumbers && entries.map((e) => {
              const label = chainLabel(e.idx);
              const r     = Math.max(8, 11) / scale;
              const fs    = Math.max(6, 8) / scale;
              return (
                <Group key={`badge-${e.idx}`} x={e.cx} y={e.cy}>
                  <Circle radius={r} fill={port.color} shadowColor={port.color} shadowBlur={6} shadowOpacity={0.6} />
                  <Text
                    text={label}
                    fontSize={fs}
                    fontStyle="bold"
                    fontFamily="monospace"
                    fill="#fff"
                    width={r * 2}
                    align="center"
                    offsetX={r}
                    offsetY={fs * 0.6}
                    listening={false}
                  />
                </Group>
              );
            })}

            {portDisplay.showMarkers && entries.length > 0 && (() => {
              const { tile: firstTile, profile: firstProfile } = entries[0];
              const badgeW = Math.min(Math.max(16, 18) / scale, firstProfile.pixelWidth * 0.4);
              const badgeH = Math.max(10, 13) / scale;
              return (
                <Group key="start-marker" x={firstTile.x} y={firstTile.y - badgeH - 1 / scale}>
                  <Rect
                    width={badgeW} height={badgeH}
                    fill={port.color}
                    cornerRadius={2 / scale}
                    shadowColor={port.color} shadowBlur={8} shadowOpacity={0.7}
                  />
                  <Text
                    text={`${port.name}▶`}
                    fontSize={Math.max(6, 7) / scale}
                    fontStyle="bold"
                    fontFamily="monospace"
                    fill="#fff"
                    width={badgeW}
                    align="center"
                    offsetY={-Math.max(6, 7) / scale * 0.15}
                    listening={false}
                  />
                </Group>
              );
            })()}

            {portDisplay.showMarkers && entries.length > 1 && (() => {
              const { tile: lastTile, profile: lastProfile, idx: lastIdx } = entries[entries.length - 1];
              const lastLabel = chainLabel(lastIdx);
              const lastRot = lastTile.rotation ?? 0;
              const lastEffW = (lastRot === 90 || lastRot === 270) ? lastProfile.pixelHeight : lastProfile.pixelWidth;
              const badgeW = Math.min(Math.max(16, (lastLabel.length * 5 + 6)) / scale, lastEffW * 0.5);
              const badgeH = Math.max(10, 13) / scale;
              return (
                <Group
                  key="end-marker"
                  x={lastTile.x + lastEffW - badgeW}
                  y={lastTile.y - badgeH - 1 / scale}
                >
                  <Rect
                    width={badgeW} height={badgeH}
                    fill="rgba(8,12,16,0.85)"
                    stroke={port.color}
                    strokeWidth={1 / scale}
                    cornerRadius={2 / scale}
                  />
                  <Text
                    text={lastLabel}
                    fontSize={Math.max(6, 7) / scale}
                    fontStyle="bold"
                    fontFamily="monospace"
                    fill={port.color}
                    width={badgeW}
                    align="center"
                    offsetY={-Math.max(6, 7) / scale * 0.15}
                    listening={false}
                  />
                </Group>
              );
            })()}
          </Group>
        );
      })}
    </>
  );
}

/* ── Circuit routing overlay ───────────────────────────── */
interface CircuitOverlayProps {
  activeWall: { tiles: TileInstance[] };
  circuits: { id: string; name: string; color: string; tileIds: string[] }[];
  profileMap: Map<string, TileProfile>;
  activeCircuitId: string | null;
  scale: number;
}

function CircuitOverlay({ activeWall, circuits, profileMap, activeCircuitId, scale }: CircuitOverlayProps) {
  const tileMap = new Map(activeWall.tiles.map((t) => [t.id, t]));

  return (
    <>
      {circuits.map((circuit) => {
        if (circuit.tileIds.length === 0) return null;
        const isActive = circuit.id === activeCircuitId;
        const opacity  = isActive ? 1 : 0.5;
        const sw       = (isActive ? 3 : 1.8) / scale;

        const entries: { cx: number; cy: number; tile: TileInstance; profile: TileProfile; idx: number }[] = [];
        circuit.tileIds.forEach((tid, idx) => {
          const tile = tileMap.get(tid);
          if (!tile) return;
          const profile = profileMap.get(tile.profileId);
          if (!profile) return;
          const tRot = tile.rotation ?? 0;
          const tEffW = (tRot === 90 || tRot === 270) ? profile.pixelHeight : profile.pixelWidth;
          const tEffH = (tRot === 90 || tRot === 270) ? profile.pixelWidth  : profile.pixelHeight;
          entries.push({
            cx: tile.x + tEffW / 2,
            cy: tile.y + tEffH / 2,
            tile, profile, idx,
          });
        });
        if (entries.length === 0) return null;

        return (
          <Group key={circuit.id} listening={false} opacity={opacity}>

            {/* Glow pass — wider, low opacity */}
            {entries.length > 1 && entries.slice(0, -1).map((e, i) => (
              <Arrow
                key={`glow-${i}`}
                points={[e.cx, e.cy, entries[i + 1].cx, entries[i + 1].cy]}
                stroke={circuit.color}
                strokeWidth={sw * 2.4}
                fill={circuit.color}
                pointerLength={Math.max(6, 12 / scale)}
                pointerWidth={Math.max(5, 9 / scale)}
                opacity={0.18}
              />
            ))}

            {/* Main solid arrows */}
            {entries.length > 1 && entries.slice(0, -1).map((e, i) => (
              <Arrow
                key={`arr-${i}`}
                points={[e.cx, e.cy, entries[i + 1].cx, entries[i + 1].cy]}
                stroke={circuit.color}
                strokeWidth={sw}
                fill={circuit.color}
                pointerLength={Math.max(5, 10 / scale)}
                pointerWidth={Math.max(4, 7 / scale)}
              />
            ))}

            {/* Step number badge at each tile center */}
            {entries.map((e) => {
              const r  = Math.max(8, 10) / scale;
              const fs = Math.max(5, 7)  / scale;
              return (
                <Group key={`badge-${e.idx}`} x={e.cx} y={e.cy}>
                  <Circle radius={r} fill={circuit.color} perfectDrawEnabled={false} shadowEnabled={false} />
                  <Text
                    text={String(e.idx + 1)}
                    fontSize={fs}
                    fontStyle="bold"
                    fontFamily="monospace"
                    fill="#fff"
                    width={r * 2}
                    align="center"
                    offsetX={r}
                    offsetY={fs * 0.6}
                    listening={false}
                  />
                </Group>
              );
            })}

            {/* Start marker — circuit name above first tile */}
            {entries.length > 0 && (() => {
              const { tile: ft, profile: fp } = entries[0];
              const badgeW = Math.min(Math.max(18, (circuit.name.length * 5 + 16)) / scale, fp.pixelWidth * 0.9);
              const badgeH = Math.max(11, 14) / scale;
              return (
                <Group key="start-marker" x={ft.x} y={ft.y - badgeH - 2 / scale}>
                  <Rect
                    width={badgeW} height={badgeH}
                    fill={circuit.color}
                    cornerRadius={2 / scale}
                    perfectDrawEnabled={false}
                    shadowEnabled={false}
                  />
                  <Text
                    text={`⚡ ${circuit.name}`}
                    fontSize={Math.max(6, 7) / scale}
                    fontStyle="bold"
                    fontFamily="sans-serif"
                    fill="#fff"
                    width={badgeW}
                    align="center"
                    offsetY={-Math.max(6, 7) / scale * 0.15}
                    listening={false}
                  />
                </Group>
              );
            })()}

            {/* End marker — tile count on last tile */}
            {entries.length > 1 && (() => {
              const { tile: lt, profile: lp } = entries[entries.length - 1];
              const label  = `${entries.length}`;
              const ltRot  = lt.rotation ?? 0;
              const ltEffW = (ltRot === 90 || ltRot === 270) ? lp.pixelHeight : lp.pixelWidth;
              const badgeW = Math.min(Math.max(16, 14) / scale, ltEffW * 0.4);
              const badgeH = Math.max(10, 13) / scale;
              return (
                <Group key="end-marker" x={lt.x + ltEffW - badgeW} y={lt.y - badgeH - 2 / scale}>
                  <Rect
                    width={badgeW} height={badgeH}
                    fill="rgba(8,12,16,0.85)"
                    stroke={circuit.color}
                    strokeWidth={1 / scale}
                    cornerRadius={2 / scale}
                  />
                  <Text
                    text={label}
                    fontSize={Math.max(6, 7) / scale}
                    fontStyle="bold"
                    fontFamily="monospace"
                    fill={circuit.color}
                    width={badgeW}
                    align="center"
                    offsetY={-Math.max(6, 7) / scale * 0.15}
                    listening={false}
                  />
                </Group>
              );
            })()}

          </Group>
        );
      })}
    </>
  );
}

/* ── Canvas constants ──────────────────────────────────── */
const ZOOM_STEP = 1.25;
const ZOOM_MIN  = 0.1;
const ZOOM_MAX  = 8;
const GRID_DIVS = 8;
const PAD       = 36;

/* ── Main canvas ───────────────────────────────────────── */
const WallCanvas = forwardRef<WallCanvasHandle>((_props, ref) => {
  useImperativeHandle(ref, () => ({}));
  const { t } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef     = useRef<Konva.Stage>(null);
  const [size,      setSize]      = useState({ width: 800, height: 600 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanningRef              = useRef(false);
  const panStartRef               = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const isDraggingSelRef     = useRef(false);
  const dragStartCanvasRef   = useRef<{ x: number; y: number } | null>(null);
  const dragCurrentCanvasRef = useRef<{ x: number; y: number } | null>(null);
  const [selBox, setSelBox]  = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const panRafRef            = useRef<number | null>(null);
  const selBoxRafRef         = useRef<number | null>(null);

  const project               = useProjectStore((s) => s.project);
  const selectedTileIds       = useProjectStore((s) => s.selectedTileIds);
  const appMode               = useProjectStore((s) => s.appMode);
  const activePortId          = useProjectStore((s) => s.activePortId);
  const activeCircuitId       = useProjectStore((s) => s.activeCircuitId);
  const portDisplay           = useProjectStore((s) => s.portDisplay);
  const moveSelectedTiles     = useProjectStore((s) => s.moveSelectedTiles);
  const clearSelection        = useProjectStore((s) => s.clearSelection);
  const selectTileIds         = useProjectStore((s) => s.selectTileIds);
  const snapToGrid            = useProjectStore((s) => s.snapToGrid);
  const snapToTile            = useProjectStore((s) => s.snapToTile);
  const snapGrid              = useProjectStore((s) => s.snapGrid);
  const lockSelectedTiles     = useProjectStore((s) => s.lockSelectedTiles);
  const rotateSelectedTiles   = useProjectStore((s) => s.rotateSelectedTiles);

  // XY draft state for position input
  const [xyDraft, setXyDraft] = useState<{ x: string; y: string } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── All memoized derivations — placed before early return to satisfy Rules of Hooks ──

  // Active wall — memoized so reference is stable between unrelated renders
  const activeWall = useMemo(
    () => project?.walls.find((w) => w.id === project.activeWallId) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project?.walls, project?.activeWallId]
  );

  // Profile lookups — only recompute when profiles change, not on tile moves
  const profileMap = useMemo(
    () => new Map((project?.tileProfiles ?? []).map((p) => [p.id, p])),
    [project?.tileProfiles]
  );

  const profileColorMap = useMemo(
    () => new Map((project?.tileProfiles ?? []).map((p, i) => [p.id, TILE_COLORS[i % TILE_COLORS.length]])),
    [project?.tileProfiles]
  );

  // Wall color map — recomputes only when walls list changes
  const wallColorMap = useMemo(
    () => new Map((project?.walls ?? []).map((w, i) => [w.id, WALL_EXPORT_COLORS[i % WALL_EXPORT_COLORS.length]])),
    [project?.walls]
  );

  const selectedSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);

  // Inactive walls list — memoized to prevent snap-array recomputes on every render
  const inactiveWalls = useMemo(
    () => (project?.walls ?? []).filter((w) => w.id !== project?.activeWallId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project?.walls, project?.activeWallId]
  );

  // Ports for this wall — memoized so tilePortMap stays stable
  const ports = useMemo(
    () => !activeWall ? [] : (project?.processors ?? []).flatMap((proc) => proc.ports).filter((p) => p.wallId === activeWall.id),
    [project?.processors, activeWall]
  );

  // Circuits for this wall — memoized so tileCircuitMap stays stable
  const wallCircuits = useMemo(
    () => !activeWall ? [] : (project?.circuits ?? []).filter((c) => c.wallId === activeWall.id),
    [project?.circuits, activeWall]
  );

  // Snap target arrays — stable refs are the critical path for preventing all-tile re-renders
  const allSnapXs = useMemo(() => {
    if (!activeWall) return [] as number[];
    const xs: number[] = [];
    for (const wall of inactiveWalls) {
      for (const tile of wall.tiles) {
        const p = profileMap.get(tile.profileId);
        if (!p) continue;
        const r = tile.rotation ?? 0;
        const ew = (r === 90 || r === 270) ? p.pixelHeight : p.pixelWidth;
        xs.push(tile.x, tile.x + ew);
      }
    }
    for (const tile of activeWall.tiles) {
      if (selectedSet.has(tile.id)) continue;
      const p = profileMap.get(tile.profileId);
      if (!p) continue;
      const r = tile.rotation ?? 0;
      const ew = (r === 90 || r === 270) ? p.pixelHeight : p.pixelWidth;
      xs.push(tile.x, tile.x + ew);
    }
    return xs;
  }, [inactiveWalls, activeWall?.tiles, selectedSet, profileMap]);

  const allSnapYs = useMemo(() => {
    if (!activeWall) return [] as number[];
    const ys: number[] = [];
    for (const wall of inactiveWalls) {
      for (const tile of wall.tiles) {
        const p = profileMap.get(tile.profileId);
        if (!p) continue;
        const r = tile.rotation ?? 0;
        const eh = (r === 90 || r === 270) ? p.pixelWidth : p.pixelHeight;
        ys.push(tile.y, tile.y + eh);
      }
    }
    for (const tile of activeWall.tiles) {
      if (selectedSet.has(tile.id)) continue;
      const p = profileMap.get(tile.profileId);
      if (!p) continue;
      const r = tile.rotation ?? 0;
      const eh = (r === 90 || r === 270) ? p.pixelWidth : p.pixelHeight;
      ys.push(tile.y, tile.y + eh);
    }
    return ys;
  }, [inactiveWalls, activeWall?.tiles, selectedSet, profileMap]);

  const tilePortMap = useMemo(() => {
    const m = new Map<string, { portId: string; color: string }>();
    for (const port of ports) {
      for (const tid of port.tileIds) {
        m.set(tid, { portId: port.id, color: port.color });
      }
    }
    return m;
  }, [ports]);

  const tileCircuitMap = useMemo(() => {
    const m = new Map<string, { circuitId: string; color: string; order: number; name: string }>();
    for (const circuit of wallCircuits) {
      circuit.tileIds.forEach((tid, idx) => {
        m.set(tid, { circuitId: circuit.id, color: circuit.color, order: idx + 1, name: circuit.name });
      });
    }
    return m;
  }, [wallCircuits]);

  // Selection bounding box — memoized, recalculates only when tiles or selection changes
  const selBounds = useMemo(() => {
    if (!activeWall || selectedSet.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const tile of activeWall.tiles) {
      if (!selectedSet.has(tile.id)) continue;
      const p = profileMap.get(tile.profileId);
      if (!p) continue;
      const r = tile.rotation ?? 0;
      const ew = (r === 90 || r === 270) ? p.pixelHeight : p.pixelWidth;
      const eh = (r === 90 || r === 270) ? p.pixelWidth  : p.pixelHeight;
      if (tile.x        < minX) minX = tile.x;
      if (tile.y        < minY) minY = tile.y;
      if (tile.x + ew  > maxX) maxX = tile.x + ew;
      if (tile.y + eh  > maxY) maxY = tile.y + eh;
    }
    return isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
  }, [activeWall?.tiles, selectedSet, profileMap]);

  // ── Scale / offset calculations (no hooks) ──────────────────────────
  const fitScale    = project
    ? Math.min((size.width - PAD * 2) / project.canvasWidth, (size.height - PAD * 2) / project.canvasHeight)
    : 1;
  const renderScale = fitScale * zoomLevel;
  const displayW    = project ? project.canvasWidth  * renderScale : 0;
  const displayH    = project ? project.canvasHeight * renderScale : 0;
  const offsetX     = (size.width  - displayW) / 2 + panOffset.x;
  const offsetY     = (size.height - displayH) / 2 + panOffset.y;

  // ── Stable zoom callbacks ────────────────────────────────────────────
  const zoomIn  = useCallback(() => setZoomLevel((z) => Math.min(ZOOM_MAX, +(z * ZOOM_STEP).toFixed(4))), []);
  const zoomOut = useCallback(() => setZoomLevel((z) => Math.max(ZOOM_MIN, +(z / ZOOM_STEP).toFixed(4))), []);
  const zoomFit = useCallback(() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }, []);
  const zoom100 = useCallback(() => setZoomLevel(+(1 / fitScale).toFixed(4)), [fitScale]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      e.deltaY < 0 ? zoomIn() : zoomOut();
    } else {
      setPanOffset((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, [zoomIn, zoomOut]);

  // ── Mutable refs (updated each render, read in event handlers) ──────
  const offsetXRef      = useRef(offsetX);
  const offsetYRef      = useRef(offsetY);
  const renderScaleRef  = useRef(renderScale);
  const activeWallRef   = useRef(activeWall);
  const projectRef      = useRef(project);
  const profileMapRef   = useRef(profileMap);   // avoids O(n²) lookup in drag-select
  offsetXRef.current     = offsetX;
  offsetYRef.current     = offsetY;
  renderScaleRef.current = renderScale;
  activeWallRef.current  = activeWall;
  projectRef.current     = project;
  profileMapRef.current  = profileMap;

  const stageToCanvas = useCallback((sx: number, sy: number) => ({
    x: (sx - offsetXRef.current) / renderScaleRef.current,
    y: (sy - offsetYRef.current) / renderScaleRef.current,
  }), []);

  // ── Drag-select mouseup handler ──────────────────────────────────────
  useEffect(() => {
    const onMouseUp = () => {
      if (!isDraggingSelRef.current) return;
      const start   = dragStartCanvasRef.current;
      const current = dragCurrentCanvasRef.current;
      if (start && current) {
        const isLtoR = current.x >= start.x;
        const l = Math.min(start.x, current.x), r = Math.max(start.x, current.x);
        const t = Math.min(start.y, current.y), b = Math.max(start.y, current.y);
        const dist = (r - l) + (b - t);
        if (dist > 5 && activeWallRef.current && projectRef.current) {
          const ids: string[] = [];
          const profMap = profileMapRef.current; // O(1) lookup — was O(n) per tile
          for (const tile of activeWallRef.current.tiles) {
            const prof = profMap.get(tile.profileId);
            if (!prof) continue;
            const tRot = tile.rotation ?? 0;
            const tEW = (tRot === 90 || tRot === 270) ? prof.pixelHeight : prof.pixelWidth;
            const tEH = (tRot === 90 || tRot === 270) ? prof.pixelWidth  : prof.pixelHeight;
            if (isLtoR) {
              if (tile.x >= l && tile.x + tEW <= r && tile.y >= t && tile.y + tEH <= b)
                ids.push(tile.id);
            } else {
              if (tile.x < r && tile.x + tEW > l && tile.y < b && tile.y + tEH > t)
                ids.push(tile.id);
            }
          }
          if (ids.length > 0) selectTileIds(ids);
          else clearSelection();
        }
      }
      isDraggingSelRef.current = false;
      dragStartCanvasRef.current = null;
      dragCurrentCanvasRef.current = null;
      setSelBox(null);
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [selectTileIds, clearSelection]);

  // ── xyDraft sync ─────────────────────────────────────────────────────
  useEffect(() => {
    if (selBounds) {
      setXyDraft({ x: String(selBounds.x), y: String(selBounds.y) });
    } else {
      setXyDraft(null);
    }
  // Key off coords + count so draft resets when selection moves via drag
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selBounds?.x, selBounds?.y, selectedSet.size]);

  const applyXY = useCallback(() => {
    if (!xyDraft || !selBounds) return;
    const nx = evalMathExpr(xyDraft.x) ?? parseInt(xyDraft.x, 10);
    const ny = evalMathExpr(xyDraft.y) ?? parseInt(xyDraft.y, 10);
    if (!isNaN(nx) || !isNaN(ny)) {
      moveSelectedTiles(isNaN(nx) ? 0 : nx - selBounds.x, isNaN(ny) ? 0 : ny - selBounds.y);
    }
  }, [xyDraft, selBounds, moveSelectedTiles]);

  // ── Early return — all hooks are above this line ─────────────────────
  if (!project || !activeWall) {
    return (
      <div style={cs.container}>
        <p style={{ color: 'var(--text-muted)' }}>{t('wallCanvas.noProject')}</p>
      </div>
    );
  }

  // ── Plain derivations after early return (no hooks) ────────────────
  const gridStepX     = project.canvasWidth  / GRID_DIVS;
  const gridStepY     = project.canvasHeight / GRID_DIVS;
  const pct           = Math.round(zoomLevel * 100);
  const selCount      = selectedTileIds.length;
  const isBoxLtoR     = selBox ? selBox.x2 >= selBox.x1 : true;
  const isPortMode    = appMode === 'port-routing';
  const isCircuitMode = appMode === 'circuit-routing';

  // Adaptive snap grid step — thin out grid lines when zoomed out
  let snapVisStep = snapToGrid ? snapGrid : 0;
  if (snapVisStep > 0) {
    const maxLines = 150;
    while (snapVisStep > 0 && (snapVisStep * renderScale < 7 || project.canvasWidth / snapVisStep > maxLines)) {
      snapVisStep *= 2;
      if (snapVisStep >= project.canvasWidth) { snapVisStep = 0; break; }
    }
  }

  const activePort    = ports.find((p) => p.id === activePortId) ?? null;
  const activeCircuit = wallCircuits.find((c) => c.id === activeCircuitId) ?? null;

  return (
    <div ref={containerRef} style={cs.container} onWheel={handleWheel}>

      {/* Port-mode banner */}
      {isPortMode && (
        <div style={cs.portBanner}>
          <span style={{ color: activePort?.color ?? '#ef4444', fontWeight: 700 }}>
            {activePort ? t('wallCanvas.routingPort', { name: activePort.name }) : t('wallCanvas.routingPort', { name: 'Port Routing Mode' })}
          </span>
          {activePort
            ? ` — ${t('wallCanvas.routingPortHint')}`
            : ` — ${t('wallCanvas.routingPortEmpty')}`}
        </div>
      )}

      {/* Circuit-mode banner */}
      {isCircuitMode && (
        <div style={{ ...cs.portBanner, borderColor: activeCircuit ? activeCircuit.color + '55' : '#f9731655' }}>
          <span style={{ color: activeCircuit?.color ?? '#f97316', fontWeight: 700 }}>
            {activeCircuit ? t('wallCanvas.routingCircuit', { name: activeCircuit.name }) : t('wallCanvas.routingCircuit', { name: 'Circuit Routing Mode' })}
          </span>
          {activeCircuit
            ? ` — ${t('wallCanvas.routingCircuitHint')}`
            : ` — ${t('wallCanvas.routingCircuitEmpty')}`}
        </div>
      )}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        style={{ background: 'transparent', cursor: isPanningRef.current ? 'grabbing' : undefined }}
        onClick={(e) => {
          if (isPanningRef.current) return;
          if (e.target !== e.target.getStage()) return;
          clearSelection();
        }}
        onContextMenu={(e) => e.evt.preventDefault()}
        onMouseDown={(e) => {
          // Right-click (button 2) → start pan
          if (e.evt.button === 2) {
            isPanningRef.current = true;
            panStartRef.current = { mx: e.evt.clientX, my: e.evt.clientY, px: panOffset.x, py: panOffset.y };
            return;
          }
          if (isPortMode || isCircuitMode) return;
          if (e.target !== e.target.getStage()) return;
          const pos = stageRef.current?.getPointerPosition();
          if (!pos) return;
          const c = stageToCanvas(pos.x, pos.y);
          isDraggingSelRef.current = true;
          dragStartCanvasRef.current = c;
          dragCurrentCanvasRef.current = c;
          setSelBox({ x1: c.x, y1: c.y, x2: c.x, y2: c.y });
        }}
        onMouseMove={(e) => {
          // Pan drag
          if (isPanningRef.current && panStartRef.current) {
            const dx = e.evt.clientX - panStartRef.current.mx;
            const dy = e.evt.clientY - panStartRef.current.my;
            const nx = panStartRef.current.px + dx;
            const ny = panStartRef.current.py + dy;
            if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
            panRafRef.current = requestAnimationFrame(() => {
              setPanOffset({ x: nx, y: ny });
            });
            return;
          }
          if (!isDraggingSelRef.current || !dragStartCanvasRef.current) return;
          const pos = stageRef.current?.getPointerPosition();
          if (!pos) return;
          const c = stageToCanvas(pos.x, pos.y);
          dragCurrentCanvasRef.current = c;
          const x1 = dragStartCanvasRef.current.x, y1 = dragStartCanvasRef.current.y;
          if (selBoxRafRef.current) cancelAnimationFrame(selBoxRafRef.current);
          selBoxRafRef.current = requestAnimationFrame(() => {
            setSelBox({ x1, y1, x2: c.x, y2: c.y });
          });
        }}
        onMouseUp={(e) => {
          if (e.evt.button === 2) {
            isPanningRef.current = false;
            panStartRef.current = null;
          }
        }}
      >
        {/* ── Single layer: background + inactive walls + active wall ── */}
        <Layer x={offsetX} y={offsetY} scaleX={renderScale} scaleY={renderScale}>

          {/* Canvas background — listening={false} so clicks fall through to Stage */}
          <Rect
            x={0} y={0}
            width={project.canvasWidth} height={project.canvasHeight}
            fill="#0e1420"
            stroke="#2a3344"
            strokeWidth={1 / renderScale}
            listening={false}
            perfectDrawEnabled={false}
            shadowEnabled={false}
          />

          {/* Major grid (canvas / 8 divisions) */}
          {Array.from({ length: GRID_DIVS - 1 }, (_, i) => (
            <Rect key={`gv-${i}`} x={(i + 1) * gridStepX} y={0}
              width={0.6 / renderScale} height={project.canvasHeight}
              fill="rgba(255,255,255,0.06)" listening={false} />
          ))}
          {Array.from({ length: GRID_DIVS - 1 }, (_, i) => (
            <Rect key={`gh-${i}`} x={0} y={(i + 1) * gridStepY}
              width={project.canvasWidth} height={0.6 / renderScale}
              fill="rgba(255,255,255,0.06)" listening={false} />
          ))}

          {/* Snap grid (fine, adaptive density) */}
          {snapVisStep > 0 && <>
            {Array.from({ length: Math.ceil(project.canvasWidth  / snapVisStep) - 1 }, (_, i) => (
              <Rect key={`sgv-${i}`} x={(i + 1) * snapVisStep} y={0}
                width={0.4 / renderScale} height={project.canvasHeight}
                fill="rgba(255,255,255,0.04)" listening={false} />
            ))}
            {Array.from({ length: Math.ceil(project.canvasHeight / snapVisStep) - 1 }, (_, i) => (
              <Rect key={`sgh-${i}`} x={0} y={(i + 1) * snapVisStep}
                width={project.canvasWidth} height={0.4 / renderScale}
                fill="rgba(255,255,255,0.04)" listening={false} />
            ))}
          </>}

          {/* ── Inactive wall tiles (always visible, drawn above background) ── */}
          {inactiveWalls.flatMap((wall) => {
            const wc = wallColorMap.get(wall.id) ?? WALL_EXPORT_COLORS[0];
            return wall.tiles.map((tile) => {
              const profile = profileMap.get(tile.profileId);
              if (!profile) return null;
              const cr  = Math.max(1, Math.round(3 / renderScale));
              const iRot = tile.rotation ?? 0;
              const iEW  = (iRot === 90 || iRot === 270) ? profile.pixelHeight : profile.pixelWidth;
              const iEH  = (iRot === 90 || iRot === 270) ? profile.pixelWidth  : profile.pixelHeight;
              return (
                <Rect
                  key={`inactive-${wall.id}-${tile.id}`}
                  x={tile.x} y={tile.y}
                  width={iEW} height={iEH}
                  fill={profileColorMap.get(tile.profileId) ?? TILE_COLORS[0]}
                  stroke={wc.bright}
                  strokeWidth={Math.max(1, 2 / renderScale)}
                  cornerRadius={cr}
                  opacity={0.65}
                  listening={false}
                />
              );
            });
          })}

          {/* Canvas label watermark */}
          <Text
            x={10 / renderScale} y={10 / renderScale}
            text={project.name}
            fontSize={9 / renderScale}
            fontStyle="bold"
            fontFamily="-apple-system,'Segoe UI',sans-serif"
            fill="rgba(255,255,255,0.12)"
            listening={false}
          />
          <Text
            x={10 / renderScale} y={22 / renderScale}
            text={`${project.canvasWidth} × ${project.canvasHeight}`}
            fontSize={8 / renderScale}
            fontFamily="monospace"
            fill="rgba(255,255,255,0.07)"
            listening={false}
          />

          {/* Tiles */}
          {activeWall.tiles.map((tile) => {
            const profile = profileMap.get(tile.profileId);
            if (!profile) return null;
            const portInfo    = tilePortMap.get(tile.id);
            const circuitInfo = tileCircuitMap.get(tile.id);
            // Highlight: port mode takes priority, then circuit mode
            const portHighlight: 'active' | 'other' | null = isPortMode
              ? portInfo
                ? portInfo.portId === activePortId ? 'active' : 'other'
                : null
              : isCircuitMode
                ? circuitInfo
                  ? circuitInfo.circuitId === activeCircuitId ? 'active' : 'other'
                  : null
                : null;
            const portColor = isCircuitMode
              ? (circuitInfo?.color ?? (activeCircuit?.color ?? null))
              : (portInfo?.color ?? (activePort?.color ?? null));
            const isSelected = selectedSet.has(tile.id);
            const isInMultiSelect = isSelected && selCount > 1;
            const tileCircuitName = tileCircuitMap.get(tile.id)?.name;

            return (
              <TileNode
                key={tile.id}
                tileId={tile.id}
                tile={tile}
                profile={profile}
                isSelected={isSelected}
                isInMultiSelect={isInMultiSelect}
                colorHex={profileColorMap.get(tile.profileId) ?? TILE_COLORS[0]}
                labelVisibility={activeWall.labelVisibility}
                scale={renderScale}
                snapToGrid={snapToGrid}
                snapToTile={snapToTile}
                snapGrid={snapGrid}
                portHighlight={portHighlight}
                portColor={portColor}
                circuitName={tileCircuitName}
                allSnapXs={allSnapXs}
                allSnapYs={allSnapYs}
                hideLock={isPortMode || isCircuitMode}
              />
            );
          })}

          {/* Port routing overlay — only visible in port-routing mode */}
          {isPortMode && (
            <PortOverlay
              activeWall={activeWall}
              ports={ports}
              profileMap={profileMap}
              activePortId={activePortId}
              portDisplay={portDisplay}
              scale={renderScale}
            />
          )}

          {/* Circuit routing overlay — only visible in circuit-routing mode */}
          {isCircuitMode && (
            <CircuitOverlay
              activeWall={activeWall}
              circuits={wallCircuits}
              profileMap={profileMap}
              activeCircuitId={activeCircuitId}
              scale={renderScale}
            />
          )}

          {/* Drag-select rectangle */}
          {selBox && !isPortMode && (
            <Rect
              x={Math.min(selBox.x1, selBox.x2)} y={Math.min(selBox.y1, selBox.y2)}
              width={Math.abs(selBox.x2 - selBox.x1)} height={Math.abs(selBox.y2 - selBox.y1)}
              fill={isBoxLtoR ? 'rgba(59,130,246,0.07)' : 'rgba(96,165,250,0.05)'}
              stroke={isBoxLtoR ? '#3b82f6' : '#60a5fa'}
              strokeWidth={1.5 / renderScale}
              dash={[6 / renderScale, 3 / renderScale]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Selection info HUD */}
      {selCount > 0 && !isPortMode && !isCircuitMode && selBounds && (
        <div style={cs.selHud}>
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>{selCount}</span>
          <span style={{ color: 'var(--text-muted)' }}> tile{selCount !== 1 ? 's' : ''}</span>
          <span style={cs.selSep}>·</span>
          <span style={{ color: 'var(--text-muted)' }}>X</span>
          <input
            type="text"
            inputMode="decimal"
            value={xyDraft?.x ?? ''}
            onChange={(e) => setXyDraft((v) => v ? { ...v, x: e.target.value } : v)}
            onKeyDown={(e) => e.key === 'Enter' && applyXY()}
            style={{
              width: 60,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 11,
              padding: '1px 4px',
              borderRadius: 4,
              outline: 'none',
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>Y</span>
          <input
            type="text"
            inputMode="decimal"
            value={xyDraft?.y ?? ''}
            onChange={(e) => setXyDraft((v) => v ? { ...v, y: e.target.value } : v)}
            onKeyDown={(e) => e.key === 'Enter' && applyXY()}
            style={{
              width: 60,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 11,
              padding: '1px 4px',
              borderRadius: 4,
              outline: 'none',
            }}
          />
          <button
            onClick={applyXY}
            title={t('wallCanvas.moveSelection')}
            style={{
              background: 'rgba(245,158,11,0.15)',
              border: '1px solid rgba(245,158,11,0.35)',
              color: '#f59e0b',
              fontSize: 12,
              cursor: 'pointer',
              padding: '1px 6px',
              borderRadius: 4,
              lineHeight: 1.4,
            }}
          >
            ↵
          </button>
          <span style={cs.selSep}>·</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {selBounds.w}&thinsp;×&thinsp;{selBounds.h}&thinsp;px
          </span>
          <span style={cs.selSep}>·</span>
          <button
            onClick={() => rotateSelectedTiles(-90)}
            title="↺ Rotate CCW (Shift+R)"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '0px 5px', borderRadius: 4, lineHeight: 1.4 }}
          >↺</button>
          <button
            onClick={() => rotateSelectedTiles(90)}
            title="↻ Rotate CW (R)"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '0px 5px', borderRadius: 4, lineHeight: 1.4 }}
          >↻</button>
          <span style={cs.selSep}>·</span>
          {(() => {
            const selTiles = activeWall.tiles.filter((t) => selectedSet.has(t.id));
            const allLocked = selTiles.length > 0 && selTiles.every((t) => t.locked);
            return allLocked ? (
              <button
                onClick={() => lockSelectedTiles(false)}
                title={t('wallCanvas.unlock')}
                style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24', fontSize: 11, cursor: 'pointer', padding: '1px 7px', borderRadius: 4, lineHeight: 1.5 }}
              >
                🔓 {t('wallCanvas.unlock').split(' ')[0]}
              </button>
            ) : (
              <button
                onClick={() => lockSelectedTiles(true)}
                title={t('wallCanvas.lock')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', padding: '1px 7px', borderRadius: 4, lineHeight: 1.5 }}
              >
                🔒 Lock
              </button>
            );
          })()}
          <button
            onClick={clearSelection}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer', padding: '0 0 0 6px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Zoom controls */}
      <div className="zoom-controls" style={cs.zoomPanel}>
        <button className="zoom-btn" onClick={zoomOut} title={t('wallCanvas.zoomOut')}>−</button>
        <span className="zoom-level">{pct}%</span>
        <button className="zoom-btn" onClick={zoomIn}  title={t('wallCanvas.zoomIn')}>+</button>
        <div className="zoom-sep" />
        <button className="zoom-btn" onClick={zoomFit} title={t('wallCanvas.fitScreen')}
          style={{ fontSize: 12, color: zoomLevel === 1 ? 'var(--accent-bright)' : undefined }}>
          ⊡
        </button>
        <button className="zoom-btn" onClick={zoom100} title={t('wallCanvas.pixelPerfect')} style={{ fontSize: 10, letterSpacing: '-0.03em' }}>
          1:1
        </button>
      </div>

      {/* Status pill */}
      <div className="canvas-info">
        {activeWall.tiles.length} tile{activeWall.tiles.length !== 1 ? 's' : ''}
        {!isPortMode && !isCircuitMode && selCount > 0 && <> &ensp;·&ensp;<span style={{ color: '#f59e0b' }}>{selCount} sel</span></>}
        {isPortMode && activePort && <> &ensp;·&ensp;<span style={{ color: activePort.color }}>{activePort.tileIds.length} in chain</span></>}
        {isCircuitMode && activeCircuit && <> &ensp;·&ensp;<span style={{ color: activeCircuit.color }}>{activeCircuit.tileIds.length} in circuit</span></>}
        &ensp;·&ensp;{pct}%
        &ensp;·&ensp;{project.canvasWidth}×{project.canvasHeight}
      </div>
    </div>
  );
});

WallCanvas.displayName = 'WallCanvas';
export default WallCanvas;

const cs: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: 'radial-gradient(ellipse at center, #0f1620 0%, #080c10 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomPanel: {
    position: 'absolute',
    bottom: 14,
    right: 16,
  },
  selHud: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(8,12,16,0.88)',
    backdropFilter: 'blur(6px)',
    border: '1px solid rgba(245,158,11,0.4)',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 11,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  selSep: {
    color: 'rgba(255,255,255,0.15)',
    margin: '0 4px',
  },
  portBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    background: 'rgba(8,12,16,0.9)',
    backdropFilter: 'blur(6px)',
    borderBottom: '1px solid rgba(239,68,68,0.3)',
    padding: '6px 14px',
    fontSize: 11,
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
};
