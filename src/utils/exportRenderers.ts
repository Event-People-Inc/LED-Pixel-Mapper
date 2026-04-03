import Konva from 'konva';
import { Wall, TileProfile, TileInstance, Project, ProcessorPort, Circuit } from '../types';
import { useLicenseStore } from '../license/licenseStore';

// ── Wall export color palette ────────────────────────────────────────────────
// bright = lighter checkerboard tile color
// dark   = darker  checkerboard tile color
// accent = border, badge accents, corner markers, annotation text

export const WALL_EXPORT_COLORS: Array<{ bright: string; dark: string; accent: string }> = [
  { bright: '#e53e3e', dark: '#63171b', accent: '#feb2b2' },  // red
  { bright: '#38a169', dark: '#1c4532', accent: '#9ae6b4' },  // green
  { bright: '#3182ce', dark: '#1a365d', accent: '#90cdf4' },  // blue
  { bright: '#d69e2e', dark: '#5f370e', accent: '#faf089' },  // amber
  { bright: '#00b5d8', dark: '#065666', accent: '#9decf9' },  // cyan
  { bright: '#805ad5', dark: '#322659', accent: '#d6bcfa' },  // purple
  { bright: '#ed8936', dark: '#652b19', accent: '#fbd38d' },  // orange
  { bright: '#319795', dark: '#1d4044', accent: '#81e6d9' },  // teal
];

export function getWallExportColor(wallIndex: number): { bright: string; dark: string; accent: string } {
  return WALL_EXPORT_COLORS[wallIndex % WALL_EXPORT_COLORS.length];
}

// ── Export options ────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: 'png' | 'jpg';
  pixelRatio: number;
  includeWallName: boolean;
  includeWallResolution: boolean;
  includeCanvasPosition: boolean;
  includeRasterResolution: boolean;
  includeTileResolution: boolean;
  logoDataUrl: string | null;
  /** For Data/Power maps — shown beneath the wall name as "Front View" or "Back View" */
  viewDirection: 'front' | 'back';
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'png',
  pixelRatio: 1,
  includeWallName: true,
  includeWallResolution: true,
  includeCanvasPosition: true,
  includeRasterResolution: false,
  includeTileResolution: false,
  logoDataUrl: null,
  viewDirection: 'front',
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function mimeType(format: 'png' | 'jpg') {
  return format === 'png' ? 'image/png' : 'image/jpeg';
}

function mountStage(w: number, h: number): { stage: Konva.Stage; layer: Konva.Layer; container: HTMLDivElement } {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;';
  document.body.appendChild(container);
  const stage = new Konva.Stage({ container, width: w, height: h });
  const layer = new Konva.Layer();
  stage.add(layer);
  return { stage, layer, container };
}

function teardown(stage: Konva.Stage, container: HTMLDivElement) {
  stage.destroy();
  document.body.removeChild(container);
}

function addRect(
  target: Konva.Layer | Konva.Group,
  opts: { x: number; y: number; width: number; height: number; fill?: string; stroke?: string; strokeWidth?: number; cornerRadius?: number; opacity?: number },
) {
  target.add(new Konva.Rect(opts));
}

/** Compute bounding box of all tiles on a wall (accounts for rotation). */
function wallBounds(wall: Wall, profiles: Map<string, TileProfile>) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of wall.tiles) {
    const p = profiles.get(t.profileId);
    if (!p) continue;
    const r = t.rotation ?? 0;
    const ew = (r === 90 || r === 270) ? p.pixelHeight : p.pixelWidth;
    const eh = (r === 90 || r === 270) ? p.pixelWidth  : p.pixelHeight;
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + ew);
    maxY = Math.max(maxY, t.y + eh);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const FONT_SANS = "'Inter','Segoe UI',-apple-system,sans-serif";
const FONT_MONO = "'JetBrains Mono','Fira Mono','Consolas',monospace";

// ── Shared wall block renderer ────────────────────────────────────────────────
// Draws a wall as a premium-styled checkerboard block with:
//   • Checkerboard tiles (bright / dark alternating by grid position)
//   • Diagonal X marks per tile
//   • Accent-colored border
//   • Corner marker squares
//   • Center crosshair
//   • Dashed inscribed circle
//   • Optional canvas position annotation
//   • Centered proportional title badge

function drawWallBlock(
  layer: Konva.Layer,
  wall: Wall,
  wallColor: { bright: string; dark: string; accent: string },
  profileMap: Map<string, TileProfile>,
  bounds: { x: number; y: number; w: number; h: number },
  panelX: number,
  panelY: number,
  wallScale: number,
  opts: ExportOptions,
  /** Tiles used for badge centroid — should be exclusive (non-overlapping) tiles when possible */
  badgeTiles: TileInstance[],
): void {
  const { bright, dark, accent } = wallColor;
  const scaledW = bounds.w * wallScale;
  const scaledH = bounds.h * wallScale;

  // Clip function: union of this wall's actual tile rectangles.
  // Ensures ALL decorations stay within the wall's own tile footprint,
  // preventing bleed onto adjacent/overlapping walls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileClipFunc = (ctx: any) => {
    for (const tile of wall.tiles) {
      const prof = profileMap.get(tile.profileId);
      if (!prof) continue;
      const r = tile.rotation ?? 0;
      const ew = (r === 90 || r === 270) ? prof.pixelHeight : prof.pixelWidth;
      const eh = (r === 90 || r === 270) ? prof.pixelWidth  : prof.pixelHeight;
      ctx.rect(
        panelX + (tile.x - bounds.x) * wallScale,
        panelY + (tile.y - bounds.y) * wallScale,
        ew * wallScale,
        eh * wallScale,
      );
    }
  };

  // All visual decoration goes into this tile-clipped group
  const wallGroup = new Konva.Group({ clipFunc: tileClipFunc, listening: false });

  // 1. Checkerboard tiles with X marks
  for (const tile of wall.tiles) {
    const profile = profileMap.get(tile.profileId);
    if (!profile) continue;

    const tileRot = tile.rotation ?? 0;
    const effW = (tileRot === 90 || tileRot === 270) ? profile.pixelHeight : profile.pixelWidth;
    const effH = (tileRot === 90 || tileRot === 270) ? profile.pixelWidth  : profile.pixelHeight;

    const gridCol = Math.round((tile.x - bounds.x) / effW);
    const gridRow = Math.round((tile.y - bounds.y) / effH);
    const isLight = (gridCol + gridRow) % 2 === 0;

    // AABB top-left in panel space
    const tx = panelX + (tile.x - bounds.x) * wallScale;
    const ty = panelY + (tile.y - bounds.y) * wallScale;
    // Scaled unrotated tile dimensions (content space)
    const utw = profile.pixelWidth  * wallScale;
    const uth = profile.pixelHeight * wallScale;
    // Scaled effective AABB dimensions
    const tew = effW * wallScale;
    const teh = effH * wallScale;

    // Center of AABB in panel space
    const tcx = tx + tew / 2;
    const tcy = ty + teh / 2;

    // Group rotated around AABB center
    const tileGroup = new Konva.Group({
      x: tcx, y: tcy,
      offsetX: utw / 2, offsetY: uth / 2,
      rotation: tileRot,
      listening: false,
    });

    tileGroup.add(new Konva.Rect({ x: 0, y: 0, width: utw, height: uth, fill: isLight ? bright : dark, listening: false }));

    const xSW = Math.max(1, Math.min(3, Math.min(utw, uth) * 0.025));
    tileGroup.add(new Konva.Line({ points: [0, 0, utw, uth], stroke: 'rgba(255,255,255,0.55)', strokeWidth: xSW, listening: false }));
    tileGroup.add(new Konva.Line({ points: [utw, 0, 0, uth], stroke: 'rgba(255,255,255,0.55)', strokeWidth: xSW, listening: false }));

    wallGroup.add(tileGroup);
  }

  // 2. Triangular mosaic overlay
  const mStep = Math.max(4, Math.round(Math.min(scaledW, scaledH) / 18));
  const mAlphas = [0.07, 0.04, 0.09, 0.05, 0.10, 0.04, 0.07, 0.05];
  for (let mx = panelX; mx < panelX + scaledW; mx += mStep) {
    for (let my = panelY; my < panelY + scaledH; my += mStep) {
      const idx = (((mx - panelX) / mStep | 0) + ((my - panelY) / mStep | 0)) % mAlphas.length;
      const x2 = mx + mStep, y2 = my + mStep;
      wallGroup.add(new Konva.Line({ points: [mx, my, x2, my, mx, y2], closed: true, fill: bright, opacity: mAlphas[idx], listening: false }));
      wallGroup.add(new Konva.Line({ points: [x2, my, x2, y2, mx, y2], closed: true, fill: accent, opacity: mAlphas[(idx + 1) % mAlphas.length], listening: false }));
    }
  }

  // 3. Wall border
  wallGroup.add(new Konva.Rect({
    x: panelX, y: panelY, width: scaledW, height: scaledH,
    stroke: accent, strokeWidth: 1.5, listening: false,
  }));

  // 4. Corner markers
  const markerSz = Math.max(8, Math.min(20, Math.min(scaledW, scaledH) * 0.025));
  [
    [panelX,                       panelY],
    [panelX + scaledW - markerSz,  panelY],
    [panelX,                       panelY + scaledH - markerSz],
    [panelX + scaledW - markerSz,  panelY + scaledH - markerSz],
  ].forEach(([cx, cy]) =>
    wallGroup.add(new Konva.Rect({ x: cx, y: cy, width: markerSz, height: markerSz, fill: accent, listening: false }))
  );

  // 5. Center crosshair
  const midX = panelX + scaledW / 2;
  const midY = panelY + scaledH / 2;
  const crossSW = Math.max(1.5, Math.min(4, Math.min(scaledW, scaledH) * 0.004));
  wallGroup.add(new Konva.Line({ points: [panelX, midY, panelX + scaledW, midY], stroke: 'rgba(255,255,255,0.80)', strokeWidth: crossSW, listening: false }));
  wallGroup.add(new Konva.Line({ points: [midX, panelY, midX, panelY + scaledH], stroke: 'rgba(255,255,255,0.80)', strokeWidth: crossSW, listening: false }));

  // 6. Dashed inscribed circle
  const circleR = Math.min(scaledW, scaledH) / 2;
  wallGroup.add(new Konva.Circle({
    x: midX, y: midY, radius: circleR,
    stroke: 'rgba(255,255,255,0.78)', strokeWidth: crossSW, dash: [Math.max(8, circleR * 0.08), Math.max(5, circleR * 0.05)], listening: false,
  }));

  layer.add(wallGroup);

  // 7. Canvas position annotation (inside top-left of wall)
  if (opts.includeCanvasPosition && bounds.w > 0) {
    const posFontSz = Math.max(9, Math.min(14, Math.min(scaledW, scaledH) * 0.022));
    layer.add(new Konva.Text({
      x: panelX + markerSz + 4, y: panelY + 5,
      text: `(${bounds.x}, ${bounds.y})`,
      fontSize: posFontSz, fontFamily: FONT_MONO,
      fill: accent, opacity: 0.80, listening: false,
    }));
  }

  // 8. Centered proportional title badge
  const nameFontSz = Math.max(12, Math.min(32, Math.min(scaledW, scaledH) * 0.048));
  const resFontSz  = Math.max(10, Math.min(20, nameFontSz * 0.65));
  const BADGE_PAD_H = nameFontSz * 0.9;
  const BADGE_PAD_V = nameFontSz * 0.5;
  const BADGE_GAP   = nameFontSz * 0.28;

  const nameText = opts.includeWallName    ? `— ${wall.name} —`                     : '';
  const resText  = opts.includeWallResolution && bounds.w > 0
    ? `W ${bounds.w}  \u00d7  H ${bounds.h}` : '';

  if (nameText || resText) {
    const nameNode = nameText ? new Konva.Text({ text: nameText, fontSize: nameFontSz, fontFamily: FONT_SANS, fontStyle: 'bold', fill: '#ffffff', listening: false }) : null;
    const resNode  = resText  ? new Konva.Text({ text: resText,  fontSize: resFontSz,  fontFamily: FONT_MONO, fill: accent,    listening: false }) : null;

    const contentW = Math.max(nameNode?.width() ?? 0, resNode?.width() ?? 0);
    const contentH = (nameNode ? nameFontSz : 0) + (resNode ? BADGE_GAP + resFontSz : 0);
    const badgeW   = contentW + BADGE_PAD_H * 2;
    const badgeH   = contentH + BADGE_PAD_V * 2;
    // Centre on the centroid of tile centres, not the bounding-box centre.
    // This keeps the badge over the actual tile mass for irregular wall shapes.
    let centroidRX = panelX + scaledW / 2; // fallback: bounding-box centre
    let centroidRY = panelY + scaledH / 2;
    const tilesForCentroid = badgeTiles.length > 0 ? badgeTiles : wall.tiles;
    if (tilesForCentroid.length > 0) {
      let sumX = 0, sumY = 0;
      for (const t of tilesForCentroid) {
        const prof = profileMap.get(t.profileId);
        const tw = prof?.pixelWidth  ?? 0;
        const th = prof?.pixelHeight ?? 0;
        sumX += t.x + tw / 2;
        sumY += t.y + th / 2;
      }
      const avgX = sumX / tilesForCentroid.length;
      const avgY = sumY / tilesForCentroid.length;
      centroidRX = panelX + (avgX - bounds.x) * wallScale;
      centroidRY = panelY + (avgY - bounds.y) * wallScale;
    }
    const badgeX = centroidRX - badgeW / 2;
    const badgeY = centroidRY - badgeH / 2;

    // Badge backdrop
    layer.add(new Konva.Rect({
      x: badgeX, y: badgeY, width: badgeW, height: badgeH,
      fill: 'rgba(5,8,18,0.82)',
      stroke: accent, strokeWidth: 1,
      cornerRadius: 4, listening: false,
    }));

    if (nameNode) {
      layer.add(new Konva.Text({
        x: badgeX + BADGE_PAD_H, y: badgeY + BADGE_PAD_V,
        text: nameText, fontSize: nameFontSz,
        fontFamily: FONT_SANS, fontStyle: 'bold', fill: '#ffffff',
        width: contentW, align: 'center', listening: false,
      }));
    }

    if (resNode) {
      layer.add(new Konva.Text({
        x: badgeX + BADGE_PAD_H, y: badgeY + BADGE_PAD_V + (nameNode ? nameFontSz + BADGE_GAP : 0),
        text: resText, fontSize: resFontSz,
        fontFamily: FONT_MONO, fill: accent,
        width: contentW, align: 'center', listening: false,
      }));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS EXPORT
// All walls at their exact canvas positions. Each wall rendered via drawWallBlock.
// Schematic layout overview with ultra-minimal chrome.
// ═══════════════════════════════════════════════════════════════════════════════

export async function renderCanvasExport(
  project: Project,
  wallsToShow: Wall[],
  opts: ExportOptions,
): Promise<string> {
  const { canvasWidth, canvasHeight } = project;

  const wallIndexMap = new Map(project.walls.map((w, i) => [w.id, i]));
  const profileMap   = new Map(project.tileProfiles.map((p) => [p.id, p]));

  // ── Render walls at their exact canvas positions (pixel-accurate) ─────────
  const pos = wallsToShow
    .map(w => ({ wall: w, bounds: wallBounds(w, profileMap) }))
    .filter(it => it.bounds.w > 0)
    .map(it => ({ ...it, rx: it.bounds.x, ry: it.bounds.y }));

  const outW = canvasWidth;
  const outH = canvasHeight;

  const { stage, layer, container } = mountStage(outW, outH);

  // Footer height scales with canvas height (≈2.4% of height, clamped 40–80px)
  const FOOTER_H = Math.round(Math.max(40, Math.min(80, outH * 0.024)));
  const drawH    = outH - FOOTER_H;

  // Background
  addRect(layer, { x: 0, y: 0, width: outW, height: outH, fill: '#090d14' });

  // Subtle dot grid — single shape, one canvas2d call
  { const S = 48;
    layer.add(new Konva.Shape({
      sceneFunc(ctx) {
        ctx.beginPath();
        for (let dx = S; dx < outW; dx += S)
          for (let dy = S; dy < drawH; dy += S) {
            ctx.moveTo(dx + 0.8, dy);
            ctx.arc(dx, dy, 0.8, 0, Math.PI * 2);
          }
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fill();
      },
      listening: false,
    }));
  }

  // For each wall, find tiles that don't overlap any tile from another wall.
  // The badge centroid is computed from these exclusive tiles so it lands in
  // the wall's own visual area rather than a shared/overlapping zone.
  const exclusiveTilesPerWall = pos.map(({ wall }) => {
    const exclusive = wall.tiles.filter(tile => {
      const prof = profileMap.get(tile.profileId);
      if (!prof) return true;
      const tx2 = tile.x + prof.pixelWidth;
      const ty2 = tile.y + prof.pixelHeight;
      for (const other of pos) {
        if (other.wall.id === wall.id) continue;
        for (const ot of other.wall.tiles) {
          const op = profileMap.get(ot.profileId);
          if (!op) continue;
          if (tile.x < ot.x + op.pixelWidth && tx2 > ot.x && tile.y < ot.y + op.pixelHeight && ty2 > ot.y) {
            return false;
          }
        }
      }
      return true;
    });
    // Fall back to all tiles if the wall is entirely overlapped
    return exclusive.length > 0 ? exclusive : wall.tiles;
  });

  // Draw each wall block at its exact canvas position
  for (let i = 0; i < pos.length; i++) {
    const { wall, bounds, rx: panelX, ry: panelY } = pos[i];
    const wallIdx   = wallIndexMap.get(wall.id) ?? 0;
    const wallColor = getWallExportColor(wallIdx);
    drawWallBlock(layer, wall, wallColor, profileMap, bounds, panelX, panelY, 1, opts, exclusiveTilesPerWall[i]);
  }

  // Footer strip
  addRect(layer, { x: 0, y: drawH, width: outW, height: FOOTER_H, fill: '#0d1119' });
  layer.add(new Konva.Line({ points: [0, drawH, outW, drawH], stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1, listening: false }));
  layer.add(new Konva.Text({ x: 32, y: drawH + 18, text: project.name, fontSize: 12, fontFamily: FONT_SANS, fontStyle: 'bold', fill: 'rgba(255,255,255,0.55)', listening: false }));

  const labelNode = new Konva.Text({ text: 'CANVAS EXPORT', fontSize: 9, fontFamily: FONT_MONO, fill: 'rgba(255,255,255,0.25)', letterSpacing: 2, listening: false });
  layer.add(labelNode);
  labelNode.setAttrs({ x: (outW - labelNode.width()) / 2, y: drawH + 21 });

  if (opts.includeRasterResolution) {
    const resNode = new Konva.Text({ text: `${canvasWidth} \u00d7 ${canvasHeight} px`, fontSize: 11, fontFamily: FONT_MONO, fill: 'rgba(255,255,255,0.40)', listening: false });
    layer.add(resNode);
    resNode.setAttrs({ x: outW - resNode.width() - 32, y: drawH + 18 });
  }

  const url = stage.toDataURL({ mimeType: mimeType(opts.format), pixelRatio: opts.pixelRatio });
  teardown(stage, container);

  let result = url;
  if (opts.logoDataUrl) {
    result = await compositeLogoCorner(result, opts.logoDataUrl, outW, outH, opts.format, opts.pixelRatio);
  }
  if (isFreeTier()) return addWatermark(result, opts.format);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WALL PIXEL MAP EXPORT
// Output at the wall's native pixel dimensions (bounds.w × bounds.h).
// pixelRatio multiplies the output: 1× = native resolution, 2× = retina.
// The wall fills the entire image — no chrome strips.
// ═══════════════════════════════════════════════════════════════════════════════

export async function renderWallPixelMapExport(
  wall: Wall,
  wallIndex: number,
  project: Project,
  _profileColorMap: Map<string, string>,  // kept for API compat; checkerboard replaces per-profile colors
  opts: ExportOptions,
): Promise<string> {
  const wallColor  = getWallExportColor(wallIndex);
  const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const bounds     = wallBounds(wall, profileMap);

  if (bounds.w === 0 || bounds.h === 0) {
    const { stage, layer, container } = mountStage(1, 1);
    addRect(layer, { x: 0, y: 0, width: 1, height: 1, fill: '#0c1018' });
    const url = stage.toDataURL({ mimeType: mimeType(opts.format) });
    teardown(stage, container);
    return url;
  }

  // Stage at wall's native pixel dimensions — pixelRatio applied at toDataURL time
  // so output file is: bounds.w * pixelRatio  ×  bounds.h * pixelRatio
  const { stage, layer, container } = mountStage(bounds.w, bounds.h);

  // Background
  addRect(layer, { x: 0, y: 0, width: bounds.w, height: bounds.h, fill: '#0c1018' });

  // Wall fills the entire output, wrs = 1 (1 stage pixel = 1 wall pixel)
  drawWallBlock(layer, wall, wallColor, profileMap, bounds, 0, 0, 1, opts, wall.tiles);

  const url = stage.toDataURL({ mimeType: mimeType(opts.format), pixelRatio: opts.pixelRatio });
  teardown(stage, container);

  let result = url;
  if (opts.logoDataUrl) {
    result = await compositeLogoCorner(result, opts.logoDataUrl, bounds.w, bounds.h, opts.format, opts.pixelRatio);
  }
  if (isFreeTier()) return addWatermark(result, opts.format);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA FLOW MAP EXPORT — per wall
// Renders tile layout with port routing arrows, controller/port/tile labels.
// ═══════════════════════════════════════════════════════════════════════════════

type PortWithProcessor = ProcessorPort & { processorName: string };

// ── Export icon helpers ───────────────────────────────────────────────────────

/**
 * Draw a small ethernet/RJ45 plug icon at (x, y), centred.
 * Used on data-flow arrows to indicate signal type.
 */
function drawEthernetIcon(layer: Konva.Layer, x: number, y: number, size: number, color: string): void {
  const hw = size * 0.52;   // half-width of plug body
  const hh = size * 0.42;   // half-height of plug body

  // Background circle
  layer.add(new Konva.Circle({ x, y, radius: size * 0.82, fill: '#0b1018', opacity: 0.88, listening: false }));
  layer.add(new Konva.Circle({ x, y, radius: size * 0.82, fill: 'transparent', stroke: color, strokeWidth: size * 0.09, opacity: 0.7, listening: false }));

  // Plug body rectangle
  layer.add(new Konva.Rect({ x: x - hw, y: y - hh, width: hw * 2, height: hh * 2, fill: color, cornerRadius: size * 0.08, listening: false }));

  // Three ethernet pins (thin white rects) at top of body
  const pinW  = hw * 0.22;
  const pinH  = hh * 0.55;
  const gap   = (hw * 2 - pinW * 3) / 4;
  for (let i = 0; i < 3; i++) {
    layer.add(new Konva.Rect({
      x: x - hw + gap + i * (pinW + gap),
      y: y - hh - pinH + size * 0.05,
      width: pinW, height: pinH,
      fill: color, listening: false,
    }));
  }

  // Latch bump at bottom
  layer.add(new Konva.Rect({ x: x - hw * 0.22, y: y + hh, width: hw * 0.44, height: size * 0.22, fill: color, cornerRadius: size * 0.06, listening: false }));
}

/**
 * Draw a small power plug / lightning bolt icon at (x, y), centred.
 * Used on power-flow arrows to indicate power type.
 */
function drawPowerIcon(layer: Konva.Layer, x: number, y: number, size: number, color: string): void {
  // Background circle
  layer.add(new Konva.Circle({ x, y, radius: size * 0.82, fill: '#0b1018', opacity: 0.88, listening: false }));
  layer.add(new Konva.Circle({ x, y, radius: size * 0.82, fill: 'transparent', stroke: color, strokeWidth: size * 0.09, opacity: 0.7, listening: false }));

  // Lightning bolt shape (filled polygon)
  // Points: top-right → mid-left → mid-centre-right → bottom-left → mid-right → mid-centre-left → back
  const s = size * 0.52;
  const pts = [
    x + s * 0.18,  y - s,          // top point (slightly right of centre)
    x - s * 0.52,  y + s * 0.08,   // left notch
    x + s * 0.08,  y + s * 0.04,   // centre join
    x - s * 0.18,  y + s,          // bottom point (slightly left of centre)
    x + s * 0.52,  y - s * 0.08,   // right notch
    x - s * 0.08,  y - s * 0.04,   // centre join
  ];
  layer.add(new Konva.Line({ points: pts, closed: true, fill: color, stroke: color, strokeWidth: size * 0.05, listening: false }));
}

/** Build per-tile routing info from project processors for a given wall. */
function buildTileFlowMap(
  wallId: string,
  project: Project,
): {
  ports: PortWithProcessor[];
  tileInfo: Map<string, { processorName: string; portName: string; portColor: string; chainIndex: number }>;
} {
  const ports: PortWithProcessor[] = (project.processors ?? []).flatMap((proc) =>
    proc.ports
      .filter((p) => p.wallId === wallId)
      .map((p) => ({ ...p, processorName: proc.name })),
  );
  const tileInfo = new Map<string, { processorName: string; portName: string; portColor: string; chainIndex: number }>();
  for (const port of ports) {
    port.tileIds.forEach((tid, idx) => {
      tileInfo.set(tid, {
        processorName: port.processorName,
        portName: port.name,
        portColor: port.color,
        chainIndex: idx + 1,
      });
    });
  }
  return { ports, tileInfo };
}

// ── Unified sizing constants ──────────────────────────────────────────────────
// All flow-map geometry derives from a single BASE = avg scaled tile dimension.
// This keeps arrows, icons, text and badges mathematically proportional at any scale.

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// Watermark drawn faintly in the centre of the tile area
function drawWatermark(
  layer: Konva.Layer,
  text: string,
  cx: number, cy: number,
  areaW: number, areaH: number,
): void {
  const fs = clamp(Math.min(areaW * 0.11, areaH * 0.14), 38, 140);
  layer.add(new Konva.Text({
    x: cx - areaW / 2, y: cy - fs / 2,
    text,
    width: areaW,
    align: 'center',
    fontSize: fs,
    fontFamily: FONT_SANS,
    fontStyle: 'bold',
    fill: 'rgba(255,255,255,0.028)',
    letterSpacing: clamp(fs * 0.04, 2, 8),
    listening: false,
  }));
}

// Shared arrow + icon renderer — used identically by data and power flow
function drawChainArrows(
  layer: Konva.Layer,
  wall: Wall,
  profileMap: Map<string, TileProfile>,
  bounds: { x: number; y: number; w: number; h: number },
  chains: { color: string; tileIds: string[] }[],
  scale: number,
  originX: number,
  originY: number,
  iconFn: (layer: Konva.Layer, x: number, y: number, size: number, color: string) => void,
): void {
  for (const chain of chains) {
    if (chain.tileIds.length < 2) continue;

    const centers: { cx: number; cy: number; tileDim: number }[] = [];
    for (const tid of chain.tileIds) {
      const tile = wall.tiles.find((t) => t.id === tid);
      if (!tile) continue;
      const profile = profileMap.get(tile.profileId);
      if (!profile) continue;
      centers.push({
        cx: originX + (tile.x - bounds.x + profile.pixelWidth  / 2) * scale,
        cy: originY + (tile.y - bounds.y + profile.pixelHeight / 2) * scale,
        tileDim: Math.min(profile.pixelWidth, profile.pixelHeight) * scale,
      });
    }
    if (centers.length < 2) continue;

    // BASE — average scaled minimum tile dimension
    const BASE  = centers.reduce((s, c) => s + c.tileDim, 0) / centers.length;

    // Arrow sizing (THINNER & CLEANER than before)
    const sw    = clamp(BASE * 0.028, 2,  8);
    const pLen  = clamp(BASE * 0.13,  8, 32);
    const pW    = clamp(BASE * 0.10,  6, 24);

    // Badge sizing (BIGGER than before)
    const lfs   = clamp(BASE * 0.10, 13, 22);
    const lpad  = clamp(lfs * 0.42,  5, 12);
    const lh    = lfs + lpad * 2;

    // Icon sizing — sits below the badge
    const iconR = clamp(BASE * 0.155, 15, 42);

    for (let i = 0; i < centers.length - 1; i++) {
      const from = centers[i];
      const to   = centers[i + 1];
      const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy);
      if (dist < 4) continue;

      const ePLen = Math.min(pLen, dist * 0.38);
      const ePW   = pW;

      // Glow pass
      layer.add(new Konva.Arrow({
        points: [from.cx, from.cy, to.cx, to.cy],
        stroke: chain.color, strokeWidth: sw * 2.6,
        fill: chain.color,
        pointerLength: ePLen * 1.25, pointerWidth: ePW * 1.3,
        opacity: 0.14, lineCap: 'round', lineJoin: 'round', listening: false,
      }));

      // Main arrow (thinner, sharper)
      layer.add(new Konva.Arrow({
        points: [from.cx, from.cy, to.cx, to.cy],
        stroke: chain.color, strokeWidth: sw,
        fill: chain.color,
        pointerLength: ePLen, pointerWidth: ePW,
        opacity: 0.96, lineCap: 'round', lineJoin: 'round', listening: false,
      }));

      // Midpoint stack: [ICON] above [BADGE]
      const midX = (from.cx + to.cx) / 2;
      const midY = (from.cy + to.cy) / 2;

      // Badge pill — "N → N+1" label
      const labelText = `${i + 1}  →  ${i + 2}`;
      const lw = clamp(lfs * labelText.length * 0.56 + lpad * 2, lh * 2, BASE * 0.9);

      layer.add(new Konva.Rect({
        x: midX - lw / 2, y: midY - lh / 2,
        width: lw, height: lh,
        fill: '#0b1020', stroke: chain.color,
        strokeWidth: clamp(sw * 0.55, 1.2, 3),
        cornerRadius: lh / 2, opacity: 0.97, listening: false,
      }));
      layer.add(new Konva.Text({
        x: midX - lw / 2, y: midY - lh / 2 + lpad,
        text: labelText,
        fontSize: lfs, fontFamily: FONT_MONO, fontStyle: 'bold',
        fill: chain.color, width: lw, align: 'center', listening: false,
      }));

      // Icon below badge — clear of the badge, no overlap with tile labels above
      iconFn(layer, midX, midY + lh / 2 + iconR + 4, iconR, chain.color);
    }
  }
}

function drawFlowTiles(
  layer: Konva.Layer,
  wall: Wall,
  profileMap: Map<string, TileProfile>,
  bounds: { x: number; y: number; w: number; h: number },
  tileInfo: Map<string, { processorName: string; portName: string; portColor: string; chainIndex: number }>,
  scale: number,
  originX: number,
  originY: number,
): void {
  for (const tile of wall.tiles) {
    const profile = profileMap.get(tile.profileId);
    if (!profile) continue;

    const info = tileInfo.get(tile.id);
    const tx = originX + (tile.x - bounds.x) * scale;
    const ty = originY + (tile.y - bounds.y) * scale;
    const tw = profile.pixelWidth  * scale;
    const th = profile.pixelHeight * scale;
    const minDim = Math.min(tw, th);

    const radius  = clamp(minDim * 0.045, 3, 12);
    const strokeW = info ? clamp(minDim * 0.022, 2, 6) : 0.6;

    layer.add(new Konva.Rect({
      x: tx, y: ty, width: tw, height: th,
      fill:        info ? `${info.portColor}2e` : 'rgba(255,255,255,0.04)',
      stroke:      info ? info.portColor : 'rgba(255,255,255,0.12)',
      strokeWidth: strokeW,
      cornerRadius: radius,
      listening: false,
    }));

    if (!info) continue;

    // Left accent bar
    const barW = clamp(minDim * 0.038, 5, 14);
    layer.add(new Konva.Rect({
      x: tx + strokeW * 0.5, y: ty + strokeW * 0.5,
      width: barW, height: th - strokeW,
      fill: info.portColor, cornerRadius: [radius, 0, 0, radius], listening: false,
    }));

    // Three label lines — BIGGER text
    const fontSize = clamp(minDim * 0.155, 12, 26);
    const lineH    = fontSize * 1.72;
    const padLeft  = barW + clamp(fontSize * 0.55, 7, 18);
    const padTop   = clamp(fontSize * 0.52, 7, 18);

    ([
      { text: info.processorName,      fam: FONT_SANS, style: 'bold',   fill: 'rgba(255,255,255,0.96)' },
      { text: `Port ${info.portName}`, fam: FONT_MONO, style: 'normal', fill: 'rgba(255,255,255,0.58)' },
      { text: `Tile ${info.chainIndex}`,fam: FONT_MONO, style: 'bold',   fill: info.portColor           },
    ] as { text: string; fam: string; style: string; fill: string }[]).forEach(({ text, fam, style, fill }, i) => {
      layer.add(new Konva.Text({
        x: tx + padLeft, y: ty + padTop + i * lineH,
        text, fontSize, fontFamily: fam, fontStyle: style, fill,
        width: tw - padLeft - strokeW * 2, ellipsis: true, listening: false,
      }));
    });

    // Chain-index badge — top-right corner
    const bsz = clamp(minDim * 0.26, 20, 38);
    const bfs = clamp(bsz * 0.5,  10, 20);
    layer.add(new Konva.Rect({
      x: tx + tw - bsz - strokeW, y: ty + strokeW,
      width: bsz, height: bsz,
      fill: info.portColor, cornerRadius: [0, radius, 0, radius * 0.5], listening: false,
    }));
    layer.add(new Konva.Text({
      x: tx + tw - bsz - strokeW, y: ty + strokeW + (bsz - bfs) / 2,
      text: String(info.chainIndex),
      fontSize: bfs, fontFamily: FONT_MONO, fontStyle: 'bold',
      fill: '#fff', width: bsz, align: 'center', listening: false,
    }));
  }
}

function drawFlowArrows(
  layer: Konva.Layer,
  wall: Wall,
  profileMap: Map<string, TileProfile>,
  bounds: { x: number; y: number; w: number; h: number },
  ports: PortWithProcessor[],
  scale: number,
  originX: number,
  originY: number,
): void {
  drawChainArrows(layer, wall, profileMap, bounds, ports, scale, originX, originY, drawEthernetIcon);
}

export async function renderDataFlowExport(
  wall: Wall,
  _wallIndex: number,
  project: Project,
  opts: ExportOptions,
): Promise<string> {
  const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const bounds = wallBounds(wall, profileMap);

  if (bounds.w === 0 || bounds.h === 0) {
    const { stage, layer, container } = mountStage(400, 120);
    addRect(layer, { x: 0, y: 0, width: 400, height: 120, fill: '#090d14' });
    layer.add(new Konva.Text({ x: 20, y: 50, text: 'No tiles on this wall', fontSize: 13, fill: 'rgba(255,255,255,0.3)', fontFamily: FONT_SANS, listening: false }));
    const url = stage.toDataURL({ mimeType: mimeType(opts.format) });
    teardown(stage, container);
    return url;
  }

  const { ports, tileInfo } = buildTileFlowMap(wall.id, project);

  const HEADER_H = 104;
  const FOOTER_H = 64;
  const TILE_PAD = 48;
  const TARGET_W = 2600;
  const scale = Math.max(1, Math.min(8, (TARGET_W - TILE_PAD * 2) / bounds.w));

  const tileAreaW = Math.round(bounds.w * scale);
  const tileAreaH = Math.round(bounds.h * scale);
  const stageW = tileAreaW + TILE_PAD * 2;
  const stageH = tileAreaH + TILE_PAD * 2 + HEADER_H + FOOTER_H;
  const { stage, layer, container } = mountStage(stageW, stageH);

  // Background
  addRect(layer, { x: 0, y: 0, width: stageW, height: stageH, fill: '#090d14' });

  // Header bar
  addRect(layer, { x: 0, y: 0, width: stageW, height: HEADER_H, fill: '#0d1220' });
  layer.add(new Konva.Rect({ x: 0, y: 0, width: 6, height: HEADER_H, fill: '#4a9eff', listening: false }));
  layer.add(new Konva.Text({
    x: 26, y: 14,
    text: `Data Flow Map — ${wall.name}`,
    fontSize: 30, fontFamily: FONT_SANS, fontStyle: 'bold',
    fill: 'rgba(255,255,255,0.94)', listening: false,
  }));
  layer.add(new Konva.Text({
    x: 26, y: 56,
    text: opts.viewDirection === 'back' ? 'Back View' : 'Front View',
    fontSize: 14, fontFamily: FONT_SANS, fontStyle: 'bold',
    fill: opts.viewDirection === 'back' ? '#f97316' : '#4a9eff', listening: false,
  }));
  layer.add(new Konva.Text({
    x: 130, y: 60,
    text: `${project.name}  ·  ${bounds.w} × ${bounds.h} px  ·  ${wall.tiles.length} tile${wall.tiles.length !== 1 ? 's' : ''}  ·  ${ports.length} port${ports.length !== 1 ? 's' : ''}`,
    fontSize: 13, fontFamily: FONT_MONO,
    fill: 'rgba(255,255,255,0.38)', listening: false,
  }));
  layer.add(new Konva.Line({ points: [0, HEADER_H, stageW, HEADER_H], stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1, listening: false }));

  const originX = TILE_PAD;
  const originY = HEADER_H + TILE_PAD;
  addRect(layer, { x: 0, y: HEADER_H, width: stageW, height: tileAreaH + TILE_PAD * 2, fill: '#0b1018' });

  // Dot grid inside tile area — single shape, one canvas2d call
  { const gridStep = Math.max(24, Math.round(60 / scale) * scale);
    const gx0 = originX + gridStep, gy0 = originY + gridStep;
    const gx1 = originX + tileAreaW, gy1 = originY + tileAreaH;
    layer.add(new Konva.Shape({
      sceneFunc(ctx) {
        ctx.beginPath();
        for (let dx = gx0; dx < gx1; dx += gridStep)
          for (let dy = gy0; dy < gy1; dy += gridStep) {
            ctx.moveTo(dx + 1.2, dy);
            ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
          }
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
      },
      listening: false,
    }));
  }

  // Tile area border
  layer.add(new Konva.Rect({
    x: originX - 1, y: originY - 1, width: tileAreaW + 2, height: tileAreaH + 2,
    fill: 'transparent', stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1,
    listening: false,
  }));

  // Watermark — centred in tile area, very faint
  drawWatermark(layer, 'DATA FLOW MAP', originX + tileAreaW / 2, originY + tileAreaH / 2, tileAreaW, tileAreaH);

  drawFlowTiles(layer, wall, profileMap, bounds, tileInfo, scale, originX, originY);
  drawFlowArrows(layer, wall, profileMap, bounds, ports, scale, originX, originY);

  // Footer with legend
  const footerY = stageH - FOOTER_H;
  addRect(layer, { x: 0, y: footerY, width: stageW, height: FOOTER_H, fill: '#0d1220' });
  layer.add(new Konva.Line({ points: [0, footerY, stageW, footerY], stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1, listening: false }));

  // Legend: "PORTS" label then colored pills
  layer.add(new Konva.Text({
    x: 22, y: footerY + 14,
    text: 'PORTS', fontSize: 9, fontFamily: FONT_SANS, fontStyle: 'bold',
    fill: 'rgba(255,255,255,0.22)', letterSpacing: 1.5, listening: false,
  }));

  let legendX = 22;
  const legendY = footerY + 32;
  for (const port of ports) {
    if (legendX > stageW - 60) break;
    const label = `${port.processorName} / Port ${port.name}  (${port.tileIds.length} tile${port.tileIds.length !== 1 ? 's' : ''})`;

    // Pill background
    const pillTextNode = new Konva.Text({ text: label, fontSize: 11, fontFamily: FONT_MONO });
    const pillW = pillTextNode.width() + 28;
    const pillH = 20;
    layer.add(new Konva.Rect({
      x: legendX, y: legendY,
      width: pillW, height: pillH,
      fill: `${port.color}18`, stroke: port.color, strokeWidth: 1.2,
      cornerRadius: pillH / 2, listening: false,
    }));
    // Color dot inside pill
    layer.add(new Konva.Circle({ x: legendX + 12, y: legendY + pillH / 2, radius: 4, fill: port.color, listening: false }));
    // Text
    layer.add(new Konva.Text({
      x: legendX + 20, y: legendY + (pillH - 11) / 2,
      text: label, fontSize: 11, fontFamily: FONT_MONO,
      fill: 'rgba(255,255,255,0.70)', listening: false,
    }));
    legendX += pillW + 10;
  }

  layer.batchDraw();
  const url = stage.toDataURL({ mimeType: mimeType(opts.format), pixelRatio: opts.pixelRatio });
  teardown(stage, container);

  let result = url;
  if (opts.logoDataUrl) {
    result = await compositeLogoCorner(result, opts.logoDataUrl, stageW, stageH, opts.format, opts.pixelRatio);
  }
  if (isFreeTier()) return addWatermark(result, opts.format);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL CANVAS EXPORTS — pure canvas2D helpers (zero Konva node overhead)
// ═══════════════════════════════════════════════════════════════════════════════

/** Rounded-rect path. r may be a uniform radius or [tl, tr, br, bl]. */
function c2dRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number | number[],
): void {
  let tl: number, tr: number, br: number, bl: number;
  if (Array.isArray(r)) {
    [tl = 0, tr = 0, br = 0, bl = 0] = r;
  } else {
    tl = tr = br = bl = r;
  }
  const cap = Math.min(w / 2, h / 2);
  tl = Math.min(tl, cap); tr = Math.min(tr, cap);
  br = Math.min(br, cap); bl = Math.min(bl, cap);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);   ctx.arcTo(x + w, y,     x + w, y + h, tr);
  ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x,     y + h, br);
  ctx.lineTo(x + bl, y + h);   ctx.arcTo(x,     y + h, x,     y,     bl);
  ctx.lineTo(x, y + tl);       ctx.arcTo(x,     y,     x + w, y,     tl);
  ctx.closePath();
}

/** Arrow shaft + filled arrowhead from (x1,y1) → (x2,y2). */
function c2dArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  sw: number, pLen: number, pW: number, color: string,
): void {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const ux = dx / len, uy = dy / len;
  const ex = x2 - ux * pLen, ey = y2 - uy * pLen;
  ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(ex - uy * pW * 0.5, ey + ux * pW * 0.5);
  ctx.lineTo(ex + uy * pW * 0.5, ey - ux * pW * 0.5);
  ctx.closePath(); ctx.fill();
}

export async function renderCanvasDataFlowExport(
  project: Project,
  wallsToShow: Wall[],
  opts: ExportOptions,
): Promise<string> {
  const { canvasWidth, canvasHeight } = project;
  const profileMap   = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const wallIndexMap = new Map(project.walls.map((w, i) => [w.id, i]));

  const FOOTER_H = Math.round(Math.max(44, Math.min(80, canvasHeight * 0.024)));
  const W = canvasWidth, H = canvasHeight + FOOTER_H;

  // Pure canvas2D — zero Konva node overhead, no stage/layer allocation
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'top';

  // Background
  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, W, H);

  // Dot grid — single beginPath, all dots in one fill call
  { const S = 48;
    ctx.beginPath();
    for (let dx = S; dx < W; dx += S)
      for (let dy = S; dy < canvasHeight; dy += S) {
        ctx.moveTo(dx + 0.8, dy); ctx.arc(dx, dy, 0.8, 0, Math.PI * 2);
      }
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fill();
  }

  for (const wall of wallsToShow) {
    if (wall.tiles.length === 0) continue;
    const wallIdx = wallIndexMap.get(wall.id) ?? 0;
    const wc = getWallExportColor(wallIdx);
    const { ports, tileInfo } = buildTileFlowMap(wall.id, project);
    const tileMap = new Map(wall.tiles.map((t) => [t.id, t]));

    // Unrouted tiles — faint wall-coloured outlines
    for (const tile of wall.tiles) {
      if (tileInfo.has(tile.id)) continue;
      const profile = profileMap.get(tile.profileId);
      if (!profile) continue;
      c2dRoundRect(ctx, tile.x, tile.y, profile.pixelWidth, profile.pixelHeight, 3);
      ctx.fillStyle = `${wc.bright}18`; ctx.fill();
      ctx.strokeStyle = `${wc.bright}40`; ctx.lineWidth = 0.5; ctx.stroke();
    }

    // Routed tiles — coloured by port
    for (const tile of wall.tiles) {
      const info = tileInfo.get(tile.id);
      if (!info) continue;
      const profile = profileMap.get(tile.profileId);
      if (!profile) continue;
      const tx = tile.x, ty = tile.y;
      const tw = profile.pixelWidth, th = profile.pixelHeight;
      const minDim  = Math.min(tw, th);
      const radius  = clamp(minDim * 0.045, 3, 12);
      const strokeW = clamp(minDim * 0.022, 2, 6);

      c2dRoundRect(ctx, tx, ty, tw, th, radius);
      ctx.fillStyle = `${info.portColor}2e`; ctx.fill();
      ctx.strokeStyle = info.portColor; ctx.lineWidth = strokeW; ctx.stroke();

      const barW = clamp(minDim * 0.038, 5, 14);
      c2dRoundRect(ctx, tx + strokeW * 0.5, ty + strokeW * 0.5, barW, th - strokeW, [radius, 0, 0, radius]);
      ctx.fillStyle = info.portColor; ctx.fill();

      // Labels — skip if tile is too small to read
      if (minDim >= 30) {
        const fontSize = clamp(minDim * 0.155, 12, 26);
        const lineH    = fontSize * 1.72;
        const padLeft  = barW + clamp(fontSize * 0.55, 7, 18);
        const padTop   = clamp(fontSize * 0.52, 7, 18);
        const textX    = tx + padLeft;
        const maxTxtW  = tw - padLeft - strokeW * 2;

        ctx.save();
        c2dRoundRect(ctx, tx, ty, tw, th, radius);
        ctx.clip();

        ctx.font = `bold ${fontSize}px ${FONT_SANS}`;
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.fillText(info.processorName,        textX, ty + padTop,             maxTxtW);
        ctx.font = `${fontSize}px ${FONT_MONO}`;
        ctx.fillStyle = 'rgba(255,255,255,0.58)';
        ctx.fillText(`Port ${info.portName}`,   textX, ty + padTop + lineH,     maxTxtW);
        ctx.font = `bold ${fontSize}px ${FONT_MONO}`;
        ctx.fillStyle = info.portColor;
        ctx.fillText(`Tile ${info.chainIndex}`, textX, ty + padTop + lineH * 2, maxTxtW);

        ctx.restore();
      }

      // Chain-index badge — top-right corner
      const bsz = clamp(minDim * 0.26, 20, 38);
      const bfs = clamp(bsz * 0.5, 10, 20);
      c2dRoundRect(ctx, tx + tw - bsz - strokeW, ty + strokeW, bsz, bsz, [0, radius, 0, radius * 0.5]);
      ctx.fillStyle = info.portColor; ctx.fill();
      ctx.font = `bold ${bfs}px ${FONT_MONO}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(info.chainIndex), tx + tw - bsz * 0.5 - strokeW, ty + strokeW + bsz * 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // Chain arrows — no glow pass (too expensive at full canvas scale)
    for (const port of ports) {
      if (port.tileIds.length < 2) continue;
      const centers: { cx: number; cy: number; dim: number }[] = [];
      for (const tid of port.tileIds) {
        const tile = tileMap.get(tid); if (!tile) continue;
        const prof = profileMap.get(tile.profileId); if (!prof) continue;
        centers.push({ cx: tile.x + prof.pixelWidth / 2, cy: tile.y + prof.pixelHeight / 2, dim: Math.min(prof.pixelWidth, prof.pixelHeight) });
      }
      if (centers.length < 2) continue;
      const BASE = centers.reduce((s, c) => s + c.dim, 0) / centers.length;
      const sw   = clamp(BASE * 0.028, 2,  8);
      const pLen = clamp(BASE * 0.13,  8, 32);
      const pW   = clamp(BASE * 0.10,  6, 24);
      ctx.globalAlpha = 0.88;
      for (let i = 0; i < centers.length - 1; i++)
        c2dArrow(ctx, centers[i].cx, centers[i].cy, centers[i + 1].cx, centers[i + 1].cy, sw, pLen, pW, port.color);
      ctx.globalAlpha = 1;
    }
  }

  // Watermark
  { const fs = clamp(Math.min(canvasWidth * 0.11, canvasHeight * 0.14), 38, 140);
    ctx.fillStyle = 'rgba(255,255,255,0.028)';
    ctx.font = `bold ${fs}px ${FONT_SANS}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DATA FLOW MAP', canvasWidth / 2, canvasHeight / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // Footer
  ctx.fillStyle = '#0d1119';
  ctx.fillRect(0, canvasHeight, W, FOOTER_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, canvasHeight); ctx.lineTo(W, canvasHeight); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `bold 12px ${FONT_SANS}`;
  ctx.fillText(`${project.name} — Data Flow Map`, 32, canvasHeight + 15);

  // Footer legend
  const allPorts: PortWithProcessor[] = (project.processors ?? []).flatMap((proc) =>
    proc.ports.filter((p) => p.tileIds.length > 0).map((p) => ({ ...p, processorName: proc.name })),
  );
  ctx.font = `10px ${FONT_MONO}`;
  let legendX = W - 32;
  for (let i = allPorts.length - 1; i >= 0; i--) {
    const port   = allPorts[i];
    const label  = `${port.processorName} / Port ${port.name}`;
    const labelW = ctx.measureText(label).width;
    legendX     -= labelW + 32;
    if (legendX < 200) break;
    ctx.fillStyle = port.color;
    ctx.fillRect(legendX, canvasHeight + 17, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(label, legendX + 12, canvasHeight + 16);
  }

  const dataUrl = canvas.toDataURL(mimeType(opts.format));
  let result = dataUrl;
  if (opts.logoDataUrl)
    result = await compositeLogoCorner(result, opts.logoDataUrl, W, H, opts.format, 1);
  if (isFreeTier()) return addWatermark(result, opts.format);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POWER FLOW MAP EXPORT
// Per-wall and full-canvas views showing power circuits and their tile chains.
// ═══════════════════════════════════════════════════════════════════════════════

function buildCircuitFlowMap(
  wallId: string,
  project: Project,
): {
  circuits: Circuit[];
  tileInfo: Map<string, { circuitName: string; circuitColor: string; chainIndex: number }>;
} {
  const circuits = (project.circuits ?? []).filter((c) => c.wallId === wallId);
  const tileInfo = new Map<string, { circuitName: string; circuitColor: string; chainIndex: number }>();
  for (const circuit of circuits) {
    circuit.tileIds.forEach((tid, idx) => {
      tileInfo.set(tid, { circuitName: circuit.name, circuitColor: circuit.color, chainIndex: idx + 1 });
    });
  }
  return { circuits, tileInfo };
}

function drawPowerFlowTiles(
  layer: Konva.Layer,
  wall: Wall,
  profileMap: Map<string, TileProfile>,
  bounds: { x: number; y: number; w: number; h: number },
  tileInfo: Map<string, { circuitName: string; circuitColor: string; chainIndex: number }>,
  scale: number,
  originX: number,
  originY: number,
): void {
  for (const tile of wall.tiles) {
    const profile = profileMap.get(tile.profileId);
    if (!profile) continue;

    const info = tileInfo.get(tile.id);
    const tx = originX + (tile.x - bounds.x) * scale;
    const ty = originY + (tile.y - bounds.y) * scale;
    const tw = profile.pixelWidth  * scale;
    const th = profile.pixelHeight * scale;
    const minDim = Math.min(tw, th);

    const radius  = clamp(minDim * 0.045, 3, 12);
    const strokeW = info ? clamp(minDim * 0.022, 2, 6) : 0.6;

    layer.add(new Konva.Rect({
      x: tx, y: ty, width: tw, height: th,
      fill:        info ? `${info.circuitColor}2e` : 'rgba(255,255,255,0.04)',
      stroke:      info ? info.circuitColor : 'rgba(255,255,255,0.12)',
      strokeWidth: strokeW, cornerRadius: radius, listening: false,
    }));

    if (!info) continue;

    // Left accent bar — identical structure to data flow
    const barW = clamp(minDim * 0.038, 5, 14);
    layer.add(new Konva.Rect({
      x: tx + strokeW * 0.5, y: ty + strokeW * 0.5,
      width: barW, height: th - strokeW,
      fill: info.circuitColor, cornerRadius: [radius, 0, 0, radius], listening: false,
    }));

    // Two label lines (circuit name + tile position) — BIGGER text, same scale as data flow
    const fontSize = clamp(minDim * 0.155, 12, 26);
    const lineH    = fontSize * 1.72;
    const padLeft  = barW + clamp(fontSize * 0.55, 7, 18);
    const padTop   = clamp(fontSize * 0.52, 7, 18);

    ([
      { text: info.circuitName,           fam: FONT_SANS, style: 'bold',   fill: 'rgba(255,255,255,0.96)' },
      { text: `Tile ${info.chainIndex}`,  fam: FONT_MONO, style: 'bold',   fill: info.circuitColor        },
    ] as { text: string; fam: string; style: string; fill: string }[]).forEach(({ text, fam, style, fill }, i) => {
      layer.add(new Konva.Text({
        x: tx + padLeft, y: ty + padTop + i * lineH,
        text, fontSize, fontFamily: fam, fontStyle: style, fill,
        width: tw - padLeft - strokeW * 2, ellipsis: true, listening: false,
      }));
    });

    // Chain-index badge — top-right corner (identical size formula to data flow)
    const bsz = clamp(minDim * 0.26, 20, 38);
    const bfs = clamp(bsz * 0.5, 10, 20);
    layer.add(new Konva.Rect({
      x: tx + tw - bsz - strokeW, y: ty + strokeW,
      width: bsz, height: bsz,
      fill: info.circuitColor, cornerRadius: [0, radius, 0, radius * 0.5], listening: false,
    }));
    layer.add(new Konva.Text({
      x: tx + tw - bsz - strokeW, y: ty + strokeW + (bsz - bfs) / 2,
      text: String(info.chainIndex),
      fontSize: bfs, fontFamily: FONT_MONO, fontStyle: 'bold',
      fill: '#fff', width: bsz, align: 'center', listening: false,
    }));
  }
}

function drawPowerFlowArrows(
  layer: Konva.Layer,
  wall: Wall,
  profileMap: Map<string, TileProfile>,
  bounds: { x: number; y: number; w: number; h: number },
  circuits: Circuit[],
  scale: number,
  originX: number,
  originY: number,
): void {
  drawChainArrows(layer, wall, profileMap, bounds, circuits, scale, originX, originY, drawPowerIcon);
}

export async function renderPowerFlowExport(
  wall: Wall,
  _wallIndex: number,
  project: Project,
  opts: ExportOptions,
): Promise<string> {
  const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const bounds = wallBounds(wall, profileMap);

  if (bounds.w === 0 || bounds.h === 0) {
    const { stage, layer, container } = mountStage(400, 120);
    addRect(layer, { x: 0, y: 0, width: 400, height: 120, fill: '#090d14' });
    layer.add(new Konva.Text({ x: 20, y: 50, text: 'No tiles on this wall', fontSize: 13, fill: 'rgba(255,255,255,0.3)', fontFamily: FONT_SANS, listening: false }));
    const url = stage.toDataURL({ mimeType: mimeType(opts.format) });
    teardown(stage, container);
    return url;
  }

  const { circuits, tileInfo } = buildCircuitFlowMap(wall.id, project);

  const HEADER_H = 104;
  const FOOTER_H = 64;
  const TILE_PAD = 48;
  const TARGET_W = 2600;
  const scale = Math.max(1, Math.min(8, (TARGET_W - TILE_PAD * 2) / bounds.w));

  const tileAreaW = Math.round(bounds.w * scale);
  const tileAreaH = Math.round(bounds.h * scale);
  const stageW    = tileAreaW + TILE_PAD * 2;
  const stageH    = tileAreaH + TILE_PAD * 2 + HEADER_H + FOOTER_H;
  const { stage, layer, container } = mountStage(stageW, stageH);

  // Background
  addRect(layer, { x: 0, y: 0, width: stageW, height: stageH, fill: '#090d14' });

  // Header bar with orange accent line
  addRect(layer, { x: 0, y: 0, width: stageW, height: HEADER_H, fill: '#0d1220' });
  layer.add(new Konva.Rect({ x: 0, y: 0, width: 6, height: HEADER_H, fill: '#f97316', listening: false }));
  layer.add(new Konva.Text({
    x: 26, y: 14,
    text: `Power Flow Map — ${wall.name}`,
    fontSize: 30, fontFamily: FONT_SANS, fontStyle: 'bold',
    fill: 'rgba(255,255,255,0.94)', listening: false,
  }));
  layer.add(new Konva.Text({
    x: 26, y: 56,
    text: opts.viewDirection === 'back' ? 'Back View' : 'Front View',
    fontSize: 14, fontFamily: FONT_SANS, fontStyle: 'bold',
    fill: opts.viewDirection === 'back' ? '#f97316' : '#4a9eff', listening: false,
  }));
  layer.add(new Konva.Text({
    x: 130, y: 60,
    text: `${project.name}  ·  ${bounds.w} × ${bounds.h} px  ·  ${wall.tiles.length} tile${wall.tiles.length !== 1 ? 's' : ''}  ·  ${circuits.length} circuit${circuits.length !== 1 ? 's' : ''}`,
    fontSize: 13, fontFamily: FONT_MONO,
    fill: 'rgba(255,255,255,0.38)', listening: false,
  }));
  layer.add(new Konva.Line({ points: [0, HEADER_H, stageW, HEADER_H], stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1, listening: false }));

  const originX = TILE_PAD;
  const originY = HEADER_H + TILE_PAD;
  addRect(layer, { x: 0, y: HEADER_H, width: stageW, height: tileAreaH + TILE_PAD * 2, fill: '#0b1018' });

  // Dot grid — single shape, one canvas2d call
  { const gridStep = Math.max(24, Math.round(60 / scale) * scale);
    const gx0 = originX + gridStep, gy0 = originY + gridStep;
    const gx1 = originX + tileAreaW, gy1 = originY + tileAreaH;
    layer.add(new Konva.Shape({
      sceneFunc(ctx) {
        ctx.beginPath();
        for (let dx = gx0; dx < gx1; dx += gridStep)
          for (let dy = gy0; dy < gy1; dy += gridStep) {
            ctx.moveTo(dx + 1.2, dy);
            ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
          }
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
      },
      listening: false,
    }));
  }

  // Tile area border
  layer.add(new Konva.Rect({
    x: originX - 1, y: originY - 1, width: tileAreaW + 2, height: tileAreaH + 2,
    fill: 'transparent', stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1, listening: false,
  }));

  // Watermark — centred in tile area, very faint
  drawWatermark(layer, 'POWER FLOW MAP', originX + tileAreaW / 2, originY + tileAreaH / 2, tileAreaW, tileAreaH);

  drawPowerFlowTiles(layer, wall, profileMap, bounds, tileInfo, scale, originX, originY);
  drawPowerFlowArrows(layer, wall, profileMap, bounds, circuits, scale, originX, originY);

  // Footer with legend
  const footerY = stageH - FOOTER_H;
  addRect(layer, { x: 0, y: footerY, width: stageW, height: FOOTER_H, fill: '#0d1220' });
  layer.add(new Konva.Line({ points: [0, footerY, stageW, footerY], stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1, listening: false }));
  layer.add(new Konva.Text({
    x: 22, y: footerY + 14,
    text: 'CIRCUITS', fontSize: 9, fontFamily: FONT_SANS, fontStyle: 'bold',
    fill: 'rgba(255,255,255,0.22)', letterSpacing: 1.5, listening: false,
  }));

  let legendX = 22;
  const legendY = footerY + 32;
  for (const circuit of circuits) {
    if (legendX > stageW - 60) break;
    const label = `${circuit.name}  (${circuit.tileIds.length} tile${circuit.tileIds.length !== 1 ? 's' : ''})`;
    const pillTextNode = new Konva.Text({ text: label, fontSize: 11, fontFamily: FONT_MONO });
    const pillW = pillTextNode.width() + 28;
    const pillH = 20;
    layer.add(new Konva.Rect({
      x: legendX, y: legendY, width: pillW, height: pillH,
      fill: `${circuit.color}18`, stroke: circuit.color, strokeWidth: 1.2,
      cornerRadius: pillH / 2, listening: false,
    }));
    layer.add(new Konva.Circle({ x: legendX + 12, y: legendY + pillH / 2, radius: 4, fill: circuit.color, listening: false }));
    layer.add(new Konva.Text({
      x: legendX + 20, y: legendY + (pillH - 11) / 2,
      text: label, fontSize: 11, fontFamily: FONT_MONO,
      fill: 'rgba(255,255,255,0.70)', listening: false,
    }));
    legendX += pillW + 10;
  }

  layer.batchDraw();
  const url = stage.toDataURL({ mimeType: mimeType(opts.format), pixelRatio: opts.pixelRatio });
  teardown(stage, container);

  let result = url;
  if (opts.logoDataUrl) {
    result = await compositeLogoCorner(result, opts.logoDataUrl, stageW, stageH, opts.format, opts.pixelRatio);
  }
  if (isFreeTier()) return addWatermark(result, opts.format);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POWER FLOW MAP EXPORT — full canvas (pure canvas2D, no Konva node overhead)
// ═══════════════════════════════════════════════════════════════════════════════

export async function renderCanvasPowerFlowExport(
  project: Project,
  wallsToShow: Wall[],
  opts: ExportOptions,
): Promise<string> {
  const { canvasWidth, canvasHeight } = project;
  const profileMap   = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const wallIndexMap = new Map(project.walls.map((w, i) => [w.id, i]));

  const FOOTER_H = Math.round(Math.max(44, Math.min(80, canvasHeight * 0.024)));
  const W = canvasWidth, H = canvasHeight + FOOTER_H;

  // Pure canvas2D — zero Konva node overhead
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'top';

  // Background
  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, W, H);

  // Dot grid — single beginPath, all dots in one fill call
  { const S = 48;
    ctx.beginPath();
    for (let dx = S; dx < W; dx += S)
      for (let dy = S; dy < canvasHeight; dy += S) {
        ctx.moveTo(dx + 0.8, dy); ctx.arc(dx, dy, 0.8, 0, Math.PI * 2);
      }
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fill();
  }

  for (const wall of wallsToShow) {
    if (wall.tiles.length === 0) continue;
    const wallIdx = wallIndexMap.get(wall.id) ?? 0;
    const wc = getWallExportColor(wallIdx);
    const { circuits, tileInfo } = buildCircuitFlowMap(wall.id, project);
    const tileMap = new Map(wall.tiles.map((t) => [t.id, t]));

    // Unrouted tiles — faint wall-coloured outlines
    for (const tile of wall.tiles) {
      if (tileInfo.has(tile.id)) continue;
      const profile = profileMap.get(tile.profileId);
      if (!profile) continue;
      c2dRoundRect(ctx, tile.x, tile.y, profile.pixelWidth, profile.pixelHeight, 3);
      ctx.fillStyle = `${wc.bright}18`; ctx.fill();
      ctx.strokeStyle = `${wc.bright}40`; ctx.lineWidth = 0.5; ctx.stroke();
    }

    // Routed tiles — coloured by circuit
    for (const tile of wall.tiles) {
      const info = tileInfo.get(tile.id);
      if (!info) continue;
      const profile = profileMap.get(tile.profileId);
      if (!profile) continue;
      const tx = tile.x, ty = tile.y;
      const tw = profile.pixelWidth, th = profile.pixelHeight;
      const minDim  = Math.min(tw, th);
      const radius  = clamp(minDim * 0.045, 3, 12);
      const strokeW = clamp(minDim * 0.022, 2, 6);

      c2dRoundRect(ctx, tx, ty, tw, th, radius);
      ctx.fillStyle = `${info.circuitColor}2e`; ctx.fill();
      ctx.strokeStyle = info.circuitColor; ctx.lineWidth = strokeW; ctx.stroke();

      const barW = clamp(minDim * 0.038, 5, 14);
      c2dRoundRect(ctx, tx + strokeW * 0.5, ty + strokeW * 0.5, barW, th - strokeW, [radius, 0, 0, radius]);
      ctx.fillStyle = info.circuitColor; ctx.fill();

      if (minDim >= 30) {
        const fontSize = clamp(minDim * 0.155, 12, 26);
        const lineH    = fontSize * 1.72;
        const padLeft  = barW + clamp(fontSize * 0.55, 7, 18);
        const padTop   = clamp(fontSize * 0.52, 7, 18);
        const textX    = tx + padLeft;
        const maxTxtW  = tw - padLeft - strokeW * 2;

        ctx.save();
        c2dRoundRect(ctx, tx, ty, tw, th, radius);
        ctx.clip();

        ctx.font = `bold ${fontSize}px ${FONT_SANS}`;
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.fillText(info.circuitName,          textX, ty + padTop,         maxTxtW);
        ctx.font = `bold ${fontSize}px ${FONT_MONO}`;
        ctx.fillStyle = info.circuitColor;
        ctx.fillText(`Tile ${info.chainIndex}`, textX, ty + padTop + lineH, maxTxtW);

        ctx.restore();
      }

      const bsz = clamp(minDim * 0.26, 20, 38);
      const bfs = clamp(bsz * 0.5, 10, 20);
      c2dRoundRect(ctx, tx + tw - bsz - strokeW, ty + strokeW, bsz, bsz, [0, radius, 0, radius * 0.5]);
      ctx.fillStyle = info.circuitColor; ctx.fill();
      ctx.font = `bold ${bfs}px ${FONT_MONO}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(info.chainIndex), tx + tw - bsz * 0.5 - strokeW, ty + strokeW + bsz * 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // Circuit chain arrows — no glow pass at full canvas scale
    for (const circuit of circuits) {
      if (circuit.tileIds.length < 2) continue;
      const centers: { cx: number; cy: number; dim: number }[] = [];
      for (const tid of circuit.tileIds) {
        const tile = tileMap.get(tid); if (!tile) continue;
        const prof = profileMap.get(tile.profileId); if (!prof) continue;
        centers.push({ cx: tile.x + prof.pixelWidth / 2, cy: tile.y + prof.pixelHeight / 2, dim: Math.min(prof.pixelWidth, prof.pixelHeight) });
      }
      if (centers.length < 2) continue;
      const BASE = centers.reduce((s, c) => s + c.dim, 0) / centers.length;
      const sw   = clamp(BASE * 0.028, 2,  8);
      const pLen = clamp(BASE * 0.13,  8, 32);
      const pW   = clamp(BASE * 0.10,  6, 24);
      ctx.globalAlpha = 0.88;
      for (let i = 0; i < centers.length - 1; i++)
        c2dArrow(ctx, centers[i].cx, centers[i].cy, centers[i + 1].cx, centers[i + 1].cy, sw, pLen, pW, circuit.color);
      ctx.globalAlpha = 1;
    }
  }

  // Watermark
  { const fs = clamp(Math.min(canvasWidth * 0.11, canvasHeight * 0.14), 38, 140);
    ctx.fillStyle = 'rgba(255,255,255,0.028)';
    ctx.font = `bold ${fs}px ${FONT_SANS}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('POWER FLOW MAP', canvasWidth / 2, canvasHeight / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // Footer
  ctx.fillStyle = '#0d1220';
  ctx.fillRect(0, canvasHeight, W, FOOTER_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, canvasHeight); ctx.lineTo(W, canvasHeight); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `bold 12px ${FONT_SANS}`;
  ctx.fillText(`${project.name} — Power Flow Map`, 32, canvasHeight + 15);

  // Footer legend
  const allCircuits = (project.circuits ?? []).filter((c) => c.tileIds.length > 0);
  ctx.font = `10px ${FONT_MONO}`;
  let legendX = W - 32;
  for (let i = allCircuits.length - 1; i >= 0; i--) {
    const c      = allCircuits[i];
    const label  = c.name;
    const labelW = ctx.measureText(label).width;
    legendX     -= labelW + 32;
    if (legendX < 200) break;
    ctx.fillStyle = c.color;
    ctx.fillRect(legendX, canvasHeight + 17, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(label, legendX + 12, canvasHeight + 16);
  }

  const dataUrl = canvas.toDataURL(mimeType(opts.format));
  let result = dataUrl;
  if (opts.logoDataUrl)
    result = await compositeLogoCorner(result, opts.logoDataUrl, W, H, opts.format, 1);
  if (isFreeTier()) return addWatermark(result, opts.format);
  return result;
}

// ── Free-tier watermark ───────────────────────────────────────────────────────

async function addWatermark(dataUrl: string, format: 'png' | 'jpg'): Promise<string> {
  const [baseImg, logoImg] = await Promise.all([
    loadImage(dataUrl),
    loadImage('./logo.png').catch(() => null),
  ]);

  const canvas  = document.createElement('canvas');
  canvas.width  = baseImg.width;
  canvas.height = baseImg.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(baseImg, 0, 0);

  if (logoImg) {
    const maxW = canvas.width  * 0.65;
    const maxH = canvas.height * 0.65;
    const s    = Math.min(maxW / logoImg.width, maxH / logoImg.height);
    const lw   = logoImg.width  * s;
    const lh   = logoImg.height * s;
    const lx   = (canvas.width  - lw) / 2;
    const ly   = (canvas.height - lh) / 2;
    ctx.globalAlpha = 0.42;
    ctx.drawImage(logoImg, lx, ly, lw, lh);
    ctx.globalAlpha = 1;
  }

  // Stamp "FREE VERSION" text
  const fontSize = Math.max(18, Math.min(canvas.width * 0.035, 64));
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font       = `900 ${fontSize}px sans-serif`;
  ctx.fillStyle  = 'rgba(255,255,255,0.22)';
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  const repeat = Math.ceil(canvas.height / (fontSize * 3)) + 2;
  for (let i = -repeat; i <= repeat; i++) {
    ctx.fillText('FREE VERSION  LED PIXEL MAPPER', 0, i * fontSize * 3);
  }
  ctx.restore();

  return canvas.toDataURL(mimeType(format));
}

/** Returns true if the current user is on free tier (watermark should be applied). */
function isFreeTier(): boolean {
  return !useLicenseStore.getState().isPro;
}

// ── Logo compositing ──────────────────────────────────────────────────────────

async function compositeLogoFooter(
  baseDataURL: string,
  logoDataURL: string,
  canvasWidth: number,
  canvasHeight: number,
  footerH: number,
  padX: number,
  format: 'png' | 'jpg',
  pixelRatio = 2,
): Promise<string> {
  const [baseImg, logoImg] = await Promise.all([
    loadImage(baseDataURL),
    loadImage(logoDataURL).catch(() => null),
  ]);
  if (!logoImg) return baseDataURL;

  const canvas  = document.createElement('canvas');
  canvas.width  = canvasWidth  * pixelRatio;
  canvas.height = canvasHeight * pixelRatio;
  const ctx     = canvas.getContext('2d')!;
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

  const maxLogoH = (footerH - 10) * pixelRatio;
  const maxLogoW = 380 * pixelRatio;
  const s  = Math.min(1, maxLogoH / logoImg.height, maxLogoW / logoImg.width);
  const lw = logoImg.width  * s;
  const lh = logoImg.height * s;
  const footerTop = (canvasHeight - footerH) * pixelRatio;
  const logoX     = (canvas.width * 0.5) + ((canvas.width * 0.5 - lw) / 2) - padX * pixelRatio * 0.5;
  const logoY     = footerTop + (footerH * pixelRatio - lh) / 2;
  ctx.globalAlpha = 0.82;
  ctx.drawImage(logoImg, logoX, logoY, lw, lh);
  ctx.globalAlpha = 1;
  return canvas.toDataURL(mimeType(format));
}

async function compositeLogoCorner(
  baseDataURL: string,
  logoDataURL: string,
  canvasWidth: number,
  canvasHeight: number,
  format: 'png' | 'jpg',
  pixelRatio = 2,
): Promise<string> {
  const [baseImg, logoImg] = await Promise.all([
    loadImage(baseDataURL),
    loadImage(logoDataURL).catch(() => null),
  ]);
  if (!logoImg) return baseDataURL;

  const canvas  = document.createElement('canvas');
  canvas.width  = canvasWidth  * pixelRatio;
  canvas.height = canvasHeight * pixelRatio;
  const ctx     = canvas.getContext('2d')!;
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

  const maxW = 320 * pixelRatio;
  const maxH = 100 * pixelRatio;
  const s    = Math.min(1, maxW / logoImg.width, maxH / logoImg.height);
  const lw   = logoImg.width  * s;
  const lh   = logoImg.height * s;
  const m    = 20 * pixelRatio;
  ctx.globalAlpha = 0.90;
  ctx.drawImage(logoImg, canvas.width - lw - m, canvas.height - lh - m, lw, lh);
  ctx.globalAlpha = 1;
  return canvas.toDataURL(mimeType(format));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST CARD SVG EXPORT
// Generates a broadcast-style test card in SVG format.
// Color scheme: dark teal (distinct from the reference blue version).
// Contains: gradient bg, mosaic pattern, grid, diagonals, crosshair,
//           dashed circle, hexagon, center badge, color bars, grayscale ramp,
//           corner markers, corner coordinates, corner triangles, footer.
// ═══════════════════════════════════════════════════════════════════════════════

export function generateTestCardSVG(wall: Wall, _wallIndex: number, project: Project): string {
  const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const bounds = wallBounds(wall, profileMap);
  const W = bounds.w > 0 ? bounds.w : project.canvasWidth;
  const H = bounds.h > 0 ? bounds.h : project.canvasHeight;
  const MX = W / 2;
  const MY = H / 2;

  // ── Color scheme: dark teal ──────────────────────────────────────────────
  const BG_TOP     = '#03090c';
  const BG_BTM     = '#071c22';
  const ACC        = '#2dd4bf';   // teal-400
  const ACC_BRIGHT = '#5eead4';   // teal-300
  const ACC_DIM    = '#0f766e';   // teal-700
  const GRID_MAJ   = 'rgba(45,212,191,0.28)';
  const GRID_MIN   = 'rgba(45,212,191,0.09)';
  const GRID_DIAG  = 'rgba(45,212,191,0.08)';
  const CROSS      = 'rgba(45,212,191,0.55)';
  const MUTED      = 'rgba(255,255,255,0.32)';
  const WHITE      = '#ffffff';

  // ── Proportional sizing ──────────────────────────────────────────────────
  const GRID_STEP   = Math.round(W / 16);
  const BAR_H       = Math.round(H * 0.085);
  const GRAY_H      = Math.round(H * 0.062);
  const FOOT_H      = Math.round(H * 0.026);
  const HEX_R       = Math.round(Math.min(W, H) * 0.036);
  const MARK_R      = Math.round(Math.min(W, H) * 0.024);
  const SPOKE_LEN   = Math.round(Math.min(W, H) * 0.11);
  const CIRC_R      = Math.round(Math.min(W, H) * 0.27);
  const CORNER_LEN  = Math.round(Math.min(W, H) * 0.17);
  const TRI_SZ      = Math.round(Math.min(W, H) * 0.038);
  const BADGE_W     = Math.round(W * 0.20);
  const BADGE_H     = Math.round(H * 0.075);
  const BADGE_RX    = Math.round(BADGE_H * 0.12);
  const SW          = Math.max(1, Math.round(W / 2000));
  const SW_THIN     = Math.max(0.5, SW * 0.45);
  const FS_MAIN     = Math.round(H * 0.021);
  const FS_SUB      = Math.round(H * 0.013);
  const FS_CORNER   = Math.round(H * 0.010);
  const FS_FOOT     = Math.round(H * 0.009);

  // ── SVG builder helpers ──────────────────────────────────────────────────
  const r = (n: number) => Math.round(n * 10) / 10;
  const parts: string[] = [];

  const ln = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, dash?: string) =>
    `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

  const rc = (x: number, y: number, w: number, h: number, fill: string, rx?: number, stroke?: string, sw?: number) =>
    `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${fill}"${rx != null ? ` rx="${rx}"` : ''}${stroke ? ` stroke="${stroke}" stroke-width="${sw ?? 1}"` : ''}/>`;

  const ci = (cx: number, cy: number, rr: number, stroke: string, sw: number, fill = 'none', dash?: string) =>
    `<circle cx="${r(cx)}" cy="${r(cy)}" r="${rr}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

  const tx = (x: number, y: number, content: string, fs: number, fill: string, anchor = 'middle', weight = '400') =>
    `<text x="${r(x)}" y="${r(y)}" font-size="${fs}" fill="${fill}" font-family="'Inter','Segoe UI',sans-serif" text-anchor="${anchor}" dominant-baseline="middle" font-weight="${weight}">${content}</text>`;

  function hexPoly(cx: number, cy: number, rad: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      pts.push(`${r(cx + rad * Math.cos(a))},${r(cy + rad * Math.sin(a))}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="none" stroke="${ACC}" stroke-width="${SW * 1.5}"/>`;
  }

  // ── 1. Defs ──────────────────────────────────────────────────────────────
  parts.push(`<defs>
  <linearGradient id="tcBg" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%" stop-color="${BG_TOP}"/>
    <stop offset="100%" stop-color="${BG_BTM}"/>
  </linearGradient>
  <radialGradient id="tcGlow" cx="50%" cy="50%" r="45%">
    <stop offset="0%" stop-color="${ACC_DIM}" stop-opacity="0.20"/>
    <stop offset="100%" stop-color="${BG_TOP}" stop-opacity="0"/>
  </radialGradient>
</defs>`);

  // ── 2. Background ────────────────────────────────────────────────────────
  parts.push(rc(0, 0, W, H, 'url(#tcBg)'));
  parts.push(rc(0, 0, W, H, 'url(#tcGlow)'));

  // ── 3. Triangular mosaic (background decoration) ─────────────────────────
  const MOSAIC = Math.round(W / 28);
  const mAlpha = [0.05, 0.03, 0.06, 0.04, 0.07, 0.03, 0.05, 0.04];
  for (let mx = 0; mx < W; mx += MOSAIC) {
    for (let my = 0; my < H; my += MOSAIC) {
      const idx = ((mx / MOSAIC | 0) + (my / MOSAIC | 0)) % mAlpha.length;
      const a1 = mAlpha[idx];
      const a2 = mAlpha[(idx + 1) % mAlpha.length];
      const x2 = mx + MOSAIC, y2 = my + MOSAIC;
      parts.push(`<polygon points="${mx},${my} ${x2},${my} ${mx},${y2}" fill="${ACC}" fill-opacity="${a1}"/>`);
      parts.push(`<polygon points="${x2},${my} ${x2},${y2} ${mx},${y2}" fill="${ACC}" fill-opacity="${a2}"/>`);
    }
  }

  // ── 4. Minor grid lines ──────────────────────────────────────────────────
  const MINOR = GRID_STEP / 4;
  for (let x = MINOR; x < W; x += MINOR) {
    if (Math.round(x) % GRID_STEP !== 0) parts.push(ln(x, 0, x, H, GRID_MIN, SW_THIN));
  }
  for (let y = MINOR; y < H; y += MINOR) {
    if (Math.round(y) % GRID_STEP !== 0) parts.push(ln(0, y, W, y, GRID_MIN, SW_THIN));
  }

  // ── 5. Major grid lines ──────────────────────────────────────────────────
  for (let x = GRID_STEP; x < W; x += GRID_STEP) parts.push(ln(x, 0, x, H, GRID_MAJ, SW));
  for (let y = GRID_STEP; y < H; y += GRID_STEP) parts.push(ln(0, y, W, y, GRID_MAJ, SW));

  // ── 6. Diagonal fine lines per grid cell ─────────────────────────────────
  for (let gx = 0; gx < W; gx += GRID_STEP) {
    for (let gy = 0; gy < H; gy += GRID_STEP) {
      const x2 = Math.min(gx + GRID_STEP, W);
      const y2 = Math.min(gy + GRID_STEP, H);
      parts.push(ln(gx, gy, x2, y2, GRID_DIAG, SW_THIN));
      parts.push(ln(x2, gy, gx, y2, GRID_DIAG, SW_THIN));
    }
  }

  // ── 7. Center crosshair ───────────────────────────────────────────────────
  parts.push(ln(0, MY, W, MY, CROSS, SW * 2));
  parts.push(ln(MX, 0, MX, H, CROSS, SW * 2));

  // ── 8. Corner dashed lines ────────────────────────────────────────────────
  const cDash = `${GRID_STEP * 0.45},${GRID_STEP * 0.28}`;
  const cStroke = 'rgba(45,212,191,0.38)';
  parts.push(ln(0, 0, CORNER_LEN, CORNER_LEN, cStroke, SW, cDash));
  parts.push(ln(W, 0, W - CORNER_LEN, CORNER_LEN, cStroke, SW, cDash));
  parts.push(ln(0, H, CORNER_LEN, H - CORNER_LEN, cStroke, SW, cDash));
  parts.push(ln(W, H, W - CORNER_LEN, H - CORNER_LEN, cStroke, SW, cDash));

  // ── 9. Dashed center circle ───────────────────────────────────────────────
  const circDash = `${GRID_STEP * 0.5},${GRID_STEP * 0.22}`;
  parts.push(ci(MX, MY, CIRC_R, 'rgba(45,212,191,0.32)', SW, 'none', circDash));

  // ── 10. Center hexagon with spokes ────────────────────────────────────────
  parts.push(hexPoly(MX, MY, HEX_R));
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    parts.push(ln(MX, MY, MX + SPOKE_LEN * Math.cos(a), MY + SPOKE_LEN * Math.sin(a), 'rgba(45,212,191,0.28)', SW));
  }
  parts.push(ci(MX, MY, HEX_R * 0.22, ACC, SW * 1.5, 'rgba(45,212,191,0.18)'));

  // ── 11. Center label badge ────────────────────────────────────────────────
  const BADGE_H3 = Math.round(BADGE_H * 1.35);
  parts.push(rc(MX - BADGE_W / 2, MY - BADGE_H3 / 2, BADGE_W, BADGE_H3, 'rgba(3,9,12,0.88)', BADGE_RX, ACC, SW));
  parts.push(tx(MX, MY - FS_MAIN * 0.85, wall.name, FS_MAIN, WHITE, 'middle', '700'));
  parts.push(tx(MX, MY + FS_SUB * 0.2, `${W} \u00d7 ${H} px`, FS_SUB, ACC_BRIGHT));
  parts.push(tx(MX, MY + FS_SUB * 1.5, project.name, Math.round(FS_SUB * 0.85), MUTED));

  // ── 12. Top color bars ────────────────────────────────────────────────────
  const swatches = ['#ffffff','#ffff00','#00ffff','#00ff00','#ff0000','#ff7f00'];
  const swNames  = ['WHITE','YELLOW','CYAN','GREEN','RED','ORANGE'];
  const swW = W / swatches.length;
  const swFS = Math.round(BAR_H * 0.22);
  for (let i = 0; i < swatches.length; i++) {
    parts.push(rc(i * swW, 0, swW, BAR_H, swatches[i]));
    const lc = swatches[i] === '#ffffff' || swatches[i] === '#ffff00' || swatches[i] === '#00ffff' || swatches[i] === '#00ff00' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)';
    parts.push(tx(i * swW + swW / 2, BAR_H / 2, swNames[i], swFS, lc, 'middle', '700'));
  }

  // ── 13. Grayscale ramp ────────────────────────────────────────────────────
  const STEPS = 12;
  const gsW = W / STEPS;
  const grayY = H - GRAY_H - FOOT_H;
  const gsFS = Math.round(GRAY_H * 0.20);
  for (let i = 0; i < STEPS; i++) {
    const v = Math.round((i / (STEPS - 1)) * 255);
    const hex = v.toString(16).padStart(2, '0');
    parts.push(rc(i * gsW, grayY, gsW, GRAY_H, `#${hex}${hex}${hex}`));
    const lc = v < 128 ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.60)';
    parts.push(tx(i * gsW + gsW / 2, grayY + GRAY_H / 2, `${Math.round(v / 2.55)}%`, gsFS, lc));
  }

  // ── 14. Corner registration markers ──────────────────────────────────────
  const cornerDefs = [
    { x: 0, y: 0,  lbl: '0,0',          ax: 'start' as const,  ly: MARK_R + FS_CORNER * 2 },
    { x: W, y: 0,  lbl: `${W},0`,       ax: 'end'   as const,  ly: MARK_R + FS_CORNER * 2 },
    { x: 0, y: H,  lbl: `0,${H}`,       ax: 'start' as const,  ly: -MARK_R - FS_CORNER    },
    { x: W, y: H,  lbl: `${W},${H}`,    ax: 'end'   as const,  ly: -MARK_R - FS_CORNER    },
  ];
  for (const { x: cx2, y: cy2, lbl, ax, ly } of cornerDefs) {
    const dx = cx2 === 0 ? 1 : -1;
    const dy = cy2 === 0 ? 1 : -1;
    const arm = MARK_R * 1.8;
    parts.push(ci(cx2, cy2, MARK_R, ACC, SW));
    parts.push(ci(cx2, cy2, MARK_R * 0.18, ACC, 0, ACC));
    parts.push(ln(cx2, cy2 + MARK_R * dy * 0.6, cx2, cy2 + arm * dy, ACC, SW));
    parts.push(ln(cx2 + MARK_R * dx * 0.6, cy2, cx2 + arm * dx, cy2, ACC, SW));
    const lx = cx2 === 0 ? cx2 + MARK_R + 6 : cx2 - MARK_R - 6;
    parts.push(tx(lx, cy2 + ly, lbl, FS_CORNER, ACC_BRIGHT, ax));
  }

  // ── 15. Corner accent triangles ───────────────────────────────────────────
  parts.push(`<polygon points="0,0 ${TRI_SZ},0 0,${TRI_SZ}" fill="#fbbf24" fill-opacity="0.82"/>`);
  parts.push(`<polygon points="${W},0 ${W - TRI_SZ},0 ${W},${TRI_SZ}" fill="#fbbf24" fill-opacity="0.82"/>`);
  parts.push(`<polygon points="0,${H} ${TRI_SZ},${H} 0,${H - TRI_SZ}" fill="#fbbf24" fill-opacity="0.82"/>`);
  parts.push(`<polygon points="${W},${H} ${W - TRI_SZ},${H} ${W},${H - TRI_SZ}" fill="#fbbf24" fill-opacity="0.82"/>`);

  // ── 16. Footer strip ──────────────────────────────────────────────────────
  const footY = H - FOOT_H;
  parts.push(rc(0, footY, W, FOOT_H, 'rgba(3,9,12,0.92)'));
  parts.push(ln(0, footY, W, footY, ACC, SW * 0.5));
  const footTxt = `SAFE FRAME \u00b7 TILE MAPPING REFERENCE  \u00b7\u00b7  ${wall.name}  \u00b7\u00b7  ${project.name}  \u00b7\u00b7  ${W} \u00d7 ${H} px`;
  parts.push(tx(W / 2, footY + FOOT_H / 2, footTxt, FS_FOOT, MUTED));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join('\n')}\n</svg>`;
}

/** Render a test card as a PNG data URL (rasterises the SVG via an offscreen canvas). */
export async function renderTestCardPNG(wall: Wall, wallIndex: number, project: Project, pixelRatio = 1): Promise<string> {
  const svg = generateTestCardSVG(wall, wallIndex, project);
  const profileMap = new Map(project.tileProfiles.map((p) => [p.id, p]));
  const bounds = wallBounds(wall, profileMap);
  const W = bounds.w || 1920;
  const H = bounds.h || 1080;

  return new Promise<string>((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = W * pixelRatio;
      canvas.height = H * pixelRatio;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
